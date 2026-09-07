import type { ReportInput } from "../../types/schemas.js";
import type { Citation } from "../../types/common.js";
import { renderReportMarkdown } from "../renderers/markdown/reportRenderer.js";
import { renderReportHtml } from "../renderers/html/reportRenderer.js";
import { flattenSectionCitations, aggregateConfidence } from "../citations/citationEngine.js";

export type { ReportInput, ResearchSection, ReportTable } from "../../types/schemas.js";

/** Thin orchestration layer: tools call these entry points, and the actual
 * string-building lives in core/renderers/. Keeping the split means a new
 * output format (PDF, DOCX) is a new renderer module, not a change here. */
export function toMarkdown(report: ReportInput): string {
  return renderReportMarkdown(report);
}

export function toHtml(report: ReportInput): string {
  return renderReportHtml(report);
}

export function toJson(report: ReportInput): ReportInput & { generatedAt: string } {
  return { ...report, generatedAt: report.generatedAt ?? new Date().toISOString() };
}

/** A ReportInput carries citations per-section rather than one flat list
 * (see ResearchSection), so any tool building the outer ToolResponse
 * envelope needs to flatten across sections for its top-level
 * `citations`/`confidence` fields. Every report/export tool calls this
 * instead of recomputing it independently. */
export function summarizeReport(report: ReportInput): { citations: Citation[]; confidence: number } {
  const citations = flattenSectionCitations(report.sections.map((s) => s.citations));
  return { citations, confidence: aggregateConfidence(citations) };
}
