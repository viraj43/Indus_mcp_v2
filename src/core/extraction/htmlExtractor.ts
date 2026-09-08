import * as cheerio from "cheerio";
import { normalizeWhitespace } from "../normalization/normalizer.js";

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

/** Loads raw HTML for structured extraction. Centralized here so every
 * extractor uses the same cheerio config (no script/style noise). */
export function loadHtml(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return $;
}

/** Pulls the main readable text out of a page, stripping nav/footer/ads
 * boilerplate heuristically via common landmark tags. */
export function extractMainText(html: string, maxChars = 8000): string {
  const $ = loadHtml(html);
  const candidates = ["article", "main", "[role=main]", "body"];
  for (const selector of candidates) {
    const el = $(selector).first();
    if (el.length) {
      const text = normalizeWhitespace(el.text());
      if (text.length > 200) return text.slice(0, maxChars);
    }
  }
  return normalizeWhitespace($("body").text()).slice(0, maxChars);
}

/** Extracts all HTML tables into a structured header/rows shape, e.g. for
 * financial statement tables published on IR/annual-report pages. */
export function extractTables(html: string): ExtractedTable[] {
  const $ = loadHtml(html);
  const tables: ExtractedTable[] = [];

  $("table").each((_, tableEl) => {
    const $table = $(tableEl);
    const rows: string[][] = [];

    $table.find("tr").each((__, rowEl) => {
      const cells: string[] = [];
      $(rowEl)
        .find("th, td")
        .each((___, cellEl) => {
          cells.push(normalizeWhitespace($(cellEl).text()));
        });
      if (cells.length) rows.push(cells);
    });

    if (rows.length === 0) return;
    const [headers, ...body] = rows;
    tables.push({ headers, rows: body });
  });

  return tables;
}

/** Extracts key metadata (title, description, canonical URL, published
 * time) commonly used to fill citation fields when Exa doesn't return them. */
export function extractMetadata(html: string): {
  title: string | null;
  description: string | null;
  publishedTime: string | null;
} {
  const $ = loadHtml(html);
  const title = $("title").first().text() || $('meta[property="og:title"]').attr("content") || null;
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    null;
  const publishedTime =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    null;

  return { title: title?.trim() ?? null, description: description?.trim() ?? null, publishedTime };
}
