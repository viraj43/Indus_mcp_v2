import { describe, expect, it } from "vitest";
import { toHtml, toJson, toMarkdown, summarizeReport } from "../src/core/reports/reportEngine.js";
import type { ReportInput } from "../src/types/schemas.js";
import type { Citation } from "../src/types/common.js";

function makeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    source: "example.com",
    url: "https://example.com/acme",
    publicationDate: "2026-01-01",
    evidenceSnippet: "Acme reported strong growth.",
    tier: "news",
    authority: 0.8,
    recencyPenalty: 0,
    confidenceScore: 0.9,
    ...overrides,
  };
}

const sampleReport: ReportInput = {
  title: "Acme Corp — Company Profile",
  subtitle: "Institutional research brief",
  companyName: "Acme Corp",
  generatedAt: "2026-08-01T00:00:00.000Z",
  sections: [
    {
      title: "Overview",
      summary: "Acme Corp is a diversified industrial company.",
      tables: [],
      citations: [makeCitation()],
      confidence: 0.9,
      metadata: {},
    },
    {
      title: "Financial Highlights",
      summary: "Revenue and profit grew year over year.",
      tables: [{ headers: ["Metric", "FY24"], rows: [["Revenue", 1000], ["Net Profit", 120]] }],
      citations: [makeCitation({ url: "https://example.com/financials", source: "example.com" })],
      confidence: 0.85,
      metadata: {},
    },
  ],
};

describe("toMarkdown", () => {
  it("includes title, sections, table rows, per-section sources, and citations", () => {
    const md = toMarkdown(sampleReport);
    expect(md).toContain("# Acme Corp — Company Profile");
    expect(md).toContain("## Overview");
    expect(md).toContain("| Revenue | 1000 |");
    expect(md).toContain("Sources:");
    expect(md).toContain("example.com");
    expect(md).toContain("## Citations");
  });
});

describe("toHtml", () => {
  it("renders the cover page, TOC, a data table, and per-section confidence", () => {
    const html = toHtml(sampleReport);
    expect(html).toContain('<h1 class="cover-title">Acme Corp — Company Profile</h1>');
    expect(html).toContain('<table class="data-table">');
    expect(html).toContain("Acme Corp is a diversified industrial company.");
    expect(html).toContain("confidence 0.9");
    expect(html).toContain('<h1 class="toc-heading">Table of Contents</h1>');
    expect(html).toContain('<span class="toc-title">Overview</span>');
  });

  it("escapes unsafe characters in section summary", () => {
    const withUnsafe: ReportInput = {
      ...sampleReport,
      sections: [{ title: "Risk", summary: "<script>alert(1)</script>", tables: [], citations: [], confidence: 0.5, metadata: {} }],
    };
    const html = toHtml(withUnsafe);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("wraps a section in a colored callout when metadata.tone is set", () => {
    const withTone: ReportInput = {
      ...sampleReport,
      sections: [
        {
          title: "Risk Flags",
          summary: "Open charges exceed revenue.",
          tables: [],
          citations: [],
          confidence: 0.7,
          metadata: { tone: "danger", label: "Risk Assessment" },
        },
      ],
    };
    const html = toHtml(withTone);
    expect(html).toContain('<div class="callout callout-danger">');
    expect(html).toContain("Risk Assessment");
  });

  it("renders markdown bullet lists and bold text in section summaries", () => {
    const withMarkdown: ReportInput = {
      ...sampleReport,
      sections: [
        {
          title: "Highlights",
          summary: "**Revenue:** grew fast.\n- Point one\n- Point two",
          tables: [],
          citations: [],
          confidence: 0.8,
          metadata: {},
        },
      ],
    };
    const html = toHtml(withMarkdown);
    expect(html).toContain("<strong>Revenue:</strong>");
    expect(html).toContain("<ul><li>Point one</li><li>Point two</li></ul>");
  });
});

describe("toJson", () => {
  it("fills in generatedAt when absent and preserves data otherwise", () => {
    const { generatedAt, ...rest } = sampleReport;
    const json = toJson(rest);
    expect(json.generatedAt).toBeTruthy();
    expect(json.title).toBe(sampleReport.title);
  });
});

describe("summarizeReport", () => {
  it("flattens and dedupes citations across sections", () => {
    const { citations, confidence } = summarizeReport(sampleReport);
    expect(citations).toHaveLength(2);
    expect(confidence).toBeGreaterThan(0);
  });

  it("returns zero confidence when no section has citations", () => {
    const noCitations: ReportInput = {
      ...sampleReport,
      sections: [{ title: "Overview", summary: "x", tables: [], citations: [], confidence: 0.5, metadata: {} }],
    };
    const { citations, confidence } = summarizeReport(noCitations);
    expect(citations).toHaveLength(0);
    expect(confidence).toBe(0);
  });
});
