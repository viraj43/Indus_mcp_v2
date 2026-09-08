import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective } from "../../types/context.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import { findScreenerSlug, fetchScreenerPage } from "../../core/financial/screenerLookup.js";
import { extractScreenerTopRatios } from "../../core/extraction/screenerExtractor.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  companyNames: z.array(z.string()).min(1).max(15).describe("Peer companies to look up — typically the target company plus discover_competitors' output"),
});

export const globalPeerCompsMeta: ToolMeta = {
  name: "global_peer_comps",
  category: "competitor",
  description:
    "Builds a peer-multiples table from real screener.in structured data for whichever peers are Indian-listed (CMP, Market Cap, P/E, Book Value, ROCE, ROE); every peer that ISN'T Indian-listed (private, or listed abroad) is honestly reported as not_available rather than filled with an invented forward multiple. This server has no Bloomberg/CapitalIQ/Refinitiv access — a clean multi-year forward-multiple table across global peers (the kind Motilal Oswal's Exhibit 2 shows) genuinely requires a paid market-data subscription this server doesn't have.",
  inputs: ["companyNames[]"],
  outputs: ["peers[]"],
  requiredSources: ["financialData"],
  caching: true,
  estimatedRuntimeMs: 4000,
};

export interface PeerCompRow {
  companyName: string;
  status: "available" | "not_available";
  ratios?: Record<string, number | null>;
  reason?: string;
}

export interface GlobalPeerCompsData {
  peers: PeerCompRow[];
  coverageNote: string;
}

export function registerGlobalPeerCompsTool(server: FastMCP): void {
  server.addTool({
    name: "global_peer_comps",
    description:
      "For each peer company name passed in (typically the target plus discover_competitors' output), attempts to find it on screener.in and pull its real point-in-time valuation multiples (CMP, Market Cap, Stock P/E, Book Value, ROCE, ROE). Only works for Indian-listed companies — a peer that's private, or listed on a foreign exchange, comes back status: 'not_available' with a reason, never a fabricated multiple. This is the honest ceiling without a paid market-data subscription (Bloomberg/CapitalIQ/Refinitiv): a real multi-year forward-consensus peer table across global names — the kind a bulge-bracket note shows — is NOT reproducible from free web search, and this tool will not pretend otherwise.",
    parameters: paramsSchema,
    annotations: { title: "Global Peer Comps (Indian-Listed Only)", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const peers: PeerCompRow[] = [];

        for (const companyName of args.companyNames) {
          const context = withObjective({ company: companyName, country: "india", listed: "unknown", date: new Date().toISOString() }, "financials");
          const { results } = await runSearchPipeline({
            context,
            templateKey: "peerComparison",
            subject: companyName,
            numResults: 6,
            cacheNamespace: "global_peer_comps",
            verifyEntity: companyName,
          });

          const slug = findScreenerSlug(results);
          if (!slug) {
            peers.push({ companyName, status: "not_available", reason: "Not found on screener.in — likely not Indian-listed, or not covered under this name. No forward-multiple data available without a paid market-data subscription." });
            continue;
          }
          const html = await fetchScreenerPage(slug);
          if (!html) {
            peers.push({ companyName, status: "not_available", reason: "screener.in page found but could not be fetched (rate-limited or page layout issue)." });
            continue;
          }
          const topRatios = extractScreenerTopRatios(html);
          if (Object.keys(topRatios).length === 0) {
            peers.push({ companyName, status: "not_available", reason: "screener.in page fetched but no ratio grid could be parsed." });
            continue;
          }
          peers.push({ companyName, status: "available", ratios: topRatios });
        }

        const availableCount = peers.filter((p) => p.status === "available").length;
        return buildResponse({
          success: true,
          data: {
            peers,
            coverageNote: `${availableCount}/${peers.length} peer(s) resolved to real screener.in point-in-time multiples. Multiples shown are trailing/current, not forward-year estimates (screener.in doesn't publish consensus forward estimates) — for a forward-multiple comparison table like a bulge-bracket note shows, that requires a paid market-data terminal this server doesn't have.`,
          },
          citations: [],
          confidence: availableCount > 0 ? 0.7 : 0.2,
          metadata: { note: "Real point-in-time data for Indian-listed peers only; every other peer is honestly reported as not_available, never estimated." },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
