import type { FastMCP } from "fastmcp";
import { toMarkdown, summarizeReport } from "../../core/reports/reportEngine.js";
import { ReportInputSchema } from "../../types/schemas.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const generateMarkdownMeta: ToolMeta = {
  name: "generate_markdown",
  category: "export",
  description: "Renders a ReportInput into GitHub-flavored Markdown.",
  inputs: ["title", "sections[]"],
  outputs: ["markdown"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 20,
};

export function registerGenerateMarkdownTool(server: FastMCP): void {
  server.addTool({
    name: "generate_markdown",
    description:
      "Renders a structured report (see generate_report's schema) into a GitHub-flavored Markdown document with a table of contents, per-section confidence/sources, and a consolidated citation list.",
    parameters: ReportInputSchema,
    annotations: { title: "Generate Markdown", readOnlyHint: false, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const markdown = toMarkdown(args);
        const { citations, confidence } = summarizeReport(args);
        return buildResponse({
          success: true,
          data: { markdown },
          citations,
          confidence,
          metadata: { characterCount: markdown.length },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
