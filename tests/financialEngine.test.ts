import { describe, expect, it } from "vitest";
import {
  cagr,
  computeRatioSet,
  computeTrend,
  currentRatio,
  debtToEquity,
  ebitdaMargin,
  freeCashFlow,
  interestCoverageRatio,
  quickRatio,
  roce,
  roe,
  workingCapital,
  type FinancialStatement,
} from "../src/core/financial/financialEngine.js";

function makeStatement(overrides: Partial<FinancialStatement> = {}): FinancialStatement {
  return {
    period: "FY24",
    incomeStatement: { revenue: 1000, netProfit: 100 },
    balanceSheet: {},
    cashFlow: {},
    ...overrides,
  };
}

describe("cagr", () => {
  it("computes standard growth correctly", () => {
    // 100 -> 200 over 3 years
    expect(cagr(100, 200, 3)).toBeCloseTo(25.99, 1);
  });

  it("returns null for non-positive inputs", () => {
    expect(cagr(0, 200, 3)).toBeNull();
    expect(cagr(100, -50, 3)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
  });
});

describe("margin and return ratios", () => {
  it("computes ebitdaMargin as a percentage", () => {
    expect(ebitdaMargin(250, 1000)).toBe(25);
  });

  it("returns null when ebitda is undefined", () => {
    expect(ebitdaMargin(undefined, 1000)).toBeNull();
  });

  it("computes roe", () => {
    expect(roe(150, 1000)).toBe(15);
  });

  it("returns null roe when equity is zero (division guard)", () => {
    expect(roe(150, 0)).toBeNull();
  });

  it("computes roce net of current liabilities", () => {
    // ebit=200, totalAssets=2000, currentLiabilities=500 -> capitalEmployed=1500
    expect(roce(200, 2000, 500)).toBeCloseTo(13.33, 1);
  });
});

describe("liquidity and leverage ratios", () => {
  it("computes currentRatio", () => {
    expect(currentRatio(600, 300)).toBe(2);
  });

  it("computes quickRatio excluding inventory", () => {
    expect(quickRatio(600, 200, 300)).toBeCloseTo(1.33, 1);
  });

  it("computes debtToEquity", () => {
    expect(debtToEquity(400, 800)).toBe(0.5);
  });

  it("computes interestCoverageRatio", () => {
    expect(interestCoverageRatio(300, 50)).toBe(6);
  });

  it("returns null interestCoverageRatio when interest expense is zero", () => {
    expect(interestCoverageRatio(300, 0)).toBeNull();
  });
});

describe("cash and working capital", () => {
  it("computes workingCapital", () => {
    expect(workingCapital(600, 300)).toBe(300);
  });

  it("computes freeCashFlow net of capex", () => {
    expect(freeCashFlow(500, 120)).toBe(380);
  });

  it("returns null freeCashFlow when operating cash flow is missing", () => {
    expect(freeCashFlow(undefined, 120)).toBeNull();
  });
});

describe("computeRatioSet", () => {
  it("degrades gracefully with a minimal statement (revenue + netProfit only)", () => {
    const result = computeRatioSet(makeStatement());
    expect(result.netProfitMargin).toBe(10);
    expect(result.ebitdaMargin).toBeNull();
    expect(result.roe).toBeNull();
    expect(result.debtToEquity).toBeNull();
  });

  it("computes a full ratio set when all fields are present", () => {
    const result = computeRatioSet(
      makeStatement({
        incomeStatement: { revenue: 1000, costOfGoodsSold: 600, ebitda: 250, ebit: 200, netProfit: 120, interestExpense: 40 },
        balanceSheet: { totalAssets: 2000, totalEquity: 900, totalDebt: 450, currentAssets: 600, currentLiabilities: 300, inventory: 100 },
        cashFlow: { operatingCashFlow: 220, capex: 80 },
      }),
    );

    expect(result.grossProfitMargin).toBe(40);
    expect(result.ebitdaMargin).toBe(25);
    expect(result.netProfitMargin).toBe(12);
    expect(result.roe).toBeCloseTo(13.33, 1);
    expect(result.debtToEquity).toBe(0.5);
    expect(result.currentRatio).toBe(2);
    expect(result.freeCashFlow).toBe(140);
  });
});

describe("computeTrend", () => {
  it("returns nulls when fewer than two periods are given", () => {
    const trend = computeTrend([makeStatement({ period: "FY24" })]);
    expect(trend.revenueCagr).toBeNull();
    expect(trend.periodsAnalyzed).toBe(1);
  });

  it("computes revenue and profit CAGR across periods", () => {
    const trend = computeTrend([
      makeStatement({ period: "FY22", incomeStatement: { revenue: 100, netProfit: 10 } }),
      makeStatement({ period: "FY23", incomeStatement: { revenue: 150, netProfit: 18 } }),
      makeStatement({ period: "FY24", incomeStatement: { revenue: 200, netProfit: 24 } }),
    ]);
    expect(trend.periodsAnalyzed).toBe(3);
    expect(trend.revenueCagr).toBeCloseTo(41.42, 1);
    expect(trend.netProfitCagr).toBeCloseTo(54.92, 1);
  });
});
