import pdfParse from "pdf-parse";
import { normalizeWhitespace } from "../normalization/normalizer.js";

export interface PdfExtractionResult {
  text: string;
  numPages: number;
  info: Record<string, unknown>;
}

/** Extracts plain text and metadata from a PDF buffer (annual reports,
 * regulatory filings). Downstream table extraction from PDFs is done via
 * text heuristics since pdf-parse does not preserve table structure. */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  const result = await pdfParse(buffer);
  return {
    text: normalizeWhitespace(result.text),
    numPages: result.numpages,
    info: (result.info as Record<string, unknown>) ?? {},
  };
}

/** Finds the text window around each keyword occurrence (e.g. "Total
 * Revenue", "EBITDA") to help downstream code locate financial line items
 * inside long annual-report PDFs without an LLM pass. */
export function findKeywordContexts(text: string, keywords: string[], windowChars = 200): Record<string, string[]> {
  const contexts: Record<string, string[]> = {};
  for (const keyword of keywords) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = Math.max(0, match.index - windowChars / 2);
      const end = Math.min(text.length, match.index + keyword.length + windowChars / 2);
      matches.push(text.slice(start, end).trim());
      if (matches.length >= 5) break;
    }
    contexts[keyword] = matches;
  }
  return contexts;
}
