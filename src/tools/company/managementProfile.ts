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

export const managementProfileMeta: ToolMeta = {
  name: "management_profile",
  category: "company",
  description: "Key management personnel and board members — name, designation, background — sourced from LinkedIn, the company's own site, and filings.",
  inputs: ["context.company"],
  outputs: ["people[]"],
  requiredSources: ["company", "mca"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

const DESIGNATION_REGEX =
  /(Chief Executive Officer|CEO|Chief Financial Officer|CFO|Chief Operating Officer|COO|Managing Director|MD|Chairman|Company Secretary|Whole[- ]?time Director|Independent Director|Chief Technology Officer|CTO|Founder|Co[- ]?[Ff]ounder|Executive Director)/g;

export interface ManagementMention {
  title: string;
  url: string;
  publishedDate: string | null;
  designationsFound: string[];
  snippet: string;
}

export interface ManagementProfileData {
  companyName: string;
  mentions: ManagementMention[];
}

export async function getManagementProfile(contextInput: ResearchContextInput): Promise<ToolResult<ManagementProfileData>> {
  const context = withObjective(contextInput, "company_overview");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "management",
    subject: context.company!,
    numResults: 12,
    cacheNamespace: "management_profile",
    verifyEntity: context.company,
  });

  const mentions: ManagementMention[] = results
    .map((r) => {
      const designations = [...new Set(Array.from(r.text.matchAll(DESIGNATION_REGEX)).map((m) => m[1]))];
      if (designations.length === 0) return null;
      return { title: r.title, url: r.url, publishedDate: r.publishedDate, designationsFound: designations, snippet: r.text.slice(0, 1000) };
    })
    .filter((m): m is ManagementMention => m !== null);

  return {
    data: { companyName: context.company!, mentions },
    citations,
    confidence: mentions.length > 0 ? confidence : Math.min(confidence, 0.4),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          mentions.length === 0
            ? "No management/board mentions with a recognizable designation were found — check the company's annual report 'Board of Directors' / 'Key Managerial Personnel' section directly."
            : "Names and bios are read out of narrative search snippets (LinkedIn, company site, annual report text), not a structured filing field — cross-check the person's identity against the source URL, especially for common names.",
      },
    }),
  };
}

export function registerManagementProfileTool(server: FastMCP): void {
  server.addTool({
    name: "management_profile",
    description:
      "Retrieves key management personnel and board member profiles (name, designation, background) from LinkedIn, the company's own site, and annual-report text. Every real initiating-coverage note carries brief management/board biographies as a standalone exhibit — this is pattern-extracted from narrative search snippets, so verify identity against the source URL before quoting.",
    parameters: paramsSchema,
    annotations: { title: "Management Profile", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getManagementProfile(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
