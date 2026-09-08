import { childLogger } from "../../logger.js";

const log = childLogger("fetchDocument");

export interface FetchedDocument {
  url: string;
  contentType: "html" | "pdf" | "unknown";
  html?: string;
  pdfBuffer?: Buffer;
}

/** Downloads a source document directly (beyond Exa's cached snippet) so
 * the pipeline's Extractor stage can run against the full HTML/PDF, e.g.
 * to pull financial statement tables that a 3000-character snippet would
 * truncate. Failures are swallowed and returned as `null` — callers fall
 * back to snippet text. */
export async function fetchDocument(url: string, timeoutMs = 10_000): Promise<FetchedDocument | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "INDUSS-Research-MCP/0.1 (+institutional research bot)" },
    });
    if (!res.ok) return null;

    const contentTypeHeader = res.headers.get("content-type") ?? "";
    if (contentTypeHeader.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const arrayBuffer = await res.arrayBuffer();
      return { url, contentType: "pdf", pdfBuffer: Buffer.from(arrayBuffer) };
    }
    if (contentTypeHeader.includes("html")) {
      const html = await res.text();
      return { url, contentType: "html", html };
    }
    return { url, contentType: "unknown" };
  } catch (err) {
    log.debug({ err, url }, "Document fetch failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
