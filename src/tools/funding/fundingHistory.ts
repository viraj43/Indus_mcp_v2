import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { parseFinancialNumber } from "../../core/normalization/normalizer.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

export const fundingHistoryMeta: ToolMeta = {
  name: "funding_history",
  category: "funding",
  description: "Funding rounds, investors, and valuation mentions extracted from registry/company sources.",
  inputs: ["context.company"],
  outputs: ["events[]"],
  requiredSources: ["mca", "company", "privateData"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const ROUND_REGEX = /(seed|pre-seed|series [a-h]|bridge|angel)\s+(round|funding)?/i;
const AMOUNT_CONTEXT_REGEX = /(raised|secured|funding of|investment of)[^.]{0,80}?([₹$]\s?[\d,.]+\s?(cr(ore)?s?|lakh?s?|million|mn|billion|bn|m|k))/i;

export interface FundingEvent {
  url: string;
  round: string | null;
  amountRaw: string | null;
  amountNormalized: number | null;
  snippet: string;
  publishedDate: string | null;
}

export interface FundingHistoryData {
  companyName: string;
  events: FundingEvent[];
}

export async function getFundingHistory(contextInput: ResearchContextInput): Promise<ToolResult<FundingHistoryData>> {
  const context = withObjective(contextInput, "funding");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "funding",
    subject: context.company!,
    numResults: 8,
    cacheNamespace: "funding_history",
    verifyEntity: context.company,
  });

  const events = results
    .map((r) => {
      const roundMatch = r.text.match(ROUND_REGEX);
      const amountMatch = r.text.match(AMOUNT_CONTEXT_REGEX);
      if (!roundMatch && !amountMatch) return null;
      return {
        url: r.url,
        round: roundMatch?.[1]?.trim() ?? null,
        amountRaw: amountMatch?.[2]?.trim() ?? null,
        amountNormalized: amountMatch ? parseFinancialNumber(amountMatch[2]) : null,
        snippet: r.text.slice(0, 300),
        publishedDate: r.publishedDate,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    data: { companyName: context.company!, events },
    citations,
    confidence: events.length > 0 ? confidence : Math.min(confidence, 0.4),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: { note: events.length === 0 ? "No explicit funding round mentions found in retrieved sources." : undefined },
    }),
  };
}

export function registerFundingHistoryTool(server: FastMCP): void {
  server.addTool({
    name: "funding_history",
    description:
      "Searches Crunchbase, Tofler, MCA, Pitchbook, Dealroom, and OpenCorporates for a company's funding rounds, investors, and valuation mentions, and extracts candidate round/amount facts from the retrieved text.",
    parameters: paramsSchema,
    annotations: { title: "Funding History", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getFundingHistory(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
