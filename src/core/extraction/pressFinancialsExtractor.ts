import { parseFinancialNumber } from "../normalization/normalizer.js";
import type { ExaSearchResultItem } from "../../types/common.js";

/** Pattern-extracts revenue/profit-or-loss figures out of the kind of
 * sentence Entrackr/Inc42/YourStory actually publish when digesting an
 * unlisted company's RoC (MCA) filing — "revenue crosses ₹500 Cr in
 * FY26", "losses narrowed to ₹59 Cr", "core biz falls 23% in FY26". This
 * is the unlisted-company equivalent of financial_statements' screener.in
 * path, except the source is a press *report* of a filing rather than
 * the filing's own structured tables — so results are surfaced as
 * `status: "estimate_only"`, never blended into the audited-grade
 * FinancialStatement[] shape. See sources/startupMedia/index.ts for why
 * this is the one freely-reachable channel for unlisted financials. */

const FY_PERIOD_REGEX = /\bFY\s?(\d{2,4})\b/i;
const REVENUE_REGEX =
  /revenue[^.]{0,60}?(?:crosses|of|to|at|stood at|grew to|declined to|fell to|rose to|reached)?[^.]{0,20}?([₹$]\s?[\d,.]+\s?(cr(ore)?s?|lakh?s?|billion|bn|million|mn))/i;
const PROFIT_OR_LOSS_REGEX =
  /(profit|loss(?:es)?)[^.]{0,60}?(?:of|to|at|narrowed to|widened to|doubles? to|stood at)?[^.]{0,20}?([₹$]\s?[\d,.]+\s?(cr(ore)?s?|lakh?s?|billion|bn|million|mn))/i;
const GROWTH_PERCENT_REGEX = /\b(grew|rose|increased|declined|fell|dropped)\b[^.]{0,20}?by\s?(\d+(?:\.\d+)?)\s?%/i;

export interface PressFinancialEstimate {
  url: string;
  publishedDate: string | null;
  period: string | null;
  revenueRaw: string | null;
  revenueNormalized: number | null;
  netResultType: "profit" | "loss" | null;
  netResultRaw: string | null;
  netResultNormalized: number | null;
  growthPercent: number | null;
  snippet: string;
}

/** Scans a set of search results (expected to already be restricted to
 * press outlets that specifically report RoC-filing figures) and returns
 * one estimate per result that mentions at least a revenue or a
 * profit/loss figure. Results with neither are dropped rather than
 * returned as an empty/misleading row. */
export function extractPressFinancialEstimates(results: ExaSearchResultItem[]): PressFinancialEstimate[] {
  return results
    .map((r) => {
      const periodMatch = r.text.match(FY_PERIOD_REGEX);
      const revenueMatch = r.text.match(REVENUE_REGEX);
      const resultMatch = r.text.match(PROFIT_OR_LOSS_REGEX);
      const growthMatch = r.text.match(GROWTH_PERCENT_REGEX);

      if (!revenueMatch && !resultMatch) return null;

      const netResultType: "profit" | "loss" | null = resultMatch ? (/loss/i.test(resultMatch[1]) ? "loss" : "profit") : null;

      return {
        url: r.url,
        publishedDate: r.publishedDate,
        period: periodMatch ? `FY${periodMatch[1]}` : null,
        revenueRaw: revenueMatch?.[1]?.trim() ?? null,
        revenueNormalized: revenueMatch ? parseFinancialNumber(revenueMatch[1]) : null,
        netResultType,
        netResultRaw: resultMatch?.[2]?.trim() ?? null,
        netResultNormalized: resultMatch ? parseFinancialNumber(resultMatch[2]) : null,
        growthPercent: growthMatch ? parseFloat(growthMatch[2]) * (/declined|fell|dropped/i.test(growthMatch[1]) ? -1 : 1) : null,
        snippet: r.text.slice(0, 300),
      } satisfies PressFinancialEstimate;
    })
    .filter((e): e is PressFinancialEstimate => e !== null);
}
