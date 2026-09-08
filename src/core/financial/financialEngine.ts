import { safeRound } from "../normalization/normalizer.js";

export interface IncomeStatement {
  revenue: number;
  costOfGoodsSold?: number;
  ebitda?: number;
  ebit?: number;
  netProfit: number;
  interestExpense?: number;
}

export interface BalanceSheet {
  totalAssets?: number;
  totalEquity?: number;
  totalDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  cash?: number;
}

export interface CashFlowStatement {
  operatingCashFlow?: number;
  capex?: number;
}

/** A single period's financials, grouped the way real financial
 * statements are: Income Statement, Balance Sheet, Cash Flow. Every
 * downstream engine (ratios, trend, plausibility checks) reads from this
 * one shape instead of a flat bag of fields. */
export interface FinancialStatement {
  period: string;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  metadata?: Record<string, unknown>;
}

export interface RatioSet {
  period: string;
  grossProfitMargin: number | null;
  ebitdaMargin: number | null;
  netProfitMargin: number | null;
  roe: number | null;
  roce: number | null;
  assetTurnover: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  interestCoverageRatio: number | null;
  workingCapital: number | null;
  freeCashFlow: number | null;
}

function safeDivide(numerator: number | undefined | null, denominator: number | undefined | null): number | null {
  if (numerator === undefined || numerator === null || !denominator) return null;
  return numerator / denominator;
}

function pct(value: number | null): number | null {
  return value === null ? null : safeRound(value * 100, 2);
}

/** Compound Annual Growth Rate between a beginning and ending value over
 * `years` periods. Returns null for non-positive inputs where CAGR is
 * mathematically undefined (e.g. a negative beginning value). */
export function cagr(beginValue: number, endValue: number, years: number): number | null {
  if (beginValue <= 0 || endValue <= 0 || years <= 0) return null;
  const rate = (endValue / beginValue) ** (1 / years) - 1;
  return pct(rate);
}

export function grossProfitMargin(revenue: number, costOfGoodsSold?: number): number | null {
  if (costOfGoodsSold === undefined) return null;
  return pct(safeDivide(revenue - costOfGoodsSold, revenue));
}

export function ebitdaMargin(ebitda: number | undefined, revenue: number): number | null {
  return pct(safeDivide(ebitda, revenue));
}

export function netProfitMargin(netProfit: number, revenue: number): number | null {
  return pct(safeDivide(netProfit, revenue));
}

export function roe(netProfit: number, totalEquity?: number): number | null {
  return pct(safeDivide(netProfit, totalEquity));
}

/** Return on Capital Employed = EBIT / (Total Assets - Current Liabilities). */
export function roce(ebit: number | undefined, totalAssets?: number, currentLiabilities?: number): number | null {
  if (ebit === undefined || totalAssets === undefined) return null;
  const capitalEmployed = totalAssets - (currentLiabilities ?? 0);
  return pct(safeDivide(ebit, capitalEmployed));
}

export function assetTurnover(revenue: number, totalAssets?: number): number | null {
  const ratio = safeDivide(revenue, totalAssets);
  return ratio === null ? null : safeRound(ratio, 2);
}

export function debtToEquity(totalDebt?: number, totalEquity?: number): number | null {
  const ratio = safeDivide(totalDebt, totalEquity);
  return ratio === null ? null : safeRound(ratio, 2);
}

export function currentRatio(currentAssets?: number, currentLiabilities?: number): number | null {
  const ratio = safeDivide(currentAssets, currentLiabilities);
  return ratio === null ? null : safeRound(ratio, 2);
}

export function quickRatio(currentAssets?: number, inventory?: number, currentLiabilities?: number): number | null {
  if (currentAssets === undefined) return null;
  const ratio = safeDivide(currentAssets - (inventory ?? 0), currentLiabilities);
  return ratio === null ? null : safeRound(ratio, 2);
}

export function interestCoverageRatio(ebit?: number, interestExpense?: number): number | null {
  const ratio = safeDivide(ebit, interestExpense);
  return ratio === null ? null : safeRound(ratio, 2);
}

export function workingCapital(currentAssets?: number, currentLiabilities?: number): number | null {
  if (currentAssets === undefined || currentLiabilities === undefined) return null;
  return safeRound(currentAssets - currentLiabilities, 2);
}

export function freeCashFlow(operatingCashFlow?: number, capex?: number): number | null {
  if (operatingCashFlow === undefined) return null;
  return safeRound(operatingCashFlow - (capex ?? 0), 2);
}

/** Computes the full deterministic ratio set for a single FinancialStatement.
 * Every ratio degrades to `null` (never throws, never guesses) when its
 * required inputs are missing from the source filing. */
export function computeRatioSet(statement: FinancialStatement): RatioSet {
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = statement;
  return {
    period: statement.period,
    grossProfitMargin: grossProfitMargin(is.revenue, is.costOfGoodsSold),
    ebitdaMargin: ebitdaMargin(is.ebitda, is.revenue),
    netProfitMargin: netProfitMargin(is.netProfit, is.revenue),
    roe: roe(is.netProfit, bs.totalEquity),
    roce: roce(is.ebit, bs.totalAssets, bs.currentLiabilities),
    assetTurnover: assetTurnover(is.revenue, bs.totalAssets),
    debtToEquity: debtToEquity(bs.totalDebt, bs.totalEquity),
    currentRatio: currentRatio(bs.currentAssets, bs.currentLiabilities),
    quickRatio: quickRatio(bs.currentAssets, bs.inventory, bs.currentLiabilities),
    interestCoverageRatio: interestCoverageRatio(is.ebit, is.interestExpense),
    workingCapital: workingCapital(bs.currentAssets, bs.currentLiabilities),
    freeCashFlow: freeCashFlow(cf.operatingCashFlow, cf.capex),
  };
}

export interface TrendAnalysis {
  revenueCagr: number | null;
  netProfitCagr: number | null;
  periodsAnalyzed: number;
}

/** Computes multi-period trend metrics (revenue/profit CAGR) from a
 * chronologically ordered list of statements (oldest first). */
export function computeTrend(statements: FinancialStatement[]): TrendAnalysis {
  if (statements.length < 2) {
    return { revenueCagr: null, netProfitCagr: null, periodsAnalyzed: statements.length };
  }
  const first = statements[0];
  const last = statements[statements.length - 1];
  const years = statements.length - 1;

  return {
    revenueCagr: cagr(first.incomeStatement.revenue, last.incomeStatement.revenue, years),
    netProfitCagr: cagr(first.incomeStatement.netProfit, last.incomeStatement.netProfit, years),
    periodsAnalyzed: statements.length,
  };
}
<<<<<<< HEAD

export interface ProjectedPeriod {
  period: string;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  netProfit: number | null;
  netProfitMargin: number | null;
}

export interface FinancialProjection {
  basis: string;
  revenueCagrApplied: number | null;
  netProfitCagrApplied: number | null;
  ebitdaMarginHeld: number | null;
  periods: ProjectedPeriod[];
  disclosure: string;
}

/** Mechanically extrapolates forward periods from a company's OWN historical
 * trend — no external assumption, no analyst judgment, nothing this server
 * can't defend as "your own numbers, carried forward at your own growth
 * rate." This is deliberately NOT a substitute for dcf_valuation or
 * scenario_analysis (those take explicit, stated assumptions and produce a
 * fair-value number); this produces a numbers-forward Revenue/EBITDA/PAT
 * table the way a "5-Year Financial Trend & Projection" appendix in a real
 * initiating-coverage note does, built purely off the historical CAGR
 * already computed by computeTrend, holding the latest observed EBITDA
 * margin flat (the most defensible default absent a stated re-rating
 * assumption). Returns null when there isn't enough history (fewer than 2
 * periods) to compute a CAGR from — this never invents a growth rate. */
export function projectFinancials(statements: FinancialStatement[], yearsForward = 3): FinancialProjection | null {
  if (statements.length < 2) return null;
  const trend = computeTrend(statements);
  if (trend.revenueCagr === null) return null;

  const last = statements[statements.length - 1];
  const revenueGrowthRate = trend.revenueCagr / 100;
  const netProfitGrowthRate = trend.netProfitCagr !== null ? trend.netProfitCagr / 100 : null;
  const lastEbitdaMargin = last.incomeStatement.ebitda !== undefined ? last.incomeStatement.ebitda / last.incomeStatement.revenue : null;
  const lastNetMargin = last.incomeStatement.netProfit / last.incomeStatement.revenue;

  const periods: ProjectedPeriod[] = [];
  let revenue = last.incomeStatement.revenue;
  let netProfit = last.incomeStatement.netProfit;

  for (let i = 1; i <= yearsForward; i++) {
    revenue = revenue * (1 + revenueGrowthRate);
    netProfit = netProfitGrowthRate !== null ? netProfit * (1 + netProfitGrowthRate) : revenue * lastNetMargin;
    const ebitda = lastEbitdaMargin !== null ? revenue * lastEbitdaMargin : null;
    periods.push({
      period: `${last.period} + ${i}Y (projected)`,
      revenue: safeRound(revenue, 2),
      ebitda: ebitda !== null ? safeRound(ebitda, 2) : null,
      ebitdaMargin: lastEbitdaMargin !== null ? pct(lastEbitdaMargin) : null,
      netProfit: safeRound(netProfit, 2),
      netProfitMargin: revenue > 0 ? pct(netProfit / revenue) : null,
    });
  }

  return {
    basis: `Mechanical extrapolation of the company's own trailing ${trend.periodsAnalyzed}-period CAGR — not a management guidance figure, sell-side estimate, or DCF output.`,
    revenueCagrApplied: trend.revenueCagr,
    netProfitCagrApplied: trend.netProfitCagr,
    ebitdaMarginHeld: lastEbitdaMargin !== null ? pct(lastEbitdaMargin) : null,
    periods,
    disclosure:
      "These are trend-extrapolated projections, computed by holding this company's own trailing revenue/profit CAGR and latest EBITDA margin constant — they are not management guidance, a sell-side estimate, or a DCF output, and should be read as a mechanical baseline only. For an assumption-driven fair-value projection, see dcf_valuation and scenario_analysis.",
  };
}
=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
