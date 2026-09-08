import { describe, it, expect } from "vitest";
import { extractPressFinancialEstimates } from "../src/core/extraction/pressFinancialsExtractor.js";
import type { ExaSearchResultItem } from "../src/types/common.js";

function result(text: string, overrides: Partial<ExaSearchResultItem> = {}): ExaSearchResultItem {
  return { url: "https://entrackr.com/example", title: "example", publishedDate: null, author: null, text, score: 0, ...overrides };
}

describe("extractPressFinancialEstimates", () => {
  it("extracts revenue and a profit figure, real Entrackr-style phrasing", () => {
    const [estimate] = extractPressFinancialEstimates([
      result("D2C brand Plum's revenue crossed ₹500 crore in FY26, while net profit doubled to ₹45 crore, as per its RoC filings reviewed by Entrackr."),
    ]);
    expect(estimate.period).toBe("FY26");
    expect(estimate.revenueNormalized).toBe(500 * 1e7);
    expect(estimate.netResultType).toBe("profit");
    expect(estimate.netResultNormalized).toBe(45 * 1e7);
  });

  it("classifies a loss correctly and captures a negative growth rate", () => {
    const [estimate] = extractPressFinancialEstimates([
      result("Cars24 India's revenue declined by 23% in FY26 to ₹1,847 crore, while losses narrowed to ₹312 crore, the company's RoC filings showed."),
    ]);
    expect(estimate.netResultType).toBe("loss");
    expect(estimate.growthPercent).toBe(-23);
  });

  it("drops results with no revenue or profit/loss mention", () => {
    const estimates = extractPressFinancialEstimates([
      result("The company announced a new partnership today with no financial disclosure."),
    ]);
    expect(estimates).toHaveLength(0);
  });
});
