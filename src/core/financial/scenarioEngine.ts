import { runDcf, validateAssumptions, type DcfAssumptions, type DcfResult } from "./dcfEngine.js";
import { safeRound } from "../normalization/normalizer.js";

/** Wraps dcfEngine to produce Base/Bull/Bear cases and a 2D sensitivity
 * grid — still pure arithmetic over caller-supplied deltas, not a
 * forecast this engine invents. A "bull" or "bear" case here is just the
 * base assumption set perturbed by the deltas the caller chose to test;
 * the engine has no opinion on whether those deltas are realistic. */

export interface ScenarioDelta {
  /** Added to every value in revenueGrowthPath (decimal, e.g. +0.03). */
  revenueGrowthDelta?: number;
  /** Added to every value in ebitdaMarginPath (decimal). */
  ebitdaMarginDelta?: number;
  /** Added to wacc (decimal). */
  waccDelta?: number;
  /** Added to terminalGrowthRate (decimal). */
  terminalGrowthDelta?: number;
}

export interface ScenarioSet {
  base: DcfResult;
  bull: DcfResult;
  bear: DcfResult;
}

function applyDelta(base: DcfAssumptions, delta: ScenarioDelta): DcfAssumptions {
  return {
    ...base,
    revenueGrowthPath: base.revenueGrowthPath.map((g) => g + (delta.revenueGrowthDelta ?? 0)),
    ebitdaMarginPath: base.ebitdaMarginPath.map((m) => m + (delta.ebitdaMarginDelta ?? 0)),
    wacc: base.wacc + (delta.waccDelta ?? 0),
    terminalGrowthRate: base.terminalGrowthRate + (delta.terminalGrowthDelta ?? 0),
  };
}

/** Runs the same DCF three times: as given (base), and perturbed by the
 * caller-supplied bull/bear deltas. Each case independently reports its
 * own validateAssumptions() issues (e.g. a bear-case WACC bump that pushes
 * wacc <= terminalGrowthRate) rather than silently producing a bad number. */
export function runScenarioAnalysis(baseAssumptions: DcfAssumptions, bullDelta: ScenarioDelta, bearDelta: ScenarioDelta): ScenarioSet {
  return {
    base: runDcf(baseAssumptions),
    bull: runDcf(applyDelta(baseAssumptions, bullDelta)),
    bear: runDcf(applyDelta(baseAssumptions, bearDelta)),
  };
}

export interface SensitivityAxis {
  /** Which assumption this axis perturbs. */
  variable: "wacc" | "terminalGrowthRate";
  /** Absolute values to test for this variable (not deltas) — e.g.
   * [0.09, 0.10, 0.11, 0.12, 0.13] for a WACC axis. */
  values: number[];
}

export interface SensitivityCell {
  rowValue: number;
  columnValue: number;
  fairValuePerShare: number | null;
  enterpriseValue: number;
  valid: boolean;
  issues: string[];
}

export interface SensitivityGrid {
  rowVariable: SensitivityAxis["variable"];
  columnVariable: SensitivityAxis["variable"];
  cells: SensitivityCell[][];
}

/** Builds a 2D grid (typically WACC x terminal growth rate) of fair-value
 * outcomes by re-running the DCF once per cell with that cell's pair of
 * absolute values substituted in. A cell where wacc <= terminalGrowthRate
 * is marked invalid rather than silently showing a distorted number. */
export function runSensitivityGrid(baseAssumptions: DcfAssumptions, rowAxis: SensitivityAxis, columnAxis: SensitivityAxis): SensitivityGrid {
  if (rowAxis.variable === columnAxis.variable) {
    throw new Error("Sensitivity grid row and column must vary different assumptions.");
  }

  const cells: SensitivityCell[][] = rowAxis.values.map((rowValue) =>
    columnAxis.values.map((columnValue) => {
      const assumptions: DcfAssumptions = {
        ...baseAssumptions,
        [rowAxis.variable]: rowValue,
        [columnAxis.variable]: columnValue,
      };
      const issues = validateAssumptions(assumptions);
      if (issues.length > 0) {
        return { rowValue, columnValue, fairValuePerShare: null, enterpriseValue: 0, valid: false, issues };
      }
      const result = runDcf(assumptions);
      return {
        rowValue,
        columnValue,
        fairValuePerShare: result.fairValuePerShare,
        enterpriseValue: safeRound(result.enterpriseValue, 2),
        valid: true,
        issues: [],
      };
    }),
  );

  return { rowVariable: rowAxis.variable, columnVariable: columnAxis.variable, cells };
}
