import { runDcf, type DcfAssumptions, type DcfResult } from "../financial/dcfEngine.js";
import { runScenarioAnalysis, runSensitivityGrid, type ScenarioSet, type SensitivityGrid } from "../financial/scenarioEngine.js";
import { computeTrend, type FinancialStatement } from "../financial/financialEngine.js";
import { safeRound } from "../normalization/normalizer.js";

/** Auto-runs a DCF + scenario analysis for generate_institutional_report
 * using DEFAULT assumptions derived as transparently as possible from the
 * company's own real filed numbers (screener.in), falling back to a small
 * set of clearly-labeled, disclosed macro/sector defaults only where the
 * company's own filings genuinely don't say (D&A%, capex%, NWC%, WACC,
 * terminal growth, tax rate). Nothing here is invented as company-specific
 * fact — every non-company-derived input is named in `disclosures` and the
 * whole result is framed as a default-assumption baseline, not the
 * analyst's final call (see dcf_valuation/scenario_analysis for a caller
 * who wants to override any of this with their own view — that remains
 * the "Valuation Call" ai_interpretation section's job). This exists
 * because the alternative — silently omitting quant valuation from the
 * composite report, or having the calling model invent DCF inputs ad hoc
 * per report — is worse than a documented, overridable default. */

const DEFAULT_WACC = 0.11; // documented proxy: broad India large/mid-cap cost of capital, not this company's beta-derived figure
const DEFAULT_TERMINAL_GROWTH = 0.055; // documented proxy: long-run India nominal GDP growth
const DEFAULT_TAX_RATE = 0.2517; // India's statutory base corporate tax rate under the concessional regime (Section 115BAA)
const DEFAULT_DA_PCT_REVENUE = 0.03;
const DEFAULT_CAPEX_PCT_REVENUE = 0.035;
const DEFAULT_NWC_PCT_REVENUE_CHANGE = 0.02;
const GROWTH_CLAMP_MIN = -0.3;
const GROWTH_CLAMP_MAX = 0.6;
const FORECAST_YEARS = 5;

function findRatio(marketRatios: Record<string, number | null> | undefined, patterns: RegExp[]): number | null {
  if (!marketRatios) return null;
  for (const [key, value] of Object.entries(marketRatios)) {
    if (value === null) continue;
    if (patterns.some((p) => p.test(key))) return value;
  }
  return null;
}

export interface AutoValuationResult {
  assumptions: DcfAssumptions;
  disclosures: string[];
  dcf: DcfResult;
  scenario: ScenarioSet;
  sensitivityGrid: SensitivityGrid | null;
  currentMarketPrice: number | null;
}

/** Returns null when there isn't enough real data to derive assumptions at
 * all (fewer than 1 statement, or the latest period is missing EBITDA) —
 * this never fabricates a margin or growth rate from nothing. */
export function buildAutoValuation(statements: FinancialStatement[], marketRatios?: Record<string, number | null>): AutoValuationResult | null {
  if (statements.length === 0) return null;
  const last = statements[statements.length - 1];
  if (last.incomeStatement.ebitda === undefined || last.incomeStatement.revenue <= 0) return null;

  const disclosures: string[] = [];
  const trend = computeTrend(statements);

  const rawGrowth = trend.revenueCagr !== null ? trend.revenueCagr / 100 : null;
  const startGrowth = rawGrowth === null ? DEFAULT_TERMINAL_GROWTH : Math.min(GROWTH_CLAMP_MAX, Math.max(GROWTH_CLAMP_MIN, rawGrowth));
  if (rawGrowth === null) {
    disclosures.push(`Only one historical period was available, so no trailing revenue CAGR could be computed — used the terminal growth rate (${(DEFAULT_TERMINAL_GROWTH * 100).toFixed(1)}%) as the starting growth assumption instead of a company-derived figure.`);
  } else if (rawGrowth !== startGrowth) {
    disclosures.push(`Trailing revenue CAGR (${(rawGrowth * 100).toFixed(1)}%) was clamped to ${(startGrowth * 100).toFixed(1)}% to keep the forecast within a defensible band — the raw historical CAGR is not carried forward unadjusted.`);
  } else {
    disclosures.push(`Year-1 revenue growth (${(startGrowth * 100).toFixed(1)}%) is this company's own trailing ${trend.periodsAnalyzed}-period revenue CAGR, sourced from its own filed financials — not a default.`);
  }

  // Taper linearly from the (clamped) trailing CAGR down to terminal growth
  // over the forecast horizon — a company growing faster than the economy
  // long-run can't do so forever, and a flat-CAGR-to-infinity path is the
  // single most common DCF modeling error.
  const revenueGrowthPath: number[] = Array.from({ length: FORECAST_YEARS }, (_, i) => {
    const t = i / (FORECAST_YEARS - 1);
    return safeRound(startGrowth + (DEFAULT_TERMINAL_GROWTH - startGrowth) * t, 4);
  });

  const lastEbitdaMargin = last.incomeStatement.ebitda! / last.incomeStatement.revenue;
  const ebitdaMarginPath: number[] = Array(FORECAST_YEARS).fill(safeRound(lastEbitdaMargin, 4));
  disclosures.push(`EBITDA margin (${(lastEbitdaMargin * 100).toFixed(1)}%) is held flat at this company's latest reported margin across the forecast — no margin-expansion or compression view is assumed.`);

  let daPctRevenue = DEFAULT_DA_PCT_REVENUE;
  if (last.incomeStatement.ebitda !== undefined && last.incomeStatement.ebit !== undefined) {
    const derived = (last.incomeStatement.ebitda - last.incomeStatement.ebit) / last.incomeStatement.revenue;
    if (derived > 0 && derived < 0.3) {
      daPctRevenue = safeRound(derived, 4);
      disclosures.push(`D&A (${(daPctRevenue * 100).toFixed(1)}% of revenue) derived from this company's own latest EBITDA-EBIT gap, not a default.`);
    }
  }
  if (daPctRevenue === DEFAULT_DA_PCT_REVENUE) {
    disclosures.push(`D&A defaulted to ${(DEFAULT_DA_PCT_REVENUE * 100).toFixed(1)}% of revenue — this company's filings didn't separately disclose EBIT, so no company-specific figure could be derived.`);
  }

  let capexPctRevenue = DEFAULT_CAPEX_PCT_REVENUE;
  if (last.cashFlow.capex !== undefined && last.cashFlow.capex > 0) {
    const derived = last.cashFlow.capex / last.incomeStatement.revenue;
    if (derived > 0 && derived < 0.5) {
      capexPctRevenue = safeRound(derived, 4);
      disclosures.push(`Capex (${(capexPctRevenue * 100).toFixed(1)}% of revenue) derived from this company's own latest cash flow statement, not a default.`);
    }
  }
  if (capexPctRevenue === DEFAULT_CAPEX_PCT_REVENUE) {
    disclosures.push(`Capex defaulted to ${(DEFAULT_CAPEX_PCT_REVENUE * 100).toFixed(1)}% of revenue — this company's cash flow statement didn't disclose capex separately.`);
  }

  disclosures.push(`Incremental working capital defaulted to ${(DEFAULT_NWC_PCT_REVENUE_CHANGE * 100).toFixed(1)}% of revenue change — working-capital detail is essentially never available from a condensed public filing summary.`);
  disclosures.push(`Tax rate defaulted to ${(DEFAULT_TAX_RATE * 100).toFixed(2)}% — India's statutory base corporate rate under the concessional regime (Section 115BAA), not this company's actual effective rate.`);
  disclosures.push(`WACC defaulted to ${(DEFAULT_WACC * 100).toFixed(1)}% — a broad India large/mid-cap cost-of-capital proxy, not a beta-derived, company-specific discount rate.`);
  disclosures.push(`Terminal growth rate defaulted to ${(DEFAULT_TERMINAL_GROWTH * 100).toFixed(1)}% — a proxy for long-run India nominal GDP growth.`);

  const netDebt = last.balanceSheet.totalDebt ?? 0;
  if (last.balanceSheet.totalDebt === undefined) {
    disclosures.push("Net debt defaulted to 0 — total debt was not available from this company's condensed balance sheet.");
  } else {
    disclosures.push(`Net debt (Rs ${netDebt} Cr) uses this company's own reported total debt; cash was not separately available from the condensed balance sheet, so it isn't netted off — this net-debt figure may be slightly overstated.`);
  }

  const marketCap = findRatio(marketRatios, [/^Market Cap$/i]);
  const currentPrice = findRatio(marketRatios, [/^Current Price$/i]);
  let sharesOutstanding: number | undefined;
  if (marketCap !== null && currentPrice !== null && currentPrice > 0) {
    sharesOutstanding = safeRound(marketCap / currentPrice, 4);
    disclosures.push(`Shares outstanding (${sharesOutstanding} Cr shares) derived from this company's real Market Cap / Current Price on screener.in, not supplied or guessed.`);
  } else {
    disclosures.push("Shares outstanding could not be derived (Market Cap or Current Price wasn't available from screener.in) — this DCF reports enterprise/equity value only, not a per-share fair value.");
  }

  const assumptions: DcfAssumptions = {
    baseRevenue: last.incomeStatement.revenue,
    revenueGrowthPath,
    ebitdaMarginPath,
    daPctRevenue,
    capexPctRevenue,
    incrementalNwcPctRevenueChange: DEFAULT_NWC_PCT_REVENUE_CHANGE,
    taxRate: DEFAULT_TAX_RATE,
    wacc: DEFAULT_WACC,
    terminalGrowthRate: DEFAULT_TERMINAL_GROWTH,
    netDebt,
    sharesOutstanding,
  };

  const dcf = runDcf(assumptions);
  const scenario = runScenarioAnalysis(
    assumptions,
    { revenueGrowthDelta: 0.03, waccDelta: -0.01 },
    { revenueGrowthDelta: -0.03, waccDelta: 0.01 },
  );

  let sensitivityGrid: SensitivityGrid | null = null;
  try {
    sensitivityGrid = runSensitivityGrid(
      assumptions,
      { variable: "wacc", values: [DEFAULT_WACC - 0.02, DEFAULT_WACC - 0.01, DEFAULT_WACC, DEFAULT_WACC + 0.01, DEFAULT_WACC + 0.02] },
      { variable: "terminalGrowthRate", values: [DEFAULT_TERMINAL_GROWTH - 0.015, DEFAULT_TERMINAL_GROWTH - 0.005, DEFAULT_TERMINAL_GROWTH + 0.005, DEFAULT_TERMINAL_GROWTH + 0.015] },
    );
  } catch {
    sensitivityGrid = null;
  }

  return { assumptions, disclosures, dcf, scenario, sensitivityGrid, currentMarketPrice: currentPrice };
}
