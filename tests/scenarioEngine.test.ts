import { describe, it, expect } from "vitest";
import { runScenarioAnalysis, runSensitivityGrid } from "../src/core/financial/scenarioEngine.js";
import type { DcfAssumptions } from "../src/core/financial/dcfEngine.js";

const baseAssumptions: DcfAssumptions = {
  baseRevenue: 1000,
  revenueGrowthPath: [0.15, 0.12, 0.1, 0.08, 0.06],
  ebitdaMarginPath: [0.2, 0.21, 0.22, 0.22, 0.22],
  daPctRevenue: 0.03,
  capexPctRevenue: 0.04,
  incrementalNwcPctRevenueChange: 0.1,
  taxRate: 0.25,
  wacc: 0.11,
  terminalGrowthRate: 0.04,
  netDebt: 200,
  sharesOutstanding: 100,
};

describe("runScenarioAnalysis", () => {
  it("produces a bull case with higher enterprise value than base, and bear lower", () => {
    const result = runScenarioAnalysis(
      baseAssumptions,
      { revenueGrowthDelta: 0.03, ebitdaMarginDelta: 0.02, waccDelta: -0.01 },
      { revenueGrowthDelta: -0.03, ebitdaMarginDelta: -0.02, waccDelta: 0.01 },
    );
    expect(result.bull.enterpriseValue).toBeGreaterThan(result.base.enterpriseValue);
    expect(result.bear.enterpriseValue).toBeLessThan(result.base.enterpriseValue);
  });

  it("surfaces issues on a case whose delta breaks wacc > terminalGrowthRate without throwing", () => {
    const result = runScenarioAnalysis(baseAssumptions, {}, { waccDelta: -0.08 });
    expect(result.bear.issues.length).toBeGreaterThan(0);
    expect(result.base.issues).toEqual([]);
  });
});

describe("runSensitivityGrid", () => {
  it("builds a grid with one row per row-axis value and one column per column-axis value", () => {
    const grid = runSensitivityGrid(
      baseAssumptions,
      { variable: "wacc", values: [0.09, 0.11, 0.13] },
      { variable: "terminalGrowthRate", values: [0.02, 0.04] },
    );
    expect(grid.cells).toHaveLength(3);
    expect(grid.cells[0]).toHaveLength(2);
  });

  it("marks a cell invalid instead of computing a distorted value when wacc <= terminalGrowthRate", () => {
    const grid = runSensitivityGrid(
      baseAssumptions,
      { variable: "wacc", values: [0.03, 0.11] },
      { variable: "terminalGrowthRate", values: [0.04] },
    );
    expect(grid.cells[0][0].valid).toBe(false);
    expect(grid.cells[0][0].fairValuePerShare).toBeNull();
    expect(grid.cells[1][0].valid).toBe(true);
  });

  it("throws if both axes vary the same variable", () => {
    expect(() =>
      runSensitivityGrid(baseAssumptions, { variable: "wacc", values: [0.1] }, { variable: "wacc", values: [0.11] }),
    ).toThrow();
  });

  it("lower wacc produces a higher fair value per share, all else equal", () => {
    const grid = runSensitivityGrid(
      baseAssumptions,
      { variable: "wacc", values: [0.09, 0.13] },
      { variable: "terminalGrowthRate", values: [0.04] },
    );
    expect(grid.cells[0][0].fairValuePerShare!).toBeGreaterThan(grid.cells[1][0].fairValuePerShare!);
  });
});
