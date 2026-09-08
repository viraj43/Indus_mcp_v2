import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { parseFinancialNumber } from "../../core/normalization/normalizer.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema,
});

export const marketSizeMeta: ToolMeta = {
  name: "market_size",
  category: "industry",
  description: "Market size and CAGR figures for a sector, extracted from analyst/research sources.",
  inputs: ["context.sector", "context.country"],
  outputs: ["estimates[]"],
  requiredSources: ["industry"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const MARKET_SIZE_REGEX =
  /(market (?:size|value|is valued at|was valued at))[^.]{0,60}?([₹$]\s?[\d,.]+\s?(cr(ore)?s?|lakh?s?|billion|bn|million|mn))/gi;
const CAGR_REGEX = /CAGR\s(?:of\s)?([\d.]+)\s?%/i;

export interface MarketSizeEstimate {
  url: string;
  publishedDate: string | null;
  marketSizeValues: { raw: string; normalized: number | null }[];
  cagrPercent: number | null;
  snippet: string;
}

export interface MarketSizeData {
  industry: string;
  estimates: MarketSizeEstimate[];
}

/** Shares the industryOverview sector-or-company fallback so this tool can
 * also be wired directly into generate_institutional_report without the
 * caller having to already know the sector upfront (see industryOverview.ts
 * for the rationale — every real initiating-coverage report carries a
 * market-size/TAM figure, not just qualitative industry commentary). */
function buildSubject(context: ResearchContextInput): string {
  const base = context.sector ?? `${context.company} market`;
  return context.country === "india" ? `${base} in India` : base;
}

export async function getMarketSize(contextInput: ResearchContextInput): Promise<ToolResult<MarketSizeData>> {
  if (!contextInput.sector && !contextInput.company) {
    throw new Error("market_size requires context.sector or context.company (at least one) to search against.");
  }
  const context = withObjective(contextInput, "industry");
  const subject = buildSubject(context);
  const { results, citations, confidence } = await runSearchPipeline({
    context,
    templateKey: "marketSize",
    subject,
    numResults: 12,
    cacheNamespace: "market_size",
  });

  const estimates = results
    .map((r) => {
      const sizeMatches = Array.from(r.text.matchAll(MARKET_SIZE_REGEX));
      const cagrMatch = r.text.match(CAGR_REGEX);
      if (sizeMatches.length === 0 && !cagrMatch) return null;
      return {
        url: r.url,
        publishedDate: r.publishedDate,
        marketSizeValues: sizeMatches.map((m) => ({ raw: m[2], normalized: parseFinancialNumber(m[2]) })),
        cagrPercent: cagrMatch ? parseFloat(cagrMatch[1]) : null,
        snippet: r.text.slice(0, 800),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    data: { industry: context.sector ?? context.company ?? "unspecified", estimates },
    citations,
    confidence: estimates.length > 0 ? confidence : Math.min(confidence, 0.4),
    metadata: {
      note: estimates.length === 0 ? "No explicit market size/CAGR figures found in retrieved sources." : undefined,
    },
  };
}

export function registerMarketSizeTool(server: FastMCP): void {
  server.addTool({
    name: "market_size",
    description:
      "Finds market size and CAGR figures for an industry from analyst/research sources (IMARC, Statista, McKinsey, NASSCOM, etc.) and extracts numeric estimates via pattern matching. Pass context.sector when known; if omitted, falls back to searching around context.company's own market.",
    parameters: paramsSchema,
    annotations: { title: "Market Size", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getMarketSize(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
