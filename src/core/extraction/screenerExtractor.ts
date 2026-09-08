import { loadHtml } from "./htmlExtractor.js";
import type { ExtractedTable } from "./htmlExtractor.js";
import type { FinancialStatement } from "../financial/financialEngine.js";

/** Structured extractor for screener.in's company page — the primary fix
 * for the "financial_statements never returns real numbers" problem. Unlike
 * the generic `<table>` scraper in htmlExtractor.ts (which has to guess
 * which of a page's tables is the P&L via fuzzy label matching),
 * screener.in ships a stable, predictable DOM: `#profit-loss`,
 * `#balance-sheet`, `#cash-flow`, `#quarters`, and `#ratios` are each a
 * `<section>` containing exactly one financial table, and the page is
 * server-rendered (no JS execution needed — confirmed by fetching it with
 * a plain `fetch()`). This is what lets us go from "not_available" to a
 * real multi-period FinancialStatement[] for any listed Indian company
 * screener.in covers. */

const SCREENER_SECTION_IDS = ["profit-loss", "balance-sheet", "cash-flow", "quarters", "ratios"] as const;
export type ScreenerSectionId = (typeof SCREENER_SECTION_IDS)[number];

/** Parses screener.in's number formatting: Indian-digit-grouped
 * ("1,64,832"), negative with a leading "-", percentage suffixes, and the
 * "&nbsp;+" / "+" row-expander suffix screener appends to some labels
 * (stripped before this function ever sees the value — see
 * extractScreenerTable). Returns null for blank cells (screener leaves
 * early years blank when a company didn't report a line yet, e.g. Cash
 * Flow before FY20 above) rather than coercing them to 0. */
export function parseScreenerNumber(raw: string): number | null {
  const cleaned = raw.replace(/[₹,%]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}

function cleanLabel(label: string): string {
  return label
    .replace(/&nbsp;/g, " ")
    .replace(/\s*\+\s*$/, "")
    .trim();
}

/** Extracts one screener.in section's table (profit-loss, balance-sheet,
 * cash-flow, quarters, or ratios) as a generic ExtractedTable — the first
 * row is the period-header row, every other row is a labeled line item.
 * Returns null when the section isn't present on the page (e.g. a company
 * screener doesn't track "ratios" for). */
export function extractScreenerTable(html: string, sectionId: ScreenerSectionId): ExtractedTable | null {
  const $ = loadHtml(html);
  const $section = $(`section#${sectionId}`);
  if ($section.length === 0) return null;

  const $table = $section.find("table").first();
  if ($table.length === 0) return null;

  const rows: string[][] = [];
  $table.find("tr").each((_, rowEl) => {
    const cells: string[] = [];
    $(rowEl)
      .find("th, td")
      .each((__, cellEl) => {
        cells.push(cleanLabel($(cellEl).text()));
      });
    if (cells.length) rows.push(cells);
  });

  if (rows.length === 0) return null;
  const [headers, ...body] = rows;
  // Drop trailing summary rows screener appends below the data table
  // (e.g. "Compounded Sales Growth" / "10 Years: / 5 Years: ..." under
  // profit-loss) — anything whose first cell doesn't read as a line-item
  // label with numeric columns matching the header count is noise for our
  // purposes and is better left to a dedicated "growth metrics" reader if
  // ever needed.
  const dataRows = body.filter((row) => row.length === headers.length && row[0] !== "");
  return { headers, rows: dataRows };
}

/** Parses screener.in's top-of-page ratio grid
 * (`<ul id="top-ratios">` — Market Cap, Current Price, Stock P/E, Book
 * Value, ROCE, ROE, Dividend Yield, Face Value), which is the fastest,
 * most reliable source of point-in-time valuation multiples for a listed
 * company — far more trustworthy than pattern-matching a market-cap
 * mention out of a news snippet (see listed_peer_comparison's current
 * regex approach). */
export function extractScreenerTopRatios(html: string): Record<string, number | null> {
  const $ = loadHtml(html);
  const ratios: Record<string, number | null> = {};

  $("ul#top-ratios > li").each((_, li) => {
    const $li = $(li);
    const name = cleanLabel($li.find("span.name").first().text());
    if (!name) return;
    // A ratio can have one number (e.g. "Stock P/E") or two (e.g.
    // "High / Low" -> 368 / 213); join multiple .number spans with "/" so
    // both cases round-trip through parseScreenerNumber cleanly for the
    // single-value case and stay inspectable for the two-value case.
    const numbers = $li
      .find("span.number")
      .map((__, num) => $(num).text().trim())
      .get();
    ratios[name] = numbers.length === 1 ? parseScreenerNumber(numbers[0]) : null;
    if (numbers.length > 1) {
      numbers.forEach((n, i) => {
        ratios[`${name} (${i + 1})`] = parseScreenerNumber(n);
      });
    }
  });

  return ratios;
}

export interface ScreenerExtraction {
  profitLoss: ExtractedTable | null;
  balanceSheet: ExtractedTable | null;
  cashFlow: ExtractedTable | null;
  quarters: ExtractedTable | null;
  ratios: ExtractedTable | null;
  topRatios: Record<string, number | null>;
}

/** Pulls every structured section off a screener.in company page in one
 * pass. Callers that only need valuation multiples (e.g.
 * listed_peer_comparison) can use `topRatios` alone without paying for the
 * full financial-statement mapping below. */
export function extractScreenerFinancials(html: string): ScreenerExtraction {
  return {
    profitLoss: extractScreenerTable(html, "profit-loss"),
    balanceSheet: extractScreenerTable(html, "balance-sheet"),
    cashFlow: extractScreenerTable(html, "cash-flow"),
    quarters: extractScreenerTable(html, "quarters"),
    ratios: extractScreenerTable(html, "ratios"),
    topRatios: extractScreenerTopRatios(html),
  };
}

/** A period column counts as a real annual period if its header looks
 * like "Mon YYYY" (screener's format for FY-end columns) — this excludes
 * the trailing "TTM" column (trailing-twelve-months isn't a fixed period
 * and would misalign with the balance-sheet/cash-flow tables, which don't
 * have a TTM column at all) and any blank header. */
function isAnnualPeriodHeader(header: string): boolean {
  return /^[A-Za-z]{3}\s+\d{4}$/.test(header.trim());
}

function rowByLabel(table: ExtractedTable | null, labelPattern: RegExp): (number | null)[] | null {
  if (!table) return null;
  const row = table.rows.find((r) => labelPattern.test(r[0]));
  if (!row) return null;
  return row.slice(1).map(parseScreenerNumber);
}

/** Maps a screener.in extraction into the canonical FinancialStatement[]
 * shape (see types/schemas.ts / core/financial/financialEngine.ts) so
 * financial_statements' output can feed ratio_analysis (and the DCF/comps
 * engines) directly, instead of the caller having to reshape an ad hoc
 * lineItems record by hand.
 *
 * Mapping notes (screener's condensed statements don't 1:1 match a full
 * IFRS/Ind-AS breakout, so every approximation is stated here rather than
 * silently baked in):
 *   - ebitda <- "Operating Profit" (screener's Sales − Expenses, i.e.
 *     operating profit before Other Income) — a standard EBITDA proxy for
 *     a services/platform business without large D&A embedded above the
 *     operating-profit line.
 *   - ebit <- Profit Before Tax + Interest (adding back interest expense
 *     to PBT, which already has D&A deducted) — the standard EBIT
 *     definition when a line-item EBIT isn't published separately.
 *   - totalEquity <- Equity Capital + Reserves.
 *   - capex is backed out algebraically from Cash-from-Investing's
 *     component rows when possible: screener publishes "Free Cash Flow"
 *     directly (CFO minus capex, by screener's own definition), so
 *     capex = operatingCashFlow − freeCashFlow when both are present,
 *     rather than us re-deriving it from investing activities (which
 *     include M&A/investment purchases beyond capex).
 *   - currentAssets/currentLiabilities/inventory/cash are NOT available
 *     from screener's condensed balance sheet (it only shows Fixed
 *     Assets/CWIP/Investments/Other Assets, not a current/non-current
 *     split) — left undefined, which correctly degrades
 *     currentRatio/quickRatio/workingCapital to null in financialEngine
 *     rather than fabricating a split.
 */
export function mapScreenerToFinancialStatements(extraction: ScreenerExtraction): FinancialStatement[] {
  const { profitLoss, balanceSheet, cashFlow } = extraction;
  if (!profitLoss) return [];

  const periodHeaders = profitLoss.headers.slice(1);
  const annualIndices = periodHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => isAnnualPeriodHeader(h));

  if (annualIndices.length === 0) return [];

  const sales = rowByLabel(profitLoss, /^Sales/);
  const operatingProfit = rowByLabel(profitLoss, /^Operating Profit/);
  const otherIncome = rowByLabel(profitLoss, /^Other Income/);
  const interest = rowByLabel(profitLoss, /^Interest/);
  const depreciation = rowByLabel(profitLoss, /^Depreciation/);
  const pbt = rowByLabel(profitLoss, /^Profit before tax/);
  const netProfit = rowByLabel(profitLoss, /^Net Profit/);

  const equityCapital = rowByLabel(balanceSheet, /^Equity Capital/);
  const reserves = rowByLabel(balanceSheet, /^Reserves/);
  const borrowings = rowByLabel(balanceSheet, /^Borrowings/);
  const totalAssets = rowByLabel(balanceSheet, /^Total Assets/);

  const operatingCashFlow = rowByLabel(cashFlow, /^Cash from Operating Activity/);
  const freeCashFlow = rowByLabel(cashFlow, /^Free Cash Flow/);

  return annualIndices
    .filter(({ i }) => sales?.[i] !== null && sales?.[i] !== undefined && netProfit?.[i] !== null && netProfit?.[i] !== undefined)
    .map(({ h, i }) => {
    const at = (arr: (number | null)[] | null): number | undefined => {
      const v = arr?.[i];
      return v === null || v === undefined ? undefined : v;
    };

    // Safe by construction: the filter above guarantees both are present
    // for every {h, i} reaching this point — required because
    // FinancialStatementSchema's revenue/netProfit fields are non-optional,
    // and a genuinely missing period must be dropped, not defaulted to 0
    // (screener leaves early pre-IPO years blank; a 0 there would silently
    // read as "no revenue" instead of "not reported").
    const revenue = at(sales)!;
    const netProfitValue = at(netProfit)!;
    const pbtValue = at(pbt);
    const interestValue = at(interest);
    const ebit = pbtValue !== undefined && interestValue !== undefined ? pbtValue + interestValue : undefined;
    const equity =
      at(equityCapital) !== undefined || at(reserves) !== undefined
        ? (at(equityCapital) ?? 0) + (at(reserves) ?? 0)
        : undefined;
    const cfo = at(operatingCashFlow);
    const fcf = at(freeCashFlow);
    const capex = cfo !== undefined && fcf !== undefined ? cfo - fcf : undefined;

    return {
      period: h.trim(),
      incomeStatement: {
        revenue,
        ebitda: at(operatingProfit),
        ebit,
        netProfit: netProfitValue,
        interestExpense: interestValue,
      },
      balanceSheet: {
        totalAssets: at(totalAssets),
        totalEquity: equity,
        totalDebt: at(borrowings),
      },
      cashFlow: {
        operatingCashFlow: cfo,
        capex,
      },
      metadata: {
        source: "screener.in",
        otherIncome: at(otherIncome),
        depreciation: at(depreciation),
        note: "ebitda is screener's 'Operating Profit' (Sales − Expenses, before Other Income) — a standard proxy, not a line-item-verified EBITDA. currentAssets/currentLiabilities/inventory/cash are unavailable from screener's condensed balance sheet.",
      },
    } satisfies FinancialStatement;
  });
}

/** A quarter column counts as real if its header looks like "Mon YYYY"
 * (screener's format for quarter-end columns, same shape as the annual
 * check above but there's no "TTM" trailer to exclude on the #quarters
 * table). */
function isQuarterPeriodHeader(header: string): boolean {
  return /^[A-Za-z]{3}\s+\d{4}$/.test(header.trim());
}

/** Maps screener.in's #quarters section (its own "Quarterly Results" table
 * — the same one every real initiating-coverage note shows as a trailing
 * 8-quarter trend) into the canonical FinancialStatement[] shape, same
 * mapping logic as mapScreenerToFinancialStatements but reading Sales/
 * Operating Profit/Net Profit off the quarterly table instead of the
 * annual one. Screener's quarterly table doesn't carry a balance sheet or
 * cash flow (those are annual-only), so this only ever populates
 * incomeStatement — balanceSheet/cashFlow are intentionally left empty
 * rather than reusing stale annual figures against a quarterly period. */
export function mapScreenerQuarters(quarters: ExtractedTable | null): FinancialStatement[] {
  if (!quarters) return [];

  const periodHeaders = quarters.headers.slice(1);
  const quarterIndices = periodHeaders.map((h, i) => ({ h, i })).filter(({ h }) => isQuarterPeriodHeader(h));
  if (quarterIndices.length === 0) return [];

  const sales = rowByLabel(quarters, /^Sales/);
  const operatingProfit = rowByLabel(quarters, /^Operating Profit/);
  const interest = rowByLabel(quarters, /^Interest/);
  const pbt = rowByLabel(quarters, /^Profit before tax/);
  const netProfit = rowByLabel(quarters, /^Net Profit/);

  return quarterIndices
    .filter(({ i }) => sales?.[i] !== null && sales?.[i] !== undefined && netProfit?.[i] !== null && netProfit?.[i] !== undefined)
    .map(({ h, i }) => {
      const at = (arr: (number | null)[] | null): number | undefined => {
        const v = arr?.[i];
        return v === null || v === undefined ? undefined : v;
      };
      const pbtValue = at(pbt);
      const interestValue = at(interest);
      const ebit = pbtValue !== undefined && interestValue !== undefined ? pbtValue + interestValue : undefined;

      return {
        period: h.trim(),
        incomeStatement: {
          revenue: at(sales)!,
          ebitda: at(operatingProfit),
          ebit,
          netProfit: at(netProfit)!,
          interestExpense: interestValue,
        },
        balanceSheet: {},
        cashFlow: {},
        metadata: { source: "screener.in", granularity: "quarterly" },
      } satisfies FinancialStatement;
    });
}
