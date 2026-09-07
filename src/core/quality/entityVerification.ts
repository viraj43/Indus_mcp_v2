/** Filters false-positive search hits where a broad/ambiguous query (e.g.
 * "Big Bang Boom litigation") returns results about an entirely different
 * entity that merely shares a common word (e.g. "Nirmal Bang", "BB Food").
 * This is the Validator-stage fix for that failure mode: instead of trusting
 * every result Exa returns for a company-subject query, each result must
 * demonstrably be about the searched company before it's kept. */

const STOP_WORDS = new Set([
  "private",
  "limited",
  "pvt",
  "ltd",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "company",
  "co",
  "llp",
  "the",
  "and",
  "of",
  "group",
  "solutions",
  "technologies",
  "systems",
  "industries",
  "enterprises",
]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export interface EntityMatchResult {
  matched: boolean;
  score: number;
}

/** Checks whether `candidateText` (a search result's title + body) is
 * plausibly about `subject` (the searched entity name), rather than a
 * different entity that happens to share one generic word.
 *
 * Two conditions must both hold:
 *   1. At least half of the subject's non-stopword tokens appear in the text.
 *   2. The subject's most distinctive tokens (its two longest words, which
 *      are the least likely to also appear in an unrelated company's name)
 *      are present. A subject with fewer than two distinctive tokens (e.g.
 *      a single-word or generic name) falls back to condition 1 alone.
 */
export function matchesEntity(subject: string, candidateText: string): EntityMatchResult {
  const subjectTokens = tokenize(subject).filter((t) => !STOP_WORDS.has(t));
  if (subjectTokens.length === 0) return { matched: true, score: 1 };

  const haystack = candidateText.toLowerCase();
  const found = subjectTokens.filter((t) => haystack.includes(t));
  const score = found.length / subjectTokens.length;

  const distinctiveTokens = [...subjectTokens].sort((a, b) => b.length - a.length).slice(0, 2);
  const distinctiveFound = distinctiveTokens.length < 2 || distinctiveTokens.every((t) => haystack.includes(t));

  return { matched: distinctiveFound && score >= 0.5, score };
}

export interface EntityFilterResult<T> {
  kept: T[];
  rejected: number;
}

/** Filters a list of search-result-like items down to those that plausibly
 * mention `subject`, given a function that extracts the text to check. */
export function filterByEntity<T>(items: T[], subject: string, getText: (item: T) => string): EntityFilterResult<T> {
  const kept: T[] = [];
  let rejected = 0;
  for (const item of items) {
    if (matchesEntity(subject, getText(item)).matched) {
      kept.push(item);
    } else {
      rejected += 1;
    }
  }
  return { kept, rejected };
}
