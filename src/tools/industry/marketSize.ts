import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective } from "../../types/context.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import { parseFinancialNumber } from "../../core/normalization/normalizer.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ sector: true }),
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

export function registerMarketSizeTool(server: FastMCP): void {
  server.addTool({
    name: "market_size",
    description:
      "Finds market size and CAGR figures for an industry from analyst/research sources (IMARC, Statista, McKinsey, NASSCOM, etc.) and extracts numeric estimates via pattern matching.",
    parameters: paramsSchema,
    annotations: { title: "Market Size", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const context = withObjective(args.context, "industry");
        const subject = context.country === "india" ? `${context.sector} in India` : context.sector!;
        const { results, citations, confidence } = await runSearchPipeline({
          context,
          templateKey: "marketSize",
          subject,
          numResults: 8,
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
              snippet: r.text.slice(0, 300),
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        return buildResponse({
          success: true,
          data: { industry: context.sector, estimates },
          citations,
          confidence: estimates.length > 0 ? confidence : Math.min(confidence, 0.4),
          metadata: {
            note: estimates.length === 0 ? "No explicit market size/CAGR figures found in retrieved sources." : undefined,
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
