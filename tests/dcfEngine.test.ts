import { describe, it, expect } from "vitest";
import { runDcf, validateAssumptions, type DcfAssumptions } from "../src/core/financial/dcfEngine.js";

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

describe("validateAssumptions", () => {
  it("reports no issues for a well-formed assumption set", () => {
    expect(validateAssumptions(baseAssumptions)).toEqual([]);
  });

  it("flags wacc <= terminalGrowthRate", () => {
    const issues = validateAssumptions({ ...baseAssumptions, wacc: 0.03, terminalGrowthRate: 0.04 });
    expect(issues.some((i) => i.includes("terminal growth"))).toBe(true);
  });

  it("flags mismatched path lengths", () => {
    const issues = validateAssumptions({ ...baseAssumptions, ebitdaMarginPath: [0.2, 0.21] });
    expect(issues.some((i) => i.includes("ebitdaMarginPath"))).toBe(true);
  });

  it("flags non-positive base revenue", () => {
    expect(validateAssumptions({ ...baseAssumptions, baseRevenue: 0 }).length).toBeGreaterThan(0);
  });
});

describe("runDcf", () => {
  it("produces one projection row per forecast year with growing revenue", () => {
    const result = runDcf(baseAssumptions);
    expect(result.projections).toHaveLength(5);
    expect(result.projections[0].revenue).toBeCloseTo(1000 * 1.15, 1);
    expect(result.projections[4].revenue).toBeGreaterThan(result.projections[0].revenue);
  });

  it("computes a positive enterprise value and a sensible equity bridge", () => {
    const result = runDcf(baseAssumptions);
    expect(result.enterpriseValue).toBeGreaterThan(0);
    expect(result.equityValue).toBeCloseTo(result.enterpriseValue - baseAssumptions.netDebt, 2);
    expect(result.fairValuePerShare).toBeCloseTo(result.equityValue / 100, 2);
  });

  it("discount factors strictly decrease year over year", () => {
    const result = runDcf(baseAssumptions);
    for (let i = 1; i < result.projections.length; i++) {
      expect(result.projections[i].discountFactor).toBeLessThan(result.projections[i - 1].discountFactor);
    }
  });

  it("returns null fairValuePerShare when sharesOutstanding is omitted", () => {
    const { sharesOutstanding: _unused, ...rest } = baseAssumptions;
    const result = runDcf(rest as DcfAssumptions);
    expect(result.fairValuePerShare).toBeNull();
  });

  it("still returns a numeric (if nonsensical) result while surfacing issues for a broken assumption set, rather than throwing", () => {
    const result = runDcf({ ...baseAssumptions, wacc: 0.03, terminalGrowthRate: 0.04 });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.enterpriseValue)).toBe(true);
  });

  it("supports per-year arrays for daPctRevenue/capexPctRevenue/incrementalNwcPctRevenueChange", () => {
    const result = runDcf({
      ...baseAssumptions,
      daPctRevenue: [0.03, 0.03, 0.03, 0.03, 0.03],
      capexPctRevenue: [0.05, 0.045, 0.04, 0.04, 0.04],
      incrementalNwcPctRevenueChange: [0.1, 0.1, 0.1, 0.1, 0.1],
    });
    expect(result.projections).toHaveLength(5);
  });
});
