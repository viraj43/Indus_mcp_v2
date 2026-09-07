import { parseFinancialNumber } from "../normalization/normalizer.js";
import type { ExtractedTable } from "./htmlExtractor.js";

export interface FinancialLineItem {
  label: string;
  values: (number | null)[];
}

export interface ParsedFinancialTable {
  periods: string[];
  lineItems: FinancialLineItem[];
}

/** Converts a generic header/rows table into a financial line-item table:
 * first column is treated as the line-item label, remaining columns as
 * period values (e.g. FY23, FY24), parsed into numbers. */
export function parseFinancialTable(table: ExtractedTable): ParsedFinancialTable {
  const periods = table.headers.slice(1);
  const lineItems: FinancialLineItem[] = table.rows
    .filter((row) => row.length > 1 && row[0])
    .map((row) => ({
      label: row[0],
      values: row.slice(1).map((cell) => parseFinancialNumber(cell)),
    }));

  return { periods, lineItems };
}

/** Finds a line item by fuzzy label match (case-insensitive substring),
 * e.g. locating "Total Revenue" vs "Revenue from Operations". */
export function findLineItem(table: ParsedFinancialTable, labelPattern: RegExp): FinancialLineItem | null {
  return table.lineItems.find((item) => labelPattern.test(item.label)) ?? null;
}
