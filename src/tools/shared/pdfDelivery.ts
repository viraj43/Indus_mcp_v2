import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastMCP } from "fastmcp";
import { renderHtmlToPdf } from "../../core/pdf/pdfEngine.js";
import { slugify } from "../../core/renderers/shared.js";
import { env } from "../../config/env.js";
import { childLogger } from "../../logger.js";

const log = childLogger("pdfDelivery");
const REPORTS_DIR = path.resolve(process.cwd(), "reports");
const SAFE_FILENAME = /^[a-z0-9-]+\.pdf$/;

let downloadRouteRegistered = false;

/** Serves generated PDFs over HTTP so a *remote* MCP client (e.g. Claude.ai
 * connecting to the Railway deployment) has a real URL to fetch — a
 * server-local file path is meaningless to a client that isn't on the same
 * filesystem. Public (no auth): filenames are effectively unguessable
 * (slug + timestamp) and not sensitive enough to justify fighting the
 * OAuth session for a one-off download link. Idempotent — registered once
 * across however many PDF-producing tools call it. */
export function ensurePdfDownloadRoute(server: FastMCP): void {
  if (downloadRouteRegistered) return;
  downloadRouteRegistered = true;

  try {
    const app = server.getApp();
    app.get("/reports/:filename", async (c) => {
      const filename = c.req.param("filename");
      if (!SAFE_FILENAME.test(filename)) return c.body(null, 400);

      const filePath = path.join(REPORTS_DIR, filename);
      if (path.dirname(filePath) !== REPORTS_DIR) return c.body(null, 400);

      try {
        const buffer = await fs.readFile(filePath);
        return c.body(buffer, 200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
        });
      } catch {
        return c.body(null, 404);
      }
    });
  } catch (err) {
    log.debug({ err }, "Could not register /reports download route (non-httpStream transport?)");
  }
}

export interface RenderedPdf {
  filePath: string;
  sizeBytes: number;
  downloadUrl?: string;
  base64: string;
}

/** Renders HTML to PDF, writes it to the local reports directory, and
 * returns both a base64 payload (for embedding directly in the MCP tool
 * response — the only delivery path guaranteed to work for a remote
 * client) and a downloadUrl when MCP_BASE_URL is configured. */
export async function renderAndSavePdf(html: string, titleForFilename: string, headerTitle?: string): Promise<RenderedPdf> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const pdfBuffer = await renderHtmlToPdf(html, { headerTitle });
  const filename = `${slugify(titleForFilename)}-${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, filename);
  await fs.writeFile(filePath, pdfBuffer);

  const downloadUrl = env.MCP_BASE_URL ? `${env.MCP_BASE_URL.replace(/\/$/, "")}/reports/${filename}` : undefined;

  return { filePath, sizeBytes: pdfBuffer.length, downloadUrl, base64: pdfBuffer.toString("base64") };
}
