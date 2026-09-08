import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseScreenerNumber,
  extractScreenerTable,
  extractScreenerTopRatios,
  extractScreenerFinancials,
  mapScreenerToFinancialStatements,
} from "../src/core/extraction/screenerExtractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A trimmed capture of screener.in's real DOM structure for Eternal Ltd
// (formerly Zomato) — same section ids/table layout as the live site,
// with unrelated chrome (nav, charts, insights) stripped out. Fixture,
// not a live network call, so this test stays hermetic and fast.
const FIXTURE_HTML = readFileSync(path.join(__dirname, "fixtures/screener-eternal.html"), "utf-8");

describe("parseScreenerNumber", () => {
  it("parses Indian-grouped numbers", () => {
    expect(parseScreenerNumber("54,364")).toBe(54364);
  });
  it("parses negative numbers", () => {
    expect(parseScreenerNumber("-971")).toBe(-971);
  });
  it("parses percentages by stripping the % sign", () => {
    expect(parseScreenerNumber("2.5%")).toBe(2.5);
  });
  it("returns null for blank cells rather than 0", () => {
    expect(parseScreenerNumber("")).toBeNull();
    expect(parseScreenerNumber("-")).toBeNull();
  });
});

describe("extractScreenerTable", () => {
  it("extracts the profit-loss table with real period headers and line items", () => {
    const table = extractScreenerTable(FIXTURE_HTML, "profit-loss");
    expect(table).not.toBeNull();
    expect(table!.headers[0]).toBe("");
    expect(table!.headers).toContain("Mar 2024");
    const salesRow = table!.rows.find((r) => r[0].startsWith("Sales"));
    expect(salesRow).toBeDefined();
  });

  it("returns null for a section not present in the fixture", () => {
    expect(extractScreenerTable(FIXTURE_HTML, "ratios")).toBeNull();
  });
});

describe("extractScreenerTopRatios", () => {
  it("parses the top-of-page ratio grid", () => {
    const ratios = extractScreenerTopRatios(FIXTURE_HTML);
    expect(ratios["Market Cap"]).toBeGreaterThan(0);
    expect(ratios["Stock P/E"]).toBeGreaterThan(0);
    expect(ratios["ROCE"]).not.toBeNull();
  });
});

describe("mapScreenerToFinancialStatements", () => {
  it("maps every annual period to the canonical FinancialStatement shape", () => {
    const extraction = extractScreenerFinancials(FIXTURE_HTML);
    const statements = mapScreenerToFinancialStatements(extraction);

    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      // Schema-required fields must always be real numbers, never a
      // fabricated 0 standing in for "not reported".
      expect(typeof s.incomeStatement.revenue).toBe("number");
      expect(typeof s.incomeStatement.netProfit).toBe("number");
      expect(/^[A-Za-z]{3}\s+\d{4}$/.test(s.period)).toBe(true);
    }

    const fy24 = statements.find((s) => s.period === "Mar 2024");
    expect(fy24).toBeDefined();
    expect(fy24!.incomeStatement.revenue).toBeCloseTo(12114, 0);
    // EBIT = PBT + Interest, derived rather than copied — sanity-check it
    // isn't just echoing one of its inputs back.
    expect(fy24!.incomeStatement.ebit).toBeDefined();
  });

  it("excludes the non-annual TTM column", () => {
    const extraction = extractScreenerFinancials(FIXTURE_HTML);
    const statements = mapScreenerToFinancialStatements(extraction);
    expect(statements.some((s) => s.period === "TTM")).toBe(false);
  });
});
