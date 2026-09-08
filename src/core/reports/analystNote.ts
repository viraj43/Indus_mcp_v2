/** Every fact-bearing part of this server's output is source-derived and
 * scored by the Source Priority Engine — but a genuinely useful research
 * report also needs judgment: is this a real moat, is this red flag
 * material, would we invest. That kind of synthesis is exactly what an
 * LLM is for and what no regex/heuristic in this codebase should try to
 * fake (see peerRanking.ts's own comment on the difference between a
 * "real, checkable heuristic" and a fabricated score). Rather than
 * leaving that synthesis unmarked and indistinguishable from sourced
 * evidence, `ResearchSectionSchema.metadata.kind = "ai_interpretation"`
 * is a recognized convention: the HTML/Markdown renderers give any
 * section carrying it a visually distinct treatment and unconditionally
 * append the disclaimer below, regardless of what the section's own
 * summary text says — the label is enforced by the renderer, not left to
 * whichever caller assembled the section to remember to type it. */
export const AI_INTERPRETATION_DISCLAIMER =
  "This section is the AI's own analysis and interpretation of the evidence above — not a verified fact, and not investment, legal, or financial advice.";

export const AI_INTERPRETATION_LABEL = "AI Interpretation";

/** Stamps a ResearchSection's metadata with the ai_interpretation
 * convention, preserving whatever else the caller already set (e.g. a
 * custom label overriding the default "AI Interpretation" chip text).
 * Tools that assemble sections themselves — and a calling LLM composing
 * sections for generate_report/generate_pdf — should use this whenever
 * the section is the writer's own judgment rather than a retrieved fact,
 * e.g. an investment thesis, a red-flag severity assessment, or a
 * verdict. */
export function markAsAiInterpretation(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...metadata, kind: "ai_interpretation" };
}

export function isAiInterpretation(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.kind === "ai_interpretation";
}
