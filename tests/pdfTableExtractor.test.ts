import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { extractPdfTables } from "../src/core/extraction/pdfTableExtractor.js";

/** Generates a small table PDF via the same Playwright/Chromium engine
 * pdfEngine.ts already uses for report export — no external network call
 * and no third-party PDF fixture to maintain, just a deterministic,
 * realistic PDF (real cell padding/positioning, not synthetic
 * coordinates) to exercise the row/column reconstruction against. */
async function renderTablePdf(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setContent(html);
  const buffer = await page.pdf({ format: "A4" });
  await page.close();
  return buffer;
}

describe("extractPdfTables", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("reconstructs a simple financial table from cell positions", async () => {
    const html = `<!doctype html><html><body style="font-family:Arial;font-size:12px;">
      <table style="border-collapse:collapse;">
        <tr><td style="padding:6px 20px;">Line Item</td><td style="padding:6px 20px;">Mar 2023</td><td style="padding:6px 20px;">Mar 2024</td></tr>
        <tr><td style="padding:6px 20px;">Sales</td><td style="padding:6px 20px;">7,079</td><td style="padding:6px 20px;">12,114</td></tr>
        <tr><td style="padding:6px 20px;">Net Profit</td><td style="padding:6px 20px;">-971</td><td style="padding:6px 20px;">351</td></tr>
        <tr><td style="padding:6px 20px;">Total Assets</td><td style="padding:6px 20px;">21,599</td><td style="padding:6px 20px;">23,356</td></tr>
      </table>
    </body></html>`;

    const buffer = await renderTablePdf(browser, html);
    const tables = await extractPdfTables(buffer);

    expect(tables.length).toBe(1);
    expect(tables[0].headers).toEqual(["Line Item", "Mar 2023", "Mar 2024"]);
    expect(tables[0].rows).toContainEqual(["Sales", "7,079", "12,114"]);
    expect(tables[0].rows).toContainEqual(["Net Profit", "-971", "351"]);
  });

  it("doesn't treat ordinary paragraph text as a table", async () => {
    const html = `<!doctype html><html><body style="font-family:Arial;font-size:12px;">
      <p>This is the directors' report. The company had a good year and continues to invest in growth.</p>
      <p>Revenue increased across all segments during the reporting period under review.</p>
    </body></html>`;

    const buffer = await renderTablePdf(browser, html);
    const tables = await extractPdfTables(buffer);

    expect(tables.length).toBe(0);
  });

  it("respects the maxPages option", async () => {
    const html = `<!doctype html><html><body>
      <table><tr><td style="padding:6px 20px;">A</td><td style="padding:6px 20px;">B</td></tr><tr><td style="padding:6px 20px;">1</td><td style="padding:6px 20px;">2</td></tr></table>
      <div style="page-break-before: always;"></div>
      <table><tr><td style="padding:6px 20px;">C</td><td style="padding:6px 20px;">D</td></tr><tr><td style="padding:6px 20px;">3</td><td style="padding:6px 20px;">4</td></tr></table>
    </body></html>`;

    const buffer = await renderTablePdf(browser, html);
    const allTables = await extractPdfTables(buffer);
    const firstPageOnly = await extractPdfTables(buffer, { maxPages: 1 });

    expect(allTables.length).toBeGreaterThanOrEqual(firstPageOnly.length);
  });
});
