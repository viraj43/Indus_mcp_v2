/** Ranks candidate competitor/peer names instead of leaving the LLM to pick
 * inconsistently between calls. Uses signal already present in the search
 * results that produced the candidates — no extra Exa calls per candidate —
 * so this stays a single-search-cost operation:
 *
 *   - mentionCount: how many distinct results name this candidate, a proxy
 *     for how prominent/established it is in the sector's coverage.
 *   - listedSignal: whether a mention sits near stock-market language
 *     ("NSE:", "BSE:", "share price", "market cap") — a real signal that
 *     this candidate is a listed company with public financials, which is
 *     exactly what makes it useful as a financial comparable (see
 *     listed_peer_comparison).
 *
 * This is a real, checkable heuristic, not a fabricated score — it's
 * derived entirely from text the caller already fetched. */

const LISTED_SIGNAL_REGEX = /\b(NSE|BSE)\s?[:\-]|listed on (the )?(nse|bse)|\bshare price\b|\bmarket cap(?:italization)?\b/i;
const SIGNAL_WINDOW_CHARS = 120;

export interface RankedPeer {
  name: string;
  mentionCount: number;
  listedSignal: boolean;
  score: number;
}

/** Scores and sorts (best first) a set of candidate peer/competitor names
 * against the raw text of the search results they were extracted from. */
export function rankPeerCandidates(candidateNames: string[], resultTexts: string[]): RankedPeer[] {
  const ranked = candidateNames.map((name) => {
    const nameLower = name.toLowerCase();
    let mentionCount = 0;
    let listedSignal = false;

    for (const text of resultTexts) {
      const textLower = text.toLowerCase();
      const idx = textLower.indexOf(nameLower);
      if (idx === -1) continue;
      mentionCount += 1;

      const windowStart = Math.max(0, idx - SIGNAL_WINDOW_CHARS);
      const windowEnd = Math.min(text.length, idx + nameLower.length + SIGNAL_WINDOW_CHARS);
      if (LISTED_SIGNAL_REGEX.test(text.slice(windowStart, windowEnd))) listedSignal = true;
    }

    return { name, mentionCount, listedSignal, score: mentionCount * (listedSignal ? 2 : 1) };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export function topPeers(ranked: RankedPeer[], limit = 5): RankedPeer[] {
  return ranked.slice(0, limit);
}
