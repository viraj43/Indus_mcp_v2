import type { SourceName } from "../../sources/index.js";

export type ResearchObjective =
  | "company_overview"
  | "financials"
  | "funding"
  | "industry"
  | "macro"
  | "news"
  | "sentiment"
  | "litigation"
  | "promoters"
  | "competitors";

/** Maps a high-level research objective to the source(s) whose domains
 * should be searched. This is the only place objective→source policy
 * lives; source-router.ts turns the result into a concrete domain
 * allowlist by pulling each source profile's domains. */
export const OBJECTIVE_SOURCES: Record<ResearchObjective, SourceName[]> = {
  company_overview: ["company", "mca"],
  financials: ["exchange", "mca", "financialData", "privateData"],
  funding: ["mca", "company", "privateData"],
  industry: ["industry"],
  macro: ["macro", "government"],
  news: ["news"],
  /** Soft adverse-signal screen: press + employee/public sentiment.
   * Deliberately excludes regulator/legalMedia — see "litigation" for
   * hard regulatory/court records. */
  sentiment: ["news", "socialSentiment"],
  /** Hard regulatory/legal record screen (SEBI, NCLT, court judgments) —
   * distinct from "sentiment"'s soft adverse-media signal. */
  litigation: ["regulator", "legalMedia", "mca"],
  promoters: ["regulator", "mca", "company"],
  competitors: ["industry", "news", "financialData"],
};

export function resolveSources(objective: ResearchObjective): SourceName[] {
  return OBJECTIVE_SOURCES[objective] ?? [];
}
