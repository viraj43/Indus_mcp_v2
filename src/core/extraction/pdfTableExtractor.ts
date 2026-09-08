// pdfjs-dist's Node ("legacy") build — no DOM/canvas dependency, works
// against a raw Uint8Array. This is what makes real table recovery from
// filing PDFs possible: pdf-parse (used elsewhere for keyword-context
// extraction) only returns flattened text with layout discarded, so a
// number and its column header can end up arbitrarily far apart in the
// text stream. pdfjs's getTextContent() instead gives every text run's
// exact (x, y) position, which is what a table actually is: text aligned
// into position, not marked-up structure (a PDF has no <table> tag).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { childLogger } from "../../logger.js";
import type { ExtractedTable } from "./htmlExtractor.js";

const log = childLogger("pdfTableExtractor");

interface PositionedItem {
  text: string;
  x: number;
  y: number;
}

const ROW_Y_TOLERANCE = 2.5;
/** Two text runs are treated as different table columns when the gap
 * between them exceeds this many PDF points — roughly two character
 * widths at typical filing-PDF body text sizes (9-11pt), enough to not
 * split a single wrapped word but wide enough to catch real column
 * boundaries (which usually have far larger gaps: cell padding plus
 * right/left alignment). This is a heuristic threshold, not a structural
 * guarantee — dense multi-column PDFs may need tuning, which is why every
 * table this produces should still be sanity-checked against
 * checkFinancialPlausibility() rather than trusted blindly. */
const COLUMN_GAP_THRESHOLD = 12;
/** A run of positioned rows only counts as "a table" once at least this
 * many consecutive rows each populate 2+ columns — this is what separates
 * real tabular data from ordinary paragraph text (whose lines mostly
 * share one left-margin column and would otherwise masquerade as a
 * single-column "table"). */
const MIN_TABLE_ROWS = 2;

function groupIntoRows(items: PositionedItem[]): PositionedItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y); // PDF y grows upward; top of page first
  const rows: PositionedItem[][] = [];
  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].y - item.y) <= ROW_Y_TOLERANCE) {
      lastRow.push(item);
    } else {
      rows.push([item]);
    }
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/** Clusters every item's x-start into column anchors via simple gap-based
 * 1D clustering: sort all x-positions seen on the page, and start a new
 * column whenever the gap to the previous value exceeds
 * COLUMN_GAP_THRESHOLD. Global (page-wide) rather than per-row so a
 * column's position stays consistent across rows even when some rows are
 * missing a value for it (matching how a real table is laid out). */
function detectColumnAnchors(rows: PositionedItem[][]): number[] {
  const allX = rows.flatMap((row) => row.map((item) => item.x)).sort((a, b) => a - b);
  const anchors: number[] = [];
  for (const x of allX) {
    if (anchors.length === 0 || x - anchors[anchors.length - 1] > COLUMN_GAP_THRESHOLD) {
      anchors.push(x);
    }
  }
  return anchors;
}

function nearestAnchorIndex(x: number, anchors: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const dist = Math.abs(anchors[i] - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Reconstructs whatever tables appear on one page into an
 * ExtractedTable[] using the row/column grid built from (x, y)
 * positions — same output shape as htmlExtractor's extractTables(), so
 * parseFinancialTable()/findLineItem() work identically regardless of
 * whether the source document was HTML or a PDF. */
function reconstructTablesFromRows(rows: PositionedItem[][]): ExtractedTable[] {
  const anchors = detectColumnAnchors(rows);
  if (anchors.length < 2) return [];

  const grid: string[][] = rows.map((row) => {
    const cells: string[][] = Array.from({ length: anchors.length }, () => []);
    for (const item of row) {
      const text = item.text.trim();
      if (!text) continue;
      cells[nearestAnchorIndex(item.x, anchors)].push(text);
    }
    return cells.map((c) => c.join(" ").trim());
  });

  const populatedColumnCounts = grid.map((row) => row.filter((cell) => cell !== "").length);

  const tables: ExtractedTable[] = [];
  let blockStart = -1;
  for (let i = 0; i <= grid.length; i++) {
    const isTableRow = i < grid.length && populatedColumnCounts[i] >= 2;
    if (isTableRow && blockStart === -1) {
      blockStart = i;
    } else if (!isTableRow && blockStart !== -1) {
      const blockRows = grid.slice(blockStart, i);
      if (blockRows.length >= MIN_TABLE_ROWS) {
        const [headers, ...body] = blockRows;
        tables.push({ headers, rows: body });
      }
      blockStart = -1;
    }
  }
  return tables;
}

export interface PdfTableExtractionOptions {
  /** Safety cap on how many pages to run positional reconstruction over —
   * quarterly-results PDFs are typically under 30 pages, but a full
   * annual report can run past 150; scanning all of them page-by-page
   * with pdfjs is comparatively expensive, so financial_statements.ts
   * defaults this conservatively and relies on the keyword-context
   * fallback (pdfExtractor.ts) for anything beyond it. */
  maxPages?: number;
}

/** Extracts every reasonably-confident table from a PDF buffer via text
 * positioning — the deep-extraction fallback for filing PDFs (BSE/NSE
 * results, annual reports) that don't publish an HTML/screener.in
 * equivalent. Best-effort: column detection is a heuristic, not a
 * guarantee, so callers should still run recovered figures through
 * checkFinancialPlausibility() before trusting them. */
export async function extractPdfTables(buffer: Buffer, options: PdfTableExtractionOptions = {}): Promise<ExtractedTable[]> {
  const maxPages = options.maxPages ?? 40;
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const tables: ExtractedTable[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items: PositionedItem[] = content.items
        .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && typeof item.str === "string")
        .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
        .filter((item) => item.text.trim() !== "");

      if (items.length === 0) continue;
      tables.push(...reconstructTablesFromRows(groupIntoRows(items)));
    } catch (err) {
      log.debug({ err, pageNum }, "Failed to extract text content from PDF page");
    }
  }

  return tables;
}
