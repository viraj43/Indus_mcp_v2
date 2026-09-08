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

/** A 3-stage DCF — explicit forecast, then a fade stage where growth
 * glides linearly down toward the terminal rate, then the terminal value —
 * the structure ICICI Securities' Vishal Mega Mart note actually uses
 * (Stage 1: FY24-34E explicit; Stage 2: FY34E-44E fade; Stage 3: terminal),
 * as opposed to the flat single-horizon-then-terminal shape of runDcf().
 * This is still built entirely from caller-supplied assumptions — no
 * growth/margin/WACC guessing happens here either; it only changes how
 * many years the model runs before hitting the terminal formula, which
 * matters for a company still far from steady-state (a 5-year DCF on a
 * company growing 30%+ understates it; jumping straight to a 6% terminal
 * growth rate after year 5 is the discontinuity a fade stage exists to
 * smooth out). */
export interface MultiStageDcfAssumptions {
  baseRevenue: number;
  /** Stage 1: one growth rate per explicit-forecast year. */
  stage1GrowthPath: number[];
  /** Stage 1: one EBITDA margin per explicit-forecast year (same length as stage1GrowthPath). */
  stage1EbitdaMarginPath: number[];
  /** Stage 2 (fade): how many years to glide from stage 1's final growth
   * rate down to terminalGrowthRate. EBITDA margin is held at stage 1's
   * final margin throughout the fade — a fading-growth company's margin
   * story is a separate, analyst-supplied view, not implied by growth. */
  fadeYears: number;
  daPctRevenue: number | number[];
  capexPctRevenue: number | number[];
  incrementalNwcPctRevenueChange: number | number[];
  taxRate: number;
  wacc: number;
  terminalGrowthRate: number;
  netDebt: number;
  sharesOutstanding?: number;
}

export interface MultiStageDcfResult extends DcfResult {
  stage1Years: number;
  fadeYears: number;
}

/** Builds the full stage1 + fade revenueGrowthPath/ebitdaMarginPath and
 * hands off to runDcf — the fade stage's growth rate at fade-year i glides
 * linearly from stage1's last rate to terminalGrowthRate. */
export function runMultiStageDcf(a: MultiStageDcfAssumptions): MultiStageDcfResult {
  const stage1Years = a.stage1GrowthPath.length;
  const lastStage1Growth = a.stage1GrowthPath[stage1Years - 1] ?? a.terminalGrowthRate;
  const lastStage1Margin = a.stage1EbitdaMarginPath[a.stage1EbitdaMarginPath.length - 1] ?? 0;

  const fadeGrowthPath: number[] = Array.from({ length: a.fadeYears }, (_, i) => {
    const t = a.fadeYears <= 1 ? 1 : (i + 1) / a.fadeYears;
    return lastStage1Growth + (a.terminalGrowthRate - lastStage1Growth) * t;
  });
  const fadeMarginPath: number[] = Array(a.fadeYears).fill(lastStage1Margin);

  const combined = runDcf({
    baseRevenue: a.baseRevenue,
    revenueGrowthPath: [...a.stage1GrowthPath, ...fadeGrowthPath],
    ebitdaMarginPath: [...a.stage1EbitdaMarginPath, ...fadeMarginPath],
    daPctRevenue: a.daPctRevenue,
    capexPctRevenue: a.capexPctRevenue,
    incrementalNwcPctRevenueChange: a.incrementalNwcPctRevenueChange,
    taxRate: a.taxRate,
    wacc: a.wacc,
    terminalGrowthRate: a.terminalGrowthRate,
    netDebt: a.netDebt,
    sharesOutstanding: a.sharesOutstanding,
  });

  return { ...combined, stage1Years, fadeYears: a.fadeYears };
}
