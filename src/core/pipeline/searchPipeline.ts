import { exaSearch } from "../exa/search.js";
import { routeSources } from "../router/source-router.js";
import { SOURCES, type SourceName } from "../../sources/index.js";
import { buildCitations, dedupeCitations, aggregateConfidence, summarizeEvidence, type EvidenceSummary } from "../citations/citationEngine.js";
import { normalizeResultText } from "../normalization/normalizer.js";
import { extractTables, type ExtractedTable } from "../extraction/htmlExtractor.js";
import { extractPdfText } from "../extraction/pdfExtractor.js";
import { fetchDocument } from "./fetchDocument.js";
import { filterByEntity } from "../quality/entityVerification.js";
import { cacheOrCompute, buildCacheKey } from "../../cache/cache.js";
import { env } from "../../config/env.js";
import type { Citation, ExaSearchResultItem } from "../../types/common.js";
import type { ResearchContext } from "../../types/context.js";

/** Resolves the final query string by asking each source relevant to this
 * objective (in priority order) for its `templateKey` template — this is
 * what makes sources self-contained: a tool asks "what's your overview
 * query for this subject" instead of hardcoding query text itself. Falls
 * back to a generic "<subject> <templateKey>" query if no matched source
 * defines that template. */
function resolveQuery(sourceNames: SourceName[], templateKey: string, subject: string): string {
  for (const name of sourceNames) {
    const template = SOURCES[name].searchTemplates[templateKey];
    if (template) return template(subject);
  }
  return `${subject} ${templateKey}`.replace(/_/g, " ").trim();
}

export interface DeepExtraction {
  url: string;
  contentType: "html" | "pdf" | "unknown";
  tables?: ExtractedTable[];
  pdfText?: string;
}

export interface SearchPipelineOptions {
  context: ResearchContext;
  /** Which of the matched source's searchTemplates to use, e.g. "overview",
   * "filings", "funding" — see the source profile files under
   * src/sources/ for what each source defines. */
  templateKey: string;
  /** The research subject text substituted into the template — usually
   * context.company or context.sector. */
  subject: string;
  numResults?: number;
  cacheNamespace: string;
  cacheTtlSeconds?: number;
  startPublishedDate?: string;
  /** When true, additionally fetches and parses the top result's full
   * document (HTML tables or PDF text) instead of relying only on Exa's
   * snippet — used by tools that need structured tables (e.g.
   * financial_statements). Off by default since it costs an extra
   * network round-trip per call. */
  deepExtract?: boolean;
  /** Optional Validator stage: inspect the normalized results and return
   * human-readable issue strings. Defaults to no validation. Issues are
   * surfaced in the result, never used to fail the pipeline outright. */
  validate?: (results: ExaSearchResultItem[]) => string[];
  /** Entity-verification subject (usually context.company). When set,
   * every result must plausibly mention this entity — by name, not just a
   * shared generic word — or it's dropped before extraction/citation.
   * This is what stops a query like "Big Bang Boom litigation" from
   * pulling in an unrelated "Nirmal Bang" or "BB Food" hit. Omit this for
   * searches whose whole point is finding *other* entities (competitor
   * discovery, peer comparison) — there, a mismatch is the desired result,
   * not a false positive. */
  verifyEntity?: string;
}

export interface SearchPipelineResult {
  results: ExaSearchResultItem[];
  citations: Citation[];
  confidence: number;
  evidence: EvidenceSummary;
  /** The concrete domains this call was restricted to, present even when
   * zero results came back — lets a tool report "checked mca.gov.in,
   * sebi.gov.in, ... — no matches" instead of just going quiet. */
  domainsChecked: string[];
  /** How many raw results were dropped by entity verification (only
   * meaningful when `verifyEntity` was supplied). */
  entityRejectedCount: number;
  deepExtraction: DeepExtraction | null;
  validationIssues: string[];
}

/** The Universal Search Pipeline every research tool runs through:
 *
 *   Tool -> Router (context.objective -> sources -> domains)
 *        -> Exa (domain-restricted, cached search)
 *        -> Normalizer (text cleanup)
 *        -> Entity Verification (optional: drop results not actually about
 *           the searched subject)
 *        -> Extractor (optional: full-document HTML/PDF parsing)
 *        -> Validator (optional, tool-supplied)
 *        -> Citation Engine (Source Priority scoring, dedupe, evidence)
 *        -> Response
 *
 * No tool calls Exa directly — this function is the only caller of
 * core/exa/search.ts outside of tests. */
export async function runSearchPipeline(options: SearchPipelineOptions): Promise<SearchPipelineResult> {
  const { sources, includeDomains } = routeSources(options.context);
  const query = resolveQuery(sources, options.templateKey, options.subject);

  const cacheKey = buildCacheKey(options.cacheNamespace, {
    query,
    domains: includeDomains,
    numResults: options.numResults,
  });

  const rawResults = await cacheOrCompute(cacheKey, options.cacheTtlSeconds ?? env.CACHE_TTL_SECONDS, () =>
    exaSearch({
      query,
      includeDomains,
      numResults: options.numResults ?? 8,
      startPublishedDate: options.startPublishedDate,
    }),
  );

  // Normalizer stage
  const normalized = rawResults.map((r) => ({ ...r, text: normalizeResultText(r.text) }));

  // Entity Verification stage (opt-in — skipped for tools searching for
  // *other* entities, e.g. competitor discovery)
  let entityRejectedCount = 0;
  let results = normalized;
  if (options.verifyEntity) {
    const filtered = filterByEntity(normalized, options.verifyEntity, (r) => `${r.title} ${r.text}`);
    results = filtered.kept;
    entityRejectedCount = filtered.rejected;
  }

  // Extractor stage (opt-in deep extraction beyond Exa's snippet)
  let deepExtraction: DeepExtraction | null = null;
  if (options.deepExtract && results.length > 0) {
    const doc = await fetchDocument(results[0].url);
    if (doc?.contentType === "html" && doc.html) {
      deepExtraction = { url: doc.url, contentType: "html", tables: extractTables(doc.html) };
    } else if (doc?.contentType === "pdf" && doc.pdfBuffer) {
      const { text } = await extractPdfText(doc.pdfBuffer);
      deepExtraction = { url: doc.url, contentType: "pdf", pdfText: text };
    } else {
      deepExtraction = { url: results[0].url, contentType: "unknown" };
    }
  }

  // Validator stage (pluggable, defaults to none)
  const validationIssues = options.validate ? options.validate(results) : [];

  // Citation Engine stage
  const citations = dedupeCitations(buildCitations(results));
  const confidence = aggregateConfidence(citations);
  const evidence = summarizeEvidence(citations);

  return {
    results,
    citations,
    confidence,
    evidence,
    domainsChecked: includeDomains,
    entityRejectedCount,
    deepExtraction,
    validationIssues,
  };
}
