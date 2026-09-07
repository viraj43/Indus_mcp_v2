/** Aggregates evidence *already gathered* by other tools (litigation_history,
 * negative_news, promoter_background, ratio_analysis/financial_statements'
 * plausibility checks) into a single tallied severity screen. This is
 * deliberately not a "risk score" this engine invents from nothing — every
 * flag here traces back to a count or a record the caller already fetched
 * from a real source, tallied with fixed, checkable thresholds (the same
 * "real, checkable heuristic, not a fabricated score" pattern used in
 * peerRanking.ts). It does NOT decide whether the company is investable —
 * that synthesis is the calling LLM's job (see analystNote.ts). */

export type FlagSeverity = "low" | "medium" | "high";

export interface RedFlag {
  category: "litigation" | "negative_press" | "financial_plausibility" | "promoter" | "funding";
  severity: FlagSeverity;
  description: string;
  source?: string;
}

export interface LitigationCaseInput {
  title: string;
  url: string;
  caseReference: string | null;
  regulatorsMentioned: string[];
}

export interface PlausibilityIssueInput {
  field: string;
  message: string;
}

export interface RedFlagScreenInput {
  /** Pass through the `cases` array from litigation_history's output. */
  litigationCases?: LitigationCaseInput[];
  /** Count of entity-matched hits from negative_news's output
   * (`data.items.length` or similar) — not the raw text, just the count. */
  negativeNewsCount?: number;
  /** Pass through plausibility issues keyed by period, from
   * ratio_analysis/financial_statements output
   * (`metadata.plausibilityIssues`). */
  plausibilityIssuesByPeriod?: Record<string, PlausibilityIssueInput[]>;
  /** Count of director-disqualification / regulatory-action hits found in
   * promoter_background's output — a number the caller derives from that
   * tool's own results, not a judgment call this engine makes. */
  promoterRegulatoryHits?: number;
  /** Months since the company's last funding round, if known and relevant
   * (e.g. for a startup where a long funding gap plus cash burn is a real,
   * checkable signal) — optional, omit if not applicable/unknown. */
  monthsSinceLastFunding?: number;
}

export interface RedFlagSummary {
  flags: RedFlag[];
  totalFlags: number;
  bySeverity: Record<FlagSeverity, number>;
  overallSeverity: FlagSeverity | "clean";
}

const NEGATIVE_NEWS_MEDIUM_THRESHOLD = 3;
const FUNDING_GAP_MONTHS_THRESHOLD = 24;

/** Tallies already-gathered evidence into a flagged, severity-bucketed
 * summary. Every threshold here is fixed and disclosed in this file — not
 * tuned per company — so the output is reproducible and auditable. */
export function screenRedFlags(input: RedFlagScreenInput): RedFlagSummary {
  const flags: RedFlag[] = [];

  for (const c of input.litigationCases ?? []) {
    flags.push({
      category: "litigation",
      severity: c.regulatorsMentioned.length > 0 ? "high" : "medium",
      description:
        c.regulatorsMentioned.length > 0
          ? `Legal/regulatory record involving ${c.regulatorsMentioned.join(", ")}: ${c.title}`
          : `Legal proceeding referenced in coverage: ${c.title}`,
      source: c.url,
    });
  }

  const negativeNewsCount = input.negativeNewsCount ?? 0;
  if (negativeNewsCount >= NEGATIVE_NEWS_MEDIUM_THRESHOLD) {
    flags.push({
      category: "negative_press",
      severity: "medium",
      description: `Elevated negative-press volume: ${negativeNewsCount} entity-matched hits.`,
    });
  } else if (negativeNewsCount > 0) {
    flags.push({
      category: "negative_press",
      severity: "low",
      description: `${negativeNewsCount} entity-matched negative-press hit(s).`,
    });
  }

  for (const [period, issues] of Object.entries(input.plausibilityIssuesByPeriod ?? {})) {
    for (const issue of issues) {
      flags.push({
        category: "financial_plausibility",
        severity: "medium",
        description: `${period}: ${issue.message} (${issue.field})`,
      });
    }
  }

  const promoterHits = input.promoterRegulatoryHits ?? 0;
  if (promoterHits > 0) {
    flags.push({
      category: "promoter",
      severity: "high",
      description: `${promoterHits} promoter/director regulatory-action or disqualification record(s) found.`,
    });
  }

  if (input.monthsSinceLastFunding !== undefined && input.monthsSinceLastFunding >= FUNDING_GAP_MONTHS_THRESHOLD) {
    flags.push({
      category: "funding",
      severity: "medium",
      description: `${input.monthsSinceLastFunding} months since last known funding round — worth checking runway/cash position.`,
    });
  }

  const bySeverity: Record<FlagSeverity, number> = { low: 0, medium: 0, high: 0 };
  for (const f of flags) bySeverity[f.severity] += 1;

  const overallSeverity: FlagSeverity | "clean" =
    bySeverity.high > 0 ? "high" : bySeverity.medium > 0 ? "medium" : bySeverity.low > 0 ? "low" : "clean";

  return { flags, totalFlags: flags.length, bySeverity, overallSeverity };
}
