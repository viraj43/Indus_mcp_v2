import { describe, it, expect } from "vitest";
import { screenRedFlags } from "../src/core/financial/redFlagEngine.js";

describe("screenRedFlags", () => {
  it("returns a clean result when no evidence is supplied", () => {
    const result = screenRedFlags({});
    expect(result.totalFlags).toBe(0);
    expect(result.overallSeverity).toBe("clean");
  });

  it("flags a litigation case with regulators mentioned as high severity", () => {
    const result = screenRedFlags({
      litigationCases: [{ title: "SEBI order against XYZ", url: "https://example.com", caseReference: "WP 123/2024", regulatorsMentioned: ["SEBI"] }],
    });
    expect(result.flags[0].severity).toBe("high");
    expect(result.overallSeverity).toBe("high");
  });

  it("flags a litigation case with no named regulator as medium severity", () => {
    const result = screenRedFlags({
      litigationCases: [{ title: "Civil suit filed", url: "https://example.com", caseReference: null, regulatorsMentioned: [] }],
    });
    expect(result.flags[0].severity).toBe("medium");
  });

  it("escalates negative press to medium at the threshold and stays low below it", () => {
    const low = screenRedFlags({ negativeNewsCount: 1 });
    const medium = screenRedFlags({ negativeNewsCount: 3 });
    expect(low.flags[0].severity).toBe("low");
    expect(medium.flags[0].severity).toBe("medium");
  });

  it("emits one medium flag per plausibility issue, tagged with its period", () => {
    const result = screenRedFlags({
      plausibilityIssuesByPeriod: {
        FY23: [{ field: "incomeStatement.ebitda", message: "EBITDA cannot exceed total revenue." }],
      },
    });
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].description).toContain("FY23");
    expect(result.flags[0].severity).toBe("medium");
  });

  it("flags promoter regulatory hits as high severity", () => {
    const result = screenRedFlags({ promoterRegulatoryHits: 2 });
    expect(result.flags[0].severity).toBe("high");
  });

  it("flags a long funding gap as medium severity", () => {
    const result = screenRedFlags({ monthsSinceLastFunding: 30 });
    expect(result.flags[0].severity).toBe("medium");
    const clean = screenRedFlags({ monthsSinceLastFunding: 6 });
    expect(clean.totalFlags).toBe(0);
  });

  it("overallSeverity reflects the highest severity across all categories", () => {
    const result = screenRedFlags({ negativeNewsCount: 1, promoterRegulatoryHits: 1 });
    expect(result.overallSeverity).toBe("high");
    expect(result.bySeverity.high).toBe(1);
    expect(result.bySeverity.low).toBe(1);
  });
});
