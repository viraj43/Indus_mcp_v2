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

export const shareholdingPatternMeta: ToolMeta = {
  name: "shareholding_pattern",
  category: "company",
  description: "Promoter / DII / FII / Public shareholding split for a listed company, with quarter-over-quarter comparison where available.",
  inputs: ["context.company"],
  outputs: ["holders[]", "asOf"],
  requiredSources: ["financialData", "exchange"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

// Matches "Promoter 71.3%" / "Promoters: 71.3" / "FII 12.0%" style lines —
// screener.in, Trendlyne, and BSE/NSE shareholding disclosures all render
// this as some variant of "<holder category> <number>%".
const HOLDER_PATTERNS: Record<string, RegExp> = {
  promoter: /promoters?[\s:]{1,3}(\d{1,3}(?:\.\d+)?)\s?%/i,
  fii: /(?:FII|FPI)s?[\s:]{1,3}(\d{1,3}(?:\.\d+)?)\s?%/i,
  dii: /DIIs?[\s:]{1,3}(\d{1,3}(?:\.\d+)?)\s?%/i,
  public: /public[\s:]{1,3}(\d{1,3}(?:\.\d+)?)\s?%/i,
  government: /government[\s:]{1,3}(\d{1,3}(?:\.\d+)?)\s?%/i,
};
const PLEDGE_REGEX = /pledg(?:e|ed)[\s:]{0,3}(\d{1,3}(?:\.\d+)?)\s?%/i;

export interface ShareholdingMention {
  url: string;
  publishedDate: string | null;
  holdingPercentByCategory: Record<string, number>;
  pledgePercent: number | null;
  snippet: string;
}

export interface ShareholdingPatternData {
  companyName: string;
  mentions: ShareholdingMention[];
  latestByCategory: Record<string, number> | null;
}

export async function getShareholdingPattern(contextInput: ResearchContextInput): Promise<ToolResult<ShareholdingPatternData>> {
  const context = withObjective(contextInput, "financials");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "shareholding",
    subject: context.company!,
    numResults: 12,
    cacheNamespace: "shareholding_pattern",
    verifyEntity: context.company,
  });

  const mentions: ShareholdingMention[] = results
    .map((r) => {
      const holdingPercentByCategory: Record<string, number> = {};
      for (const [category, pattern] of Object.entries(HOLDER_PATTERNS)) {
        const m = r.text.match(pattern);
        if (m) holdingPercentByCategory[category] = parseFloat(m[1]);
      }
      const pledgeMatch = r.text.match(PLEDGE_REGEX);
      if (Object.keys(holdingPercentByCategory).length === 0 && !pledgeMatch) return null;
      return {
        url: r.url,
        publishedDate: r.publishedDate,
        holdingPercentByCategory,
        pledgePercent: pledgeMatch ? parseFloat(pledgeMatch[1]) : null,
        snippet: r.text.slice(0, 700),
      };
    })
    .filter((m): m is ShareholdingMention => m !== null);

  // "Latest" is a best-effort pick: the mention with the most categories
  // populated (i.e. the most complete single snippet), not necessarily the
  // most recent by date — Exa doesn't reliably return publishedDate for
  // every screener/trendlyne page, so sorting by completeness is more
  // useful than sorting by a frequently-null date.
  const latest = [...mentions].sort(
    (a, b) => Object.keys(b.holdingPercentByCategory).length - Object.keys(a.holdingPercentByCategory).length,
  )[0];

  return {
    data: {
      companyName: context.company!,
      mentions,
      latestByCategory: latest && Object.keys(latest.holdingPercentByCategory).length > 0 ? latest.holdingPercentByCategory : null,
    },
    citations,
    confidence: mentions.length > 0 ? confidence : Math.min(confidence, 0.35),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          mentions.length === 0
            ? "No shareholding-pattern figures found in retrieved sources — check screener.in or the exchange's shareholding-pattern filing directly."
            : "Figures are pattern-extracted from search snippets (screener.in/Trendlyne/exchange pages), not read from a structured filing table — verify against the source URL, especially for a company with an unusual name that a generic 'Promoter X%' pattern could mismatch.",
      },
    }),
  };
}

export function registerShareholdingPatternTool(server: FastMCP): void {
  server.addTool({
    name: "shareholding_pattern",
    description:
      "Retrieves a listed company's Promoter / FII / DII / Public shareholding split (and pledge %, where disclosed) from screener.in, Trendlyne, and exchange sources. Every real institutional note carries this as a standalone exhibit — pattern-extracted from search snippets, so verify against the source URL before quoting in a client-facing report.",
    parameters: paramsSchema,
    annotations: { title: "Shareholding Pattern", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getShareholdingPattern(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
