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

export const managementCommentaryMeta: ToolMeta = {
  name: "management_commentary",
  category: "news",
  description: "Management guidance / earnings-call commentary — quotes and press coverage of what leadership said about outlook, targets, and strategy.",
  inputs: ["context.company"],
  outputs: ["mentions[]"],
  requiredSources: ["news", "company"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const GUIDANCE_REGEX =
  /(guidance|guided|outlook|target(?:s|ed)?|expect(?:s|ed)?|aim(?:s|ed)? to|plan(?:s|ned)? to)[^.]{0,200}/gi;

export interface CommentaryMention {
  title: string;
  url: string;
  publishedDate: string | null;
  guidanceSnippets: string[];
}

export interface ManagementCommentaryData {
  companyName: string;
  mentions: CommentaryMention[];
}

export async function getManagementCommentary(contextInput: ResearchContextInput): Promise<ToolResult<ManagementCommentaryData>> {
  const context = withObjective(contextInput, "news");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "concall",
    subject: context.company!,
    numResults: 14,
    cacheNamespace: "management_commentary",
    verifyEntity: context.company,
  });

  const mentions: CommentaryMention[] = results
    .map((r) => {
      const guidanceSnippets = Array.from(r.text.matchAll(GUIDANCE_REGEX))
        .map((m) => m[0].trim())
        .slice(0, 5);
      if (guidanceSnippets.length === 0) return null;
      return { title: r.title, url: r.url, publishedDate: r.publishedDate, guidanceSnippets };
    })
    .filter((m): m is CommentaryMention => m !== null);

  return {
    data: { companyName: context.company!, mentions },
    citations,
    confidence: mentions.length > 0 ? confidence : Math.min(confidence, 0.35),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          mentions.length === 0
            ? "No management guidance/outlook commentary was found in the trailing news window — check the company's latest earnings-call transcript or investor-presentation directly."
            : "These are guidance-shaped sentence fragments pulled from press coverage of earnings calls, not a verified transcript quote — attribute carefully (e.g. 'per <outlet>'s coverage of the call') rather than as a direct quote unless the source itself is the transcript.",
      },
    }),
  };
}

export function registerManagementCommentaryTool(server: FastMCP): void {
  server.addTool({
    name: "management_commentary",
    description:
      "Finds management guidance and outlook commentary from earnings-call coverage and press interviews — the 'what did management say about the next few quarters' input every real initiating-coverage note works from. Returns guidance-shaped sentence fragments from press coverage, not verified transcript quotes — attribute to the covering outlet unless the source is the transcript itself.",
    parameters: paramsSchema,
    annotations: { title: "Management Commentary", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getManagementCommentary(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
