import { describe, expect, it } from "vitest";
import { scoreSource } from "../src/core/citations/sourcePriority.js";

describe("scoreSource", () => {
  it("assigns official_filing tier to MCA domains", () => {
    const score = scoreSource("https://www.mca.gov.in/some-filing", null);
    expect(score.tier).toBe("official_filing");
    expect(score.confidenceScore).toBeGreaterThanOrEqual(0.9);
  });

  it("assigns industry_report tier to consulting domains", () => {
    const score = scoreSource("https://www.mckinsey.com/insights/x", new Date().toISOString());
    expect(score.tier).toBe("industry_report");
  });

  it("assigns news tier to wire/press domains", () => {
    const score = scoreSource("https://www.reuters.com/business/x", new Date().toISOString());
    expect(score.tier).toBe("news");
  });

  it("matches regional subdomains of a registered source (uk.linkedin.com -> company)", () => {
    const score = scoreSource("https://uk.linkedin.com/company/acme", new Date().toISOString());
    expect(score.tier).toBe("official_company");
  });

  it("falls back to blog tier for unregistered domains", () => {
    const score = scoreSource("https://randomblog.example/post", new Date().toISOString());
    expect(score.tier).toBe("blog");
    expect(score.authority).toBeLessThan(0.85);
  });

  it("ranks official_filing above blog for otherwise-identical recency", () => {
    const now = new Date().toISOString();
    const filing = scoreSource("https://www.mca.gov.in/x", now);
    const blog = scoreSource("https://randomblog.example/x", now);
    expect(filing.confidenceScore).toBeGreaterThan(blog.confidenceScore);
  });

  it("applies a larger penalty to documents older than three years", () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 5);
    const fresh = scoreSource("https://www.mckinsey.com/insights/x", new Date().toISOString());
    const stale = scoreSource("https://www.mckinsey.com/insights/x", old.toISOString());
    expect(stale.recencyPenalty).toBeGreaterThan(fresh.recencyPenalty);
    expect(stale.confidenceScore).toBeLessThan(fresh.confidenceScore);
  });

  it("treats a missing publication date as a small penalty, not zero", () => {
    const withDate = scoreSource("https://www.reuters.com/x", new Date().toISOString());
    const withoutDate = scoreSource("https://www.reuters.com/x", null);
    expect(withoutDate.recencyPenalty).toBeGreaterThan(0);
    expect(withoutDate.confidenceScore).toBeLessThanOrEqual(withDate.confidenceScore);
  });
});
