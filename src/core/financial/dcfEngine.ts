import { safeRound } from "../normalization/normalizer.js";

/** Mechanical, explicit-assumption DCF. This engine does no forecasting of
 * its own — every growth/margin/discount-rate input is supplied by the
 * caller (typically the calling LLM, reasoning from the company's actual
 * financials and sector context) and is echoed straight back in the
 * output so nothing here can be mistaken for a fact the tool "found." The
 * only thing this engine owns is doing the arithmetic correctly and
 * consistently — exactly the "MCP computes, LLM judges" split used
 * everywhere else in this codebase (see peerRanking.ts, analystNote.ts).
 *
 * A DCF is only as good as its assumptions, so the design intentionally
 * refuses to guess growth rates, margins, or a WACC on the caller's
 * behalf, and refuses to launder a bad WACC/terminal-growth pair into a
 * number that looks precise — see validateAssumptions(). */

export interface DcfAssumptions {
  /** Most recent actual/base-year revenue this projection starts from. */
  baseRevenue: number;
  /** One growth rate (decimal, e.g. 0.12 for 12%) per forecast year, oldest
   * first. Length of this array determines the forecast horizon. */
  revenueGrowthPath: number[];
  /** One EBITDA margin (decimal) per forecast year — same length as
   * revenueGrowthPath. */
  ebitdaMarginPath: number[];
  /** Depreciation & amortization as a % of revenue (decimal), applied
   * uniformly across the forecast — pass a per-year array instead of a
   * single number if the caller has a more granular view. */
  daPctRevenue: number | number[];
  /** Capital expenditure as a % of revenue (decimal). */
  capexPctRevenue: number | number[];
  /** Incremental net working capital investment as a % of the *change* in
   * revenue year-over-year (decimal). */
  incrementalNwcPctRevenueChange: number | number[];
  /** Effective cash tax rate (decimal) applied to EBIT; no tax benefit is
   * assumed on a negative EBIT year (tax floored at 0). */
  taxRate: number;
  /** Weighted Average Cost of Capital (decimal) — the discount rate. */
  wacc: number;
  /** Perpetuity growth rate (decimal) used for the terminal value. Must be
   * strictly less than wacc or the model is mathematically undefined. */
  terminalGrowthRate: number;
  /** Net debt (total debt - cash) as of the valuation date, for the
   * enterprise-value -> equity-value bridge. */
  netDebt: number;
  /** Diluted shares outstanding, for a per-share fair value. Omit to get
   * enterprise/equity value only. */
  sharesOutstanding?: number;
}

export interface DcfYearProjection {
  year: number;
  revenue: number;
  ebitda: number;
  ebit: number;
  tax: number;
  nopat: number;
  depreciationAmortization: number;
  capex: number;
  incrementalNwc: number;
  freeCashFlowToFirm: number;
  discountFactor: number;
  presentValue: number;
}

export interface DcfResult {
  assumptions: DcfAssumptions;
  projections: DcfYearProjection[];
  sumOfPvFcff: number;
  terminalValue: number;
  presentValueOfTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number | null;
  issues: string[];
}

/** Checks the assumption set for combinations that would make the model
 * mathematically undefined or nonsensical, rather than silently producing
 * a number. Returns a list of human-readable issues; an empty list means
 * the assumptions are internally consistent (not that they're realistic —
 * this engine has no view on that). */
export function validateAssumptions(a: DcfAssumptions): string[] {
  const issues: string[] = [];
  const horizon = a.revenueGrowthPath.length;

  if (horizon === 0) issues.push("revenueGrowthPath must have at least one forecast year.");
  if (a.ebitdaMarginPath.length !== horizon) {
    issues.push(`ebitdaMarginPath length (${a.ebitdaMarginPath.length}) must match revenueGrowthPath length (${horizon}).`);
  }
  if (a.baseRevenue <= 0) issues.push("baseRevenue must be positive.");
  if (a.wacc <= a.terminalGrowthRate) {
    issues.push(
      `WACC (${a.wacc}) must be strictly greater than the terminal growth rate (${a.terminalGrowthRate}) — otherwise the terminal value formula divides by zero or a negative number.`,
    );
  }
  if (a.wacc <= 0 || a.wacc >= 1) issues.push("wacc should be a decimal between 0 and 1 (e.g. 0.11 for 11%), not a percentage.");
  if (a.taxRate < 0 || a.taxRate > 1) issues.push("taxRate should be a decimal between 0 and 1.");

  return issues;
}

function pathValueAt(pathOrScalar: number | number[], index: number): number {
  return Array.isArray(pathOrScalar) ? (pathOrScalar[index] ?? pathOrScalar[pathOrScalar.length - 1]) : pathOrScalar;
}

/** Runs the mechanical DCF for one full assumption set. Throws only if
 * validateAssumptions() would report a structural issue that makes
 * discounting impossible (call validateAssumptions() first to surface
 * those to the caller instead of catching an exception). */
export function runDcf(a: DcfAssumptions): DcfResult {
  const issues = validateAssumptions(a);
  const horizon = a.revenueGrowthPath.length;

  const projections: DcfYearProjection[] = [];
  let previousRevenue = a.baseRevenue;
  let sumOfPvFcff = 0;

  for (let i = 0; i < horizon; i++) {
    const growth = a.revenueGrowthPath[i];
    const margin = a.ebitdaMarginPath[i] ?? 0;
    const revenue = previousRevenue * (1 + growth);
    const revenueChange = revenue - previousRevenue;

    const ebitda = revenue * margin;
    const da = revenue * pathValueAt(a.daPctRevenue, i);
    const ebit = ebitda - da;
    const tax = Math.max(ebit, 0) * a.taxRate;
    const nopat = ebit - tax;
    const capex = revenue * pathValueAt(a.capexPctRevenue, i);
    const incrementalNwc = revenueChange * pathValueAt(a.incrementalNwcPctRevenueChange, i);

    const fcff = nopat + da - capex - incrementalNwc;
    const discountFactor = 1 / (1 + a.wacc) ** (i + 1);
    const presentValue = fcff * discountFactor;
    sumOfPvFcff += presentValue;

    projections.push({
      year: i + 1,
      revenue: safeRound(revenue, 2),
      ebitda: safeRound(ebitda, 2),
      ebit: safeRound(ebit, 2),
      tax: safeRound(tax, 2),
      nopat: safeRound(nopat, 2),
      depreciationAmortization: safeRound(da, 2),
      capex: safeRound(capex, 2),
      incrementalNwc: safeRound(incrementalNwc, 2),
      freeCashFlowToFirm: safeRound(fcff, 2),
      discountFactor: safeRound(discountFactor, 6),
      presentValue: safeRound(presentValue, 2),
    });

    previousRevenue = revenue;
  }

  const lastProjection = projections[projections.length - 1];
  const terminalValue =
    lastProjection && a.wacc > a.terminalGrowthRate
      ? (lastProjection.freeCashFlowToFirm * (1 + a.terminalGrowthRate)) / (a.wacc - a.terminalGrowthRate)
      : 0;
  const presentValueOfTerminalValue = lastProjection ? terminalValue * lastProjection.discountFactor : 0;

  const enterpriseValue = sumOfPvFcff + presentValueOfTerminalValue;
  const equityValue = enterpriseValue - a.netDebt;
  const fairValuePerShare = a.sharesOutstanding ? safeRound(equityValue / a.sharesOutstanding, 2) : null;

  return {
    assumptions: a,
    projections,
    sumOfPvFcff: safeRound(sumOfPvFcff, 2),
    terminalValue: safeRound(terminalValue, 2),
    presentValueOfTerminalValue: safeRound(presentValueOfTerminalValue, 2),
    enterpriseValue: safeRound(enterpriseValue, 2),
    equityValue: safeRound(equityValue, 2),
    fairValuePerShare,
    issues,
  };
}
