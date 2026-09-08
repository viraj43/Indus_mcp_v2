/** Deterministic string/number normalization helpers shared across
 * extraction and tool code, so every tool formats facts consistently
 * instead of re-implementing ad hoc parsing. This is the Normalizer stage
 * of the Universal Search Pipeline (see core/pipeline/searchPipeline.ts). */

/** Parses numbers written like "₹1,234.5 Cr", "$12.3M", "45%" into a plain
 * number in the given base unit. Returns null when the text has no number. */
export function parseFinancialNumber(raw: string): number | null {
  const cleaned = raw.replace(/[₹$,]/g, "").trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  let value = parseFloat(match[0]);

  if (/cr(ore)?s?\b/i.test(cleaned)) value *= 1e7;
  else if (/lakh?s?\b/i.test(cleaned)) value *= 1e5;
  else if (/\bbn\b|billion/i.test(cleaned)) value *= 1e9;
  else if (/\bmn\b|million|\bm\b/i.test(cleaned)) value *= 1e6;
  else if (/\bk\b|thousand/i.test(cleaned)) value *= 1e3;

  return value;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeCompanyName(name: string): string {
  return normalizeWhitespace(name)
    .replace(/\b(pvt\.?|private)\b/gi, "Private")
    .replace(/\b(ltd\.?|limited)\b/gi, "Limited")
    .replace(/\s+,/g, ",");
}

export function toIsoDate(dateLike: string | null | undefined): string | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function safeRound(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Light normalization pass applied to every raw search result as part of
 * the pipeline's Normalizer stage — currently whitespace cleanup, with
 * room to grow (e.g. currency/date normalization) without touching the
 * pipeline itself. */
export function normalizeResultText(text: string): string {
  return normalizeWhitespace(text);
}
