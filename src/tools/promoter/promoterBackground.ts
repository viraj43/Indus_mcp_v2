import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }).describe(
    "context.company should be the promoter/director's name, or the company name if screening its leadership generally",
  ),
});

export const promoterBackgroundMeta: ToolMeta = {
  name: "promoter_background",
  category: "promoter",
  description: "Screens a promoter/director name for disqualification, debarment, or regulatory penalty records.",
  inputs: ["context.company (promoter/director name)"],
  outputs: ["flags[]"],
  requiredSources: ["regulator", "mca", "company"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const DISQUALIFICATION_REGEX = /disqualif(?:ied|ication)|debarred|barred from|penalty order|show[\s-]cause/i;

export interface PromoterFlag {
  title: string;
  url: string;
  publishedDate: string | null;
  snippet: string;
}

export interface PromoterBackgroundData {
  name: string;
  flags: PromoterFlag[];
  screenClean: boolean;
}

export async function getPromoterBackground(contextInput: ResearchContextInput): Promise<ToolResult<PromoterBackgroundData>> {
  const context = withObjective(contextInput, "promoters");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "promoterCheck",
    subject: context.company!,
    numResults: 8,
    cacheNamespace: "promoter_background",
    cacheTtlSeconds: 1800,
    verifyEntity: context.company,
  });

  const flags = results
    .filter((r) => DISQUALIFICATION_REGEX.test(r.text))
    .map((r) => ({ title: r.title, url: r.url, publishedDate: r.publishedDate, snippet: r.text.slice(0, 300) }));

  return {
    data: { name: context.company!, flags, screenClean: flags.length === 0 },
    citations,
    confidence: flags.length > 0 ? confidence : Math.min(confidence, 0.6),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note: "Entity-matched hits still require manual review — a shared name doesn't confirm identity beyond doubt for very common names.",
      },
    }),
  };
}

export function registerPromoterBackgroundTool(server: FastMCP): void {
  server.addTool({
    name: "promoter_background",
    description:
      "Screens a promoter or director name against SEBI/MCA/registry sources for disqualification, debarment, or regulatory penalty records. Pass the individual's name (or the company name to screen its leadership generally) as context.company.",
    parameters: paramsSchema,
    annotations: { title: "Promoter Background Check", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getPromoterBackground(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
