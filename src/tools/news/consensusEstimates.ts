import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

export const consensusEstimatesMeta: ToolMeta = {
  name: "consensus_estimates",
  category: "news",
  description:
    "Individually-reported brokerage target prices/ratings pulled from press coverage — NOT a Bloomberg/Refinitiv/CapitalIQ consensus feed. This server has no access to a paid market-data terminal, so this is the honest ceiling: whatever individual brokerage calls happen to be covered in the press, not a computed consensus average.",
  inputs: ["context.company"],
  outputs: ["mentions[]"],
  requiredSources: ["news"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const RATING_TP_REGEX =
  /([A-Z][A-Za-z&.\s]{2,30}(?:Securities|Capital|Oswal|Sharekhan|Kotak|Axis|ICICI|HDFC|Nomura|Jefferies|Macquarie|CLSA|Citi|Morgan Stanley|Goldman|UBS|Nuvama|Emkay|JM Financial|Antique|Systematix|Prabhudas Lilladher|PL))[^.]{0,40}?(BUY|SELL|HOLD|ADD|REDUCE|ACCUMULATE|OUTPERFORM|NEUTRAL)?[^.]{0,60}?target price[^.]{0,40}?(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d+)?)/gi;

export interface BrokerageCall {
  brokerage: string;
  rating: string | null;
  targetPrice: number;
  url: string;
  publishedDate: string | null;
}

export interface ConsensusEstimatesData {
  companyName: string;
  brokerageCalls: BrokerageCall[];
  averageTargetPrice: number | null;
  targetPriceRange: { low: number; high: number } | null;
}

export async function getConsensusEstimates(contextInput: ResearchContextInput): Promise<ToolResult<ConsensusEstimatesData>> {
  const context = withObjective(contextInput, "news");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "consensus",
    subject: context.company!,
    numResults: 14,
    cacheNamespace: "consensus_estimates",
    verifyEntity: context.company,
  });

  const brokerageCalls: BrokerageCall[] = [];
  for (const r of results) {
    for (const match of r.text.matchAll(RATING_TP_REGEX)) {
      const targetPrice = parseFloat(match[3].replace(/,/g, ""));
      if (!Number.isNaN(targetPrice)) {
        brokerageCalls.push({ brokerage: match[1].trim(), rating: match[2] ?? null, targetPrice, url: r.url, publishedDate: r.publishedDate });
      }
    }
  }

  const prices = brokerageCalls.map((c) => c.targetPrice);
  const averageTargetPrice = prices.length > 0 ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null;
  const targetPriceRange = prices.length > 0 ? { low: Math.min(...prices), high: Math.max(...prices) } : null;

  return {
    data: { companyName: context.company!, brokerageCalls, averageTargetPrice, targetPriceRange },
    citations,
    confidence: brokerageCalls.length > 0 ? Math.min(confidence, 0.5) : Math.min(confidence, 0.25),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          "IMPORTANT: this is NOT a consensus-estimate feed. It's individual brokerage target prices that happened to be covered in press search results, pattern-matched from free text. A real 'Street consensus' figure (as Bloomberg/Refinitiv/CapitalIQ would report it) requires a paid market-data subscription this server does not have — averageTargetPrice here is an average of whatever handful of calls this search happened to surface, not a representative consensus. State it as such, never as 'the Street expects'.",
      },
    }),
  };
}

export function registerConsensusEstimatesTool(server: FastMCP): void {
  server.addTool({
    name: "consensus_estimates",
    description:
      "Pulls individually-reported brokerage target prices/ratings from press coverage. This is explicitly NOT a Bloomberg/Refinitiv-style consensus feed — this server has no paid market-data subscription, so there is no honest way to compute a real Street consensus. Use this for 'here's what a few brokerages have said', never present averageTargetPrice as 'the market consensus'.",
    parameters: paramsSchema,
    annotations: { title: "Consensus Estimates (Best-Effort)", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getConsensusEstimates(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
