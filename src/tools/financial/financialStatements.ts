import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { extractTables } from "../../core/extraction/htmlExtractor.js";
import { parseFinancialTable, findLineItem, type ParsedFinancialTable } from "../../core/extraction/tableExtractor.js";
import { extractPdfText, findKeywordContexts } from "../../core/extraction/pdfExtractor.js";
import { extractPdfTables } from "../../core/extraction/pdfTableExtractor.js";
import { extractScreenerFinancials, mapScreenerToFinancialStatements, mapScreenerQuarters } from "../../core/extraction/screenerExtractor.js";
import { findScreenerSlug, fetchScreenerPage } from "../../core/financial/screenerLookup.js";
import { extractPressFinancialEstimates, type PressFinancialEstimate } from "../../core/extraction/pressFinancialsExtractor.js";
import { fetchDocument } from "../../core/pipeline/fetchDocument.js";
import { computeRatioSet, computeTrend, projectFinancials, type FinancialStatement, type RatioSet, type TrendAnalysis, type FinancialProjection } from "../../core/financial/financialEngine.js";
import { checkFinancialPlausibility, type PlausibilityIssue } from "../../core/quality/validationEngine.js";
import { scoreSource } from "../../core/citations/sourcePriority.js";
import { dedupeCitations, aggregateConfidence } from "../../core/citations/citationEngine.js";
import { buildResponse, errorResponse, type ToolResult, type Citation } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import { labelDomains } from "../../sources/labels.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
  includeRatios: z
    .boolean()
    .default(true)
    .describe("Compute ratio_analysis's full ratio set + multi-period CAGR trend inline once statements are extracted, so callers don't need a second round-trip."),
});

export const financialStatementsMeta: ToolMeta = {
  name: "financial_statements",
  category: "financial",
  description: "Locates a company's financial statements via a source waterfall (screener.in structured data, then filing-PDF table recovery, then generic HTML/PDF extraction, then — for unlisted companies — press-reported RoC-filing digests) and returns them as ready-to-use FinancialStatement[] (optionally with ratios/trend computed inline), or a clearly-labeled unaudited estimate when only press coverage is available.",
  inputs: ["context.company", "context.listed", "includeRatios"],
  outputs: ["status", "statements", "ratios", "trend", "projection", "extractionMethod", "estimates"],
  requiredSources: ["exchange", "mca", "financialData", "privateData", "startupMedia"],
  caching: true,
  estimatedRuntimeMs: 6000,
};

// Fallback patterns for the generic HTML/PDF path (used only when the
// screener.in structured extractor isn't applicable — unlisted companies,
// or screener.in not covering this ticker). Deliberately loose: a
// well-formed source hit here still has to survive checkFinancialPlausibility
// before it's trusted, same as the screener path.
const KEY_LINE_ITEM_PATTERNS: Record<string, RegExp> = {
  revenue: /total (income|revenue)|revenue from operations/i,
  netProfit: /net profit|profit after tax|profit for the (year|period)/i,
  ebitda: /ebitda/i,
  totalAssets: /total assets/i,
  totalEquity: /total equity|shareholders'? funds/i,
  totalDebt: /total (debt|borrowings)/i,
};

export type FinancialExtractionMethod = "screener_structured" | "html_tables" | "pdf_tables" | "pdf_keyword_context" | "snippet_only";

export type FinancialStatementsData =
  | {
      companyName: string;
      status: "not_available";
      reason: string;
      recommendedSources: string[];
      rawSnippets?: { url: string; snippet: string }[];
    }
  | {
      companyName: string;
      status: "estimate_only";
      estimates: PressFinancialEstimate[];
      note: string;
    }
  | {
      companyName: string;
      status: "available";
      primarySourceUrl: string;
      extractionMethod: FinancialExtractionMethod;
      statements: FinancialStatement[];
      ratios?: RatioSet[];
      trend?: TrendAnalysis;
      projection?: FinancialProjection;
      plausibilityIssues?: Record<string, PlausibilityIssue[]>;
      /** Only populated when extractionMethod is "screener_structured" —
       * real point-in-time market data (CMP, Market Cap, Stock P/E, Book
       * Value, ROCE, ROE, Dividend Yield, Face Value) read directly off
       * screener.in's own ratio grid, not pattern-matched from a search
       * snippet. This is the one place actual shares-outstanding can be
       * derived (Market Cap / CMP) for a per-share DCF without the caller
       * having to supply it. */
      marketRatios?: Record<string, number | null>;
      /** Only populated when extractionMethod is "screener_structured" and
       * screener's #quarters section had data — the trailing quarterly
       * Sales/Operating Profit/Net Profit trend every real initiating-
       * coverage note carries, distinct from the annual statements above. */
      quarterlyStatements?: FinancialStatement[];
      /** Only populated when extractionMethod is "pdf_keyword_context" —
       * i.e. real tabular structure couldn't be recovered at all, so
       * `statements` is empty and this is the best the pipeline could do:
       * raw text windows around each line-item keyword for a human (or an
       * LLM with the source URL) to read the actual figures out of. */
      keywordContexts?: Record<string, string[]>;
    };

/** Converts a KEY_LINE_ITEM_PATTERNS-shaped lineItems record (from either
 * a generic HTML table or a positionally-reconstructed PDF table) into the
 * canonical FinancialStatement[] shape, dropping any period missing either
 * of the two schema-required fields (revenue, netProfit) rather than
 * defaulting them to 0 — see the equivalent note in screenerExtractor.ts's
 * mapScreenerToFinancialStatements for why that distinction matters. */
function buildStatementsFromLineItems(periods: string[], lineItems: Record<string, (number | null)[]>): FinancialStatement[] {
  const at = (key: string, i: number): number | undefined => {
    const v = lineItems[key]?.[i];
    return v === null || v === undefined ? undefined : v;
  };

  return periods
    .map((period, i) => ({ period, revenue: at("revenue", i), netProfit: at("netProfit", i), i }))
    .filter((p) => p.revenue !== undefined && p.netProfit !== undefined)
    .map(({ period, revenue, netProfit, i }) => ({
      period,
      incomeStatement: { revenue: revenue!, ebitda: at("ebitda", i), netProfit: netProfit! },
      balanceSheet: { totalAssets: at("totalAssets", i), totalEquity: at("totalEquity", i), totalDebt: at("totalDebt", i) },
      cashFlow: {},
      metadata: { source: "generic_table_extraction" },
    }));
}

/** Runs the shared "find a matching line item across every parsed table on
 * the page/document" scan used by both the HTML-table and PDF-table
 * extraction paths below — a filing PDF's P&L, balance sheet, and cash
 * flow are usually on different pages/tables, so every KEY_LINE_ITEM_PATTERNS
 * entry has to be searched across all of them, keeping the first match
 * (and that table's period headers) per pattern. */
function scanTablesForLineItems(tables: ParsedFinancialTable[]): { lineItems: Record<string, (number | null)[]>; periods: string[] } {
  const lineItems: Record<string, (number | null)[]> = {};
  let periods: string[] = [];
  for (const table of tables) {
    for (const [key, pattern] of Object.entries(KEY_LINE_ITEM_PATTERNS)) {
      const item = findLineItem(table, pattern);
      if (item && !lineItems[key]) {
        lineItems[key] = item.values;
        periods = table.periods;
      }
    }
  }
  return { lineItems, periods };
}

interface GenericExtractionResult {
  primarySourceUrl: string;
  extractionMethod: FinancialExtractionMethod;
  statements: FinancialStatement[];
  keywordContexts?: Record<string, string[]>;
}

/** The generic fallback waterfall for when screener.in doesn't apply: try
 * each candidate URL's own document (not just Exa's 3000-character
 * snippet), attempting real table recovery first — HTML `<table>`
 * elements via cheerio, or positional reconstruction via pdfTableExtractor
 * for PDFs — and only falling back to keyword-context text windows when
 * no table structure could be recovered at all. Stops at the first URL
 * that yields anything usable. */
async function tryGenericExtraction(urls: string[]): Promise<GenericExtractionResult | null> {
  for (const url of urls.slice(0, 8)) {
    const doc = await fetchDocument(url);
    if (!doc) continue;

    if (doc.contentType === "html" && doc.html) {
      const { lineItems, periods } = scanTablesForLineItems(extractTables(doc.html).map(parseFinancialTable));
      const statements = periods.length ? buildStatementsFromLineItems(periods, lineItems) : [];
      if (statements.length > 0) return { primarySourceUrl: url, extractionMethod: "html_tables", statements };
      continue;
    }

    if (doc.contentType === "pdf" && doc.pdfBuffer) {
      const pdfTables = await extractPdfTables(doc.pdfBuffer).catch(() => []);
      const { lineItems, periods } = scanTablesForLineItems(pdfTables.map(parseFinancialTable));
      const statements = periods.length ? buildStatementsFromLineItems(periods, lineItems) : [];
      if (statements.length > 0) return { primarySourceUrl: url, extractionMethod: "pdf_tables", statements };

      const { text } = await extractPdfText(doc.pdfBuffer);
      const contexts = findKeywordContexts(text, Object.keys(KEY_LINE_ITEM_PATTERNS).concat(["Total Revenue", "Net Profit", "EBITDA"]));
      if (Object.values(contexts).some((ctxs) => ctxs.length > 0)) {
        return { primarySourceUrl: url, extractionMethod: "pdf_keyword_context", statements: [], keywordContexts: contexts };
      }
    }
  }
  return null;
}

export async function getFinancialStatements(
  contextInput: ResearchContextInput,
  includeRatios = true,
): Promise<ToolResult<FinancialStatementsData>> {
  const context = withObjective(contextInput, "financials");
  const templateKey = context.listed === "listed" ? "listedFilings" : "filings";
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey,
    subject: context.company!,
    numResults: 16,
    cacheNamespace: "financial_statements",
    verifyEntity: context.company,
    // Deep extraction is handled explicitly below (screener-first
    // waterfall, then a multi-candidate generic pass) rather than via the
    // pipeline's single-top-result deepExtract option — this function
    // needs to try several URLs and several extraction strategies, which
    // the generic pipeline option isn't shaped for.
  });

  const recommendedSources = labelDomains(domainsChecked);
  const metadataBase = buildEvidenceMetadata({ evidence, domainsChecked, entityRejectedCount });

  if (results.length === 0) {
    return {
      data: {
        companyName: context.company!,
        status: "not_available",
        reason:
          context.listed === "unlisted"
            ? "No financial data found for this private/unlisted company within the trusted source allowlist."
            : "No financial filing sources found for this company within the trusted source allowlist.",
        recommendedSources,
      },
      citations,
      confidence: 0,
      metadata: metadataBase,
    };
  }

  let statements: FinancialStatement[] = [];
  let extractionMethod: FinancialExtractionMethod = "snippet_only";
  let primarySourceUrl = results[0].url;
  let keywordContexts: Record<string, string[]> | undefined;
  let finalCitations = citations;
  let marketRatios: Record<string, number | null> | undefined;
  let quarterlyStatements: FinancialStatement[] | undefined;

  // Waterfall step 1: screener.in structured extraction — real,
  // multi-period, all-line-items-at-once data for any listed company
  // screener.in covers. Skipped outright for known-unlisted companies.
  if (context.listed !== "unlisted") {
    const screenerSlug = findScreenerSlug(results);
    if (screenerSlug) {
      const html = await fetchScreenerPage(screenerSlug);
      if (html) {
        const screenerData = extractScreenerFinancials(html);
        const mapped = mapScreenerToFinancialStatements(screenerData);
        if (mapped.length > 0) {
          statements = mapped;
          extractionMethod = "screener_structured";
          marketRatios = screenerData.topRatios;
          const mappedQuarters = mapScreenerQuarters(screenerData.quarters);
          if (mappedQuarters.length > 0) quarterlyStatements = mappedQuarters;
          primarySourceUrl = `https://www.screener.in/company/${screenerSlug}/consolidated/`;
          const scored = scoreSource(primarySourceUrl, null);
          const screenerCitation: Citation = {
            source: scored.hostname,
            url: primarySourceUrl,
            publicationDate: null,
            evidenceSnippet: "Structured profit & loss, balance sheet, and cash flow tables extracted directly from screener.in.",
            tier: scored.tier,
            authority: scored.authority,
            recencyPenalty: scored.recencyPenalty,
            confidenceScore: scored.confidenceScore,
          };
          finalCitations = dedupeCitations([...citations, screenerCitation]);
        }
      }
    }
  }

  // Waterfall step 2: generic HTML-table / PDF-table / keyword-context
  // extraction against the actual documents behind the top search results
  // (not just their Exa snippets) — only attempted when screener.in didn't
  // apply or didn't yield anything.
  if (statements.length === 0) {
    const generic = await tryGenericExtraction(results.map((r) => r.url));
    if (generic) {
      primarySourceUrl = generic.primarySourceUrl;
      extractionMethod = generic.extractionMethod;
      statements = generic.statements;
      keywordContexts = generic.keywordContexts;
    }
  }

  const hasStatements = statements.length > 0;
  const hasKeywordContext = extractionMethod === "pdf_keyword_context";

  // Waterfall step 3 (unlisted companies only): audited-grade sources
  // (screener.in, exchange/MCA filings) are essentially never scrapable
  // for a private company — MCA charges per-document, and every
  // third-party aggregator we'd otherwise use is bot-walled (see
  // sources/startupMedia/index.ts). Entrackr/Inc42/YourStory are the one
  // freely-reachable channel, and they're already in `results` here
  // because source-router.ts adds startupMedia's domains to the search
  // whenever context.listed === "unlisted". Surfaced as a distinct
  // estimate_only status rather than forced into FinancialStatement[] —
  // a press digest of a filing is not the filing.
  if (!hasStatements && !hasKeywordContext && context.listed === "unlisted") {
    const estimates = extractPressFinancialEstimates(results);
    if (estimates.length > 0) {
      return {
        data: {
          companyName: context.company!,
          status: "estimate_only",
          estimates,
          note: "These figures are pattern-extracted from business-media coverage that digests unlisted companies' RoC/MCA filings (Entrackr, Inc42, YourStory) — not read from the filing itself and not independently audited by this tool. Audited-grade data for an unlisted company requires purchasing the AOC-4 filing from the MCA21 portal or a paid data vendor (e.g. Probe42, Tofler's paid API, Setu's MCA API) — every free third-party aggregator (Zaubacorp, Tofler's public site, Craft.co, Owler, Dealroom) is bot-walled against automated access.",
        },
        citations: finalCitations,
        confidence: Math.min(confidence, 0.5),
        metadata: metadataBase,
      };
    }
  }

  if (!hasStatements && !hasKeywordContext) {
    return {
      data: {
        companyName: context.company!,
        status: "not_available",
        reason:
          context.listed === "unlisted"
            ? "No audited or press-reported financial figures could be found for this unlisted company. Real audited financials require purchasing its AOC-4 filing from the MCA21 portal or a paid data vendor (Probe42, Tofler's paid API, Setu's MCA API) — every free third-party aggregator this tool can reach (Zaubacorp, Tofler's public site, Craft.co, Owler, Dealroom) is bot-walled against automated access."
            : "Sources were found for this company, but no structured financial tables or line-item figures could be parsed from them (often a paywalled aggregator page, a JS-only page with no server-rendered table, or a PDF whose layout defeated both the table-position reconstruction and the keyword-context fallback).",
        recommendedSources,
        rawSnippets: results.slice(0, 6).map((r) => ({ url: r.url, snippet: r.text.slice(0, 1200) })),
      },
      citations: finalCitations,
      confidence: Math.min(confidence, 0.4),
      metadata: metadataBase,
    };
  }

  let ratios: RatioSet[] | undefined;
  let trend: TrendAnalysis | undefined;
  let projection: FinancialProjection | undefined;
  let plausibilityIssues: Record<string, PlausibilityIssue[]> | undefined;

  if (hasStatements) {
    if (includeRatios) {
      ratios = statements.map(computeRatioSet);
      trend = computeTrend(statements);
      projection = projectFinancials(statements, 3) ?? undefined;
    }
    const issues: Record<string, PlausibilityIssue[]> = {};
    for (const statement of statements) {
      const found = checkFinancialPlausibility(statement);
      if (found.length > 0) issues[statement.period] = found;
    }
    if (Object.keys(issues).length > 0) plausibilityIssues = issues;
  }

  const finalConfidence = extractionMethod === "screener_structured" ? aggregateConfidence(finalCitations) : confidence;

  return {
    data: {
      companyName: context.company!,
      status: "available",
      primarySourceUrl,
      extractionMethod,
      statements,
      ratios,
      trend,
      projection,
      plausibilityIssues,
      keywordContexts: hasKeywordContext ? keywordContexts : undefined,
      marketRatios,
      quarterlyStatements,
    },
    citations: finalCitations,
    confidence: plausibilityIssues ? Math.min(finalConfidence, 0.5) : hasStatements ? finalConfidence : Math.min(finalConfidence, 0.6),
    metadata: metadataBase,
  };
}

export function registerFinancialStatementsTool(server: FastMCP): void {
  server.addTool({
    name: "financial_statements",
    description:
      "Retrieves a company's financial statements through a source waterfall: screener.in's structured profit-and-loss/balance-sheet/cash-flow tables first (real multi-period data for any covered listed company), then positional table recovery from filing PDFs (BSE/NSE results, annual reports), then generic HTML table scraping, then keyword-context text windows as a last resort. Returns ready-to-use FinancialStatement[] — the same shape ratio_analysis consumes — with ratios, multi-period CAGR trend, and a 3-year trend-extrapolated Revenue/EBITDA/PAT projection (computed inline by default whenever 2+ historical periods are available; clearly labeled as a mechanical CAGR carry-forward, never management guidance or a DCF output — see dcf_valuation/scenario_analysis for assumption-driven fair value). Never returns bare nulls: when data can't be found, returns a structured not_available status naming which sources were checked.",
    parameters: paramsSchema,
    annotations: { title: "Financial Statements", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getFinancialStatements(args.context, args.includeRatios);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
