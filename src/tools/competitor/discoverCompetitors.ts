import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { rankPeerCandidates, topPeers, type RankedPeer } from "../../core/competitor/peerRanking.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

export const discoverCompetitorsMeta: ToolMeta = {
  name: "discover_competitors",
  category: "competitor",
  description: "Ranked candidate competitor list — the MCP owns peer selection instead of leaving it to the LLM.",
  inputs: ["context.company", "context.sector"],
  outputs: ["rankedCompetitors[]", "topPeers[]"],
  requiredSources: ["industry", "news"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const COMPETITOR_MENTION_REGEX = /(?:competitors?(?:\s+include|\s+such\s+as|:)?|rivals?(?:\s+such\s+as)?|compet(?:e|ing)\s+with)\s+((?:[A-Z][\w&.'-]*\s*){1,4}(?:,\s*(?:[A-Z][\w&.'-]*\s*){1,4}){0,4})/g;

function extractCandidateNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(COMPETITOR_MENTION_REGEX)) {
    match[1]
      .split(/,|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 60)
      .forEach((s) => names.add(s));
  }
  return Array.from(names);
}

export interface DiscoverCompetitorsData {
  companyName: string;
  rankedCompetitors: RankedPeer[];
  topPeers: RankedPeer[];
}

export async function getDiscoverCompetitors(contextInput: ResearchContextInput): Promise<ToolResult<DiscoverCompetitorsData>> {
  const context = withObjective(contextInput, "competitors");
  const subject = context.sector ? `${context.company} in ${context.sector}` : context.company!;

  const { results, citations, confidence, evidence, domainsChecked } = await runSearchPipeline({
    context,
    templateKey: "competitors",
    subject,
    numResults: 8,
    cacheNamespace: "discover_competitors",
    // Deliberately no verifyEntity here: the whole point of this search is
    // to surface *other* companies, not the searched one.
  });

  const candidateSet = new Set<string>();
  for (const r of results) {
    extractCandidateNames(r.text).forEach((name) => candidateSet.add(name));
  }

  const resultTexts = results.map((r) => `${r.title} ${r.text}`);
  const ranked = rankPeerCandidates(Array.from(candidateSet), resultTexts);
  const top5 = topPeers(ranked, 5);

  return {
    data: { companyName: context.company!, rankedCompetitors: ranked, topPeers: top5 },
    citations,
    confidence: Math.min(confidence, 0.65),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      extra: {
        extractionMethod: "heuristic_text_pattern",
        rankingMethod: "mention_count_weighted_by_listed_signal",
        note: "Candidate names are pattern-extracted and ranked heuristically, not verified — cross-check against listed_peer_comparison before use in a report.",
      },
    }),
  };
}

export function registerDiscoverCompetitorsTool(server: FastMCP): void {
  server.addTool({
    name: "discover_competitors",
    description:
      "Searches industry-analyst and news sources for named competitors/rivals of a company, extracts candidates via text-pattern heuristics, then ranks them (mention frequency across sources + a listed-company signal) and returns a top-5 — the server picks peers deterministically instead of leaving selection to the calling model.",
    parameters: paramsSchema,
    annotations: { title: "Discover Competitors", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getDiscoverCompetitors(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
