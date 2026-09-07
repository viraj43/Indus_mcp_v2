import { describe, expect, it } from "vitest";
import { checkFinancialPlausibility, isValidCIN } from "../src/core/quality/validationEngine.js";

describe("isValidCIN", () => {
  it("accepts a well-formed CIN", () => {
    expect(isValidCIN("L22210MH1995PLC084781")).toBe(true);
  });

  it("rejects tokens of the right length but wrong shape", () => {
    expect(isValidCIN("AAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });

  it("rejects tokens of the wrong length", () => {
    expect(isValidCIN("L22210MH1995PLC08478")).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidCIN("  L22210MH1995PLC084781  ")).toBe(true);
  });
});

describe("checkFinancialPlausibility", () => {
  it("returns no issues for a consistent statement", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 1000, ebitda: 250, netProfit: 120 },
      balanceSheet: { totalAssets: 2000, totalEquity: 900, totalDebt: 450 },
    });
    expect(issues).toEqual([]);
  });

  it("flags non-positive revenue", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 0, netProfit: 0 },
      balanceSheet: {},
    });
    expect(issues.some((i) => i.field === "incomeStatement.revenue")).toBe(true);
  });

  it("flags EBITDA exceeding revenue", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 100, ebitda: 150, netProfit: 10 },
      balanceSheet: {},
    });
    expect(issues.some((i) => i.field === "incomeStatement.ebitda")).toBe(true);
  });

  it("flags net profit exceeding EBITDA", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 1000, ebitda: 100, netProfit: 150 },
      balanceSheet: {},
    });
    expect(issues.some((i) => i.field === "incomeStatement.netProfit")).toBe(true);
  });

  it("flags negative total debt", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 1000, netProfit: 100 },
      balanceSheet: { totalDebt: -10 },
    });
    expect(issues.some((i) => i.field === "balanceSheet.totalDebt")).toBe(true);
  });

  it("flags equity exceeding assets", () => {
    const issues = checkFinancialPlausibility({
      incomeStatement: { revenue: 1000, netProfit: 100 },
      balanceSheet: { totalAssets: 500, totalEquity: 600 },
    });
    expect(issues.some((i) => i.field === "balanceSheet.totalEquity")).toBe(true);
  });
});
