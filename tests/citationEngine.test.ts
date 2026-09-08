import { describe, expect, it } from "vitest";
import { aggregateConfidence, buildCitations, dedupeCitations } from "../src/core/citations/citationEngine.js";
import type { ExaSearchResultItem } from "../src/types/common.js";

function makeResult(overrides: Partial<ExaSearchResultItem>): ExaSearchResultItem {
  return {
    url: "https://example.com/a",
    title: "Example",
    publishedDate: new Date().toISOString(),
    author: null,
    text: "Some evidence text about the company.",
    score: 0,
    ...overrides,
  };
}

describe("buildCitations", () => {
  it("scores a trusted tier-1 domain highly", () => {
    const [citation] = buildCitations([makeResult({ url: "https://rbi.org.in/report" })]);
    expect(citation.source).toBe("rbi.org.in");
    expect(citation.confidenceScore).toBeGreaterThanOrEqual(0.9);
  });

  it("scores an unlisted/unknown domain lower than a trusted one", () => {
    const [citation] = buildCitations([makeResult({ url: "https://randomblog.example" })]);
    expect(citation.confidenceScore).toBeLessThan(0.9);
  });

  it("penalizes stale publication dates", () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 5);
    const [citation] = buildCitations([
      makeResult({ url: "https://mckinsey.com/insights/old", publishedDate: old.toISOString() }),
    ]);
    const [fresh] = buildCitations([makeResult({ url: "https://mckinsey.com/insights/new" })]);
    expect(citation.confidenceScore).toBeLessThan(fresh.confidenceScore);
  });

  it("truncates evidence snippets to the requested length", () => {
    const longText = "x".repeat(1000);
    const [citation] = buildCitations([makeResult({ text: longText })], 50);
    expect(citation.evidenceSnippet.length).toBeLessThanOrEqual(50);
  });
});

describe("dedupeCitations", () => {
  it("keeps only the highest-confidence citation per URL", () => {
    const citations = buildCitations([
      makeResult({ url: "https://reuters.com/story" }),
      makeResult({ url: "https://reuters.com/story", publishedDate: null }),
    ]);
    const deduped = dedupeCitations(citations);
    expect(deduped).toHaveLength(1);
  });

  it("sorts remaining citations by confidence descending", () => {
    const citations = buildCitations([
      makeResult({ url: "https://randomblog.example" }),
      makeResult({ url: "https://rbi.org.in/report" }),
    ]);
    const deduped = dedupeCitations(citations);
    expect(deduped[0].source).toBe("rbi.org.in");
  });
});

describe("aggregateConfidence", () => {
  it("returns 0 for no citations", () => {
    expect(aggregateConfidence([])).toBe(0);
  });

  it("discounts single-source corroboration", () => {
    const [single] = buildCitations([makeResult({ url: "https://rbi.org.in/report" })]);
    const singleScore = aggregateConfidence([single]);
    const multi = buildCitations([
      makeResult({ url: "https://rbi.org.in/a" }),
      makeResult({ url: "https://rbi.org.in/b" }),
      makeResult({ url: "https://rbi.org.in/c" }),
    ]);
    const multiScore = aggregateConfidence(multi);
    expect(singleScore).toBeLessThan(multiScore);
  });
});
