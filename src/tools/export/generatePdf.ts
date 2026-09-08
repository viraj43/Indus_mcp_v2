import path from "node:path";
import type { FastMCP } from "fastmcp";
import { toHtml, summarizeReport } from "../../core/reports/reportEngine.js";
import { ReportInputSchema } from "../../types/schemas.js";
import { ensurePdfDownloadRoute, renderAndSavePdf } from "../shared/pdfDelivery.js";
import { makeEnvelope, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const generatePdfMeta: ToolMeta = {
  name: "generate_pdf",
  category: "export",
  description: "Renders a ReportInput into an institutional-layout PDF via headless-browser HTML-to-PDF conversion.",
  inputs: ["title", "sections[]"],
  outputs: ["filePath", "sizeBytes", "downloadUrl"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 3000,
};

export function registerGeneratePdfTool(server: FastMCP): void {
  ensurePdfDownloadRoute(server);

  server.addTool({
    name: "generate_pdf",
    description:
      "Renders a structured report (see generate_report's schema) into an institutional-layout PDF (cover page, TOC, headers, footers, page numbers, tables, per-section confidence, citations) via headless-browser HTML-to-PDF conversion. Returns the PDF embedded directly in the response (as a base64 resource) so remote clients can retrieve it without filesystem access, plus a downloadUrl when running over httpStream.",
    parameters: ReportInputSchema,
    annotations: { title: "Generate PDF", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    execute: async (args) => {
      try {
        const html = toHtml(args);
        const pdf = await renderAndSavePdf(html, args.title, args.companyName ?? args.brandName ?? "INDUSS Research Intelligence");
        const { citations, confidence } = summarizeReport(args);

        const envelope = makeEnvelope({
          success: true,
          data: { filePath: pdf.filePath, sizeBytes: pdf.sizeBytes, downloadUrl: pdf.downloadUrl },
          citations,
          confidence,
          metadata: { pages: "computed_at_render_time" },
        });

        return {
          content: [
            { type: "text", text: JSON.stringify(envelope) },
            { type: "resource", resource: { uri: `induss-report:///${path.basename(pdf.filePath)}`, mimeType: "application/pdf", blob: pdf.base64 } },
          ],
        };
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
