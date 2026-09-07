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

export const searchCompanyMeta: ToolMeta = {
  name: "search_company",
  category: "company",
  description: "Resolve a company name to its official website, LinkedIn, and registry presence.",
  inputs: ["context.company", "context.country"],
  outputs: ["candidates[]"],
  requiredSources: ["company", "mca"],
  caching: true,
  estimatedRuntimeMs: 2000,
};

export function registerSearchCompanyTool(server: FastMCP): void {
  server.addTool({
    name: "search_company",
    description:
      "Discover a company's official website, LinkedIn, and registry presence via domain-restricted Exa search. Use this first to resolve a company name to authoritative source URLs before calling other company tools.",
    parameters: paramsSchema,
    annotations: { title: "Search Company", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const context = withObjective(args.context, "company_overview");
        const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
          context,
          templateKey: "discovery",
          subject: context.company!,
          numResults: 6,
          cacheNamespace: "search_company",
          verifyEntity: context.company,
        });

        return buildResponse({
          success: true,
          data: {
            companyName: context.company,
            candidates: results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.text.slice(0, 300),
              publishedDate: r.publishedDate,
            })),
          },
          citations,
          confidence,
          metadata: buildEvidenceMetadata({ evidence, domainsChecked, entityRejectedCount }),
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
