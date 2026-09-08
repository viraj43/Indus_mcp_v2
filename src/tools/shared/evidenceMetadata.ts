import type { EvidenceSummary } from "../../core/citations/citationEngine.js";
import { labelDomains } from "../../sources/labels.js";

/** Builds the standard evidence block every search-backed tool attaches to
 * its response metadata: what was actually searched — as both raw domains
 * and human-readable labels (so a "no matches" result reads as "Checked:
 * MCA, SEBI, NCLT, Indian Kanoon — none found" rather than going quiet) —
 * the primary/secondary source split behind the confidence score, and how
 * many raw hits entity verification dropped as false positives. */
export function buildEvidenceMetadata(params: {
  evidence: EvidenceSummary;
  domainsChecked: string[];
  entityRejectedCount?: number;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    sourcesChecked: labelDomains(params.domainsChecked),
    domainsChecked: params.domainsChecked,
    totalSources: params.evidence.totalSources,
    primarySources: params.evidence.primarySources,
    secondarySources: params.evidence.secondarySources,
    ...(params.entityRejectedCount ? { falsePositivesFiltered: params.entityRejectedCount } : {}),
    ...params.extra,
  };
}
