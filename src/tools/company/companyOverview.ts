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

export const companyOverviewMeta: ToolMeta = {
  name: "company_overview",
  category: "company",
  description: "Narrative business overview: what the company does, products/services, target market.",
  inputs: ["context.company"],
  outputs: ["summary", "sourceUrls"],
  requiredSources: ["company", "mca"],
  caching: true,
  estimatedRuntimeMs: 2000,
};

export interface CompanyOverviewData {
  companyName: string;
  summary: string;
  sourceUrls: string[];
}

export async function getCompanyOverview(contextInput: ResearchContextInput): Promise<ToolResult<CompanyOverviewData>> {
  const context = withObjective(contextInput, "company_overview");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "overview",
    subject: context.company!,
    numResults: 6,
    cacheNamespace: "company_overview",
    verifyEntity: context.company,
  });

  const summary = results
    .slice(0, 3)
    .map((r) => r.text.slice(0, 500))
    .join("\n\n");

  return {
    data: { companyName: context.company!, summary, sourceUrls: results.map((r) => r.url) },
    citations,
    confidence,
    metadata: buildEvidenceMetadata({ evidence, domainsChecked, entityRejectedCount }),
  };
}

export function registerCompanyOverviewTool(server: FastMCP): void {
  server.addTool({
    name: "company_overview",
    description:
      "Produces a narrative business overview (what the company does, products/services, target market) sourced from the company's own site and LinkedIn.",
    parameters: paramsSchema,
    annotations: { title: "Company Overview", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getCompanyOverview(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
