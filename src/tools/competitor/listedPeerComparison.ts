import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective } from "../../types/context.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

export const listedPeerComparisonMeta: ToolMeta = {
  name: "listed_peer_comparison",
  category: "competitor",
  description: "A listed company's own financial snapshot (market cap, P/E) from screener.in/Trendlyne/exchange sources, for comparing against peers found via discover_competitors.",
  inputs: ["context.company"],
  outputs: ["financialSnapshotMentions[]"],
  requiredSources: ["financialData", "exchange", "news"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const MARKET_CAP_REGEX = /market cap(?:italization)?[^.]{0,40}?([₹$]\s?[\d,.]+\s?(cr(ore)?s?|lakh?s?|billion|bn|million|mn))/i;
const PE_RATIO_REGEX = /P\/?E\s?(?:ratio)?[^.]{0,20}?(\d+(?:\.\d+)?)/i;

export function registerListedPeerComparisonTool(server: FastMCP): void {
  server.addTool({
    name: "listed_peer_comparison",
    description:
      "Retrieves a listed company's own financial snapshot (market cap, P/E, shareholding-pattern context) from screener.in, Trendlyne, Ace Equity-adjacent sources, and exchange/finance portals — meant to be run once per company (the target and each peer discover_competitors identifies) so the results can be assembled into a peer-comparison table.",
    parameters: paramsSchema,
    annotations: { title: "Listed Peer Comparison", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const context = withObjective(args.context, "competitors");
        const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
          context,
          templateKey: "peerComparison",
          subject: context.company!,
          numResults: 8,
          cacheNamespace: "listed_peer_comparison",
          verifyEntity: context.company,
        });

        const financialSnapshotMentions = results.map((r) => ({
          url: r.url,
          publishedDate: r.publishedDate,
          marketCapRaw: r.text.match(MARKET_CAP_REGEX)?.[1] ?? null,
          peRatio: r.text.match(PE_RATIO_REGEX)?.[1] ? parseFloat(r.text.match(PE_RATIO_REGEX)![1]) : null,
          snippet: r.text.slice(0, 300),
        }));

        return buildResponse({
          success: true,
          data: { companyName: context.company, financialSnapshotMentions },
          citations,
          confidence,
          metadata: buildEvidenceMetadata({
            evidence,
            domainsChecked,
            entityRejectedCount,
            extra: {
              note: "Figures are pattern-extracted from search snippets, not read from a structured screener/exchange table — verify against the source URL before quoting.",
            },
          }),
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
