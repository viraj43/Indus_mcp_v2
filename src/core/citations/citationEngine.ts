import type { Citation, ExaSearchResultItem } from "../../types/common.js";
import { scoreSource } from "./sourcePriority.js";

/** Turns raw Exa search results into fact-grade citations: source name,
 * URL, publication date, an evidence snippet, and the Tier/Authority/
 * Recency/Confidence score produced by the Source Priority Engine
 * (sourcePriority.ts). */
export function buildCitations(results: ExaSearchResultItem[], snippetLength = 240): Citation[] {
  return results.map((r) => {
    const score = scoreSource(r.url, r.publishedDate);
    return {
      source: score.hostname,
      url: r.url,
      publicationDate: r.publishedDate,
      evidenceSnippet: r.text.slice(0, snippetLength).trim(),
      tier: score.tier,
      authority: score.authority,
      recencyPenalty: score.recencyPenalty,
      confidenceScore: score.confidenceScore,
    };
  });
}

/** Deduplicates citations pointing at the same URL, keeping the
 * highest-confidence entry, and returns them sorted best-first. */
export function dedupeCitations(citations: Citation[]): Citation[] {
  const byUrl = new Map<string, Citation>();
  for (const c of citations) {
    const existing = byUrl.get(c.url);
    if (!existing || c.confidenceScore > existing.confidenceScore) {
      byUrl.set(c.url, c);
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/** Aggregate confidence for a tool response: the mean of its citation
 * scores, discounted when there is only thin (1-2 source) corroboration. */
export function aggregateConfidence(citations: Citation[]): number {
  if (citations.length === 0) return 0;
  const mean = citations.reduce((sum, c) => sum + c.confidenceScore, 0) / citations.length;
  const corroborationFactor = citations.length === 1 ? 0.85 : citations.length === 2 ? 0.95 : 1;
  return Math.round(mean * corroborationFactor * 100) / 100;
}

/** Flattens citations across multiple ResearchSections into one deduped,
 * ranked list — used when a report/export tool needs a single overall
 * confidence or citation list from many sections. */
export function flattenSectionCitations(sectionCitations: Citation[][]): Citation[] {
  return dedupeCitations(sectionCitations.flat());
}

/** Tiers backed by a regulator/registry/filing record, rather than a
 * third party reporting on or aggregating one. */
const PRIMARY_TIERS = new Set(["official_filing", "government", "annual_report"]);

export interface EvidenceSummary {
  totalSources: number;
  primarySources: number;
  secondarySources: number;
}

/** Institutional due-diligence convention: report not just a confidence
 * number but how many sources it rests on, split into primary (regulator/
 * registry/filing) vs. secondary (news, industry analysis, aggregators) —
 * "94% confidence from 8 sources, 5 primary" is checkable in a way a bare
 * percentage isn't. */
export function summarizeEvidence(citations: Citation[]): EvidenceSummary {
  const primarySources = citations.filter((c) => PRIMARY_TIERS.has(c.tier)).length;
  return {
    totalSources: citations.length,
    primarySources,
    secondarySources: citations.length - primarySources,
  };
}
