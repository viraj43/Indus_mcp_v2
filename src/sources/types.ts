/** Where a source sits in the trust hierarchy, from most to least
 * authoritative. Used by core/citations/sourcePriority.ts to score
 * citations instead of an ad hoc per-domain trust list. */
export type SourceTier =
  | "official_filing" // MCA, SEC — the regulator's own record
  | "official_company" // the company's own site, LinkedIn, Crunchbase
  | "annual_report" // a company's own published financial filing
  | "government" // ministries, central banks, multilateral institutions
  | "industry_report" // Big 4 / strategy consulting / analyst research
  | "news" // wire services and business press
  | "blog"; // fallback tier for anything unrecognized

/** A query template for one research angle a source is good for, e.g.
 * "overview" or "funding". Takes the research subject (company name,
 * sector, or country depending on the source) and returns a query string. */
export type SearchTemplate = (subject: string) => string;

/** Every domain-source provider is fully self-contained: its own domain
 * allowlist, its own query templates, and its own trust metadata. Adding a
 * new source means adding one of these, not editing the router or the
 * citation engine. */
export interface SourceProfile {
  name: string;
  domains: readonly string[];
  searchTemplates: Record<string, SearchTemplate>;
  /** Baseline authority score (0-1), independent of any single document's
   * recency — combined with tier and recency in sourcePriority.ts. */
  confidence: number;
  tier: SourceTier;
  supportsPDF: boolean;
  supportsHTML: boolean;
}
