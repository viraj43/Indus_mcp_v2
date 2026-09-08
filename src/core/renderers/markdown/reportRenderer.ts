import type { ReportInput } from "../../../types/schemas.js";
import { flattenSectionCitations } from "../../citations/citationEngine.js";
import { slugify } from "../shared.js";
import { AI_INTERPRETATION_DISCLAIMER, AI_INTERPRETATION_LABEL, isAiInterpretation } from "../../reports/analystNote.js";

/** Pure Markdown renderer for a ReportInput built from ResearchSections:
 * title, table of contents, each section with its own confidence/summary/
 * tables/inline source list, and a consolidated numbered citations
 * appendix at the end (deduped across all sections). No orchestration
 * logic lives here — see core/reports/reportEngine.ts for how tools
 * invoke this. */
export function renderReportMarkdown(report: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  if (report.subtitle) lines.push(`\n*${report.subtitle}*`);
  if (report.companyName) lines.push(`\n**Company:** ${report.companyName}`);
  lines.push(`\n**Generated:** ${report.generatedAt ?? new Date().toISOString()}`);

  lines.push("\n## Table of Contents");
  for (const section of report.sections) {
    lines.push(`- [${section.title}](#${slugify(section.title)})`);
  }

  for (const section of report.sections) {
    lines.push(`\n## ${section.title} _(confidence: ${section.confidence})_`);
    if (isAiInterpretation(section.metadata)) {
      const label = typeof section.metadata?.label === "string" ? section.metadata.label : AI_INTERPRETATION_LABEL;
      lines.push(`\n> 🧠 **${label}**`);
    }
    lines.push(`\n${section.summary}`);
    if (isAiInterpretation(section.metadata)) {
      lines.push(`\n> _${AI_INTERPRETATION_DISCLAIMER}_`);
    }
    for (const table of section.tables) {
      lines.push("");
      lines.push(`| ${table.headers.join(" | ")} |`);
      lines.push(`| ${table.headers.map(() => "---").join(" | ")} |`);
      for (const row of table.rows) {
        lines.push(`| ${row.join(" | ")} |`);
      }
    }
    if (section.citations.length) {
      const sourceList = section.citations.map((c) => `[${c.source}](${c.url})`).join(", ");
      lines.push(`\n*Sources: ${sourceList}*`);
    }
  }

  const allCitations = flattenSectionCitations(report.sections.map((s) => s.citations));
  if (allCitations.length) {
    lines.push("\n## Citations");
    allCitations.forEach((c, i) => {
      lines.push(
        `${i + 1}. [${c.source}](${c.url})${c.publicationDate ? ` — ${c.publicationDate}` : ""} (tier: ${c.tier}, confidence: ${c.confidenceScore})`,
      );
    });
  }

  return lines.join("\n");
}
