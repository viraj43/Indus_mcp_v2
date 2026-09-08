import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema,
});

export const industryOverviewMeta: ToolMeta = {
  name: "industry_overview",
  category: "industry",
  description:
    "Macro / industry-level research (structure, key players, growth drivers, TAM) from consulting/analyst sources — the same role 'Industry Overview'/'Appendix: Industry' plays in a sell-side initiating-coverage report, upstream of company-specific (micro) analysis.",
  inputs: ["context.sector", "context.company?", "context.country"],
  outputs: ["summary", "sourceUrls"],
  requiredSources: ["industry"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

export interface IndustryOverviewData {
  industry: string;
  summary: string;
  sourceUrls: string[];
}

/** A sector-less caller (e.g. generate_institutional_report, which doesn't
 * always know the company's sector upfront) still gets a real macro
 * section — the search subject just falls back to the company name itself
 * ("<Company> industry overview and market size") instead of requiring the
 * caller to already know and pass the sector. Every real initiating-coverage
 * report we've reviewed (PL Capital, ICICI Securities, Motilal Oswal) opens
 * or appendices this kind of section, so it shouldn't be an optional add-on
 * gated behind a parameter the calling model may not have yet. */
function buildSubject(context: ResearchContextInput): string {
  const base = context.sector ?? `${context.company} industry`;
  return context.country === "india" ? `${base} in India` : base;
}

export async function getIndustryOverview(contextInput: ResearchContextInput): Promise<ToolResult<IndustryOverviewData>> {
  if (!contextInput.sector && !contextInput.company) {
    throw new Error("industry_overview requires context.sector or context.company (at least one) to search against.");
  }
  const context = withObjective(contextInput, "industry");
  const subject = buildSubject(context);
  const { results, citations, confidence, evidence, domainsChecked } = await runSearchPipeline({
    context,
    templateKey: "overview",
    subject,
<<<<<<< HEAD
    numResults: 14,
=======
    numResults: 8,
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
    cacheNamespace: "industry_overview",
  });

  return {
    data: {
      industry: context.sector ?? context.company ?? "unspecified",
<<<<<<< HEAD
      summary: results.slice(0, 9).map((r) => r.text.slice(0, 1500)).join("\n\n"),
=======
      summary: results.slice(0, 4).map((r) => r.text.slice(0, 500)).join("\n\n"),
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
      sourceUrls: results.map((r) => r.url),
    },
    citations,
    confidence,
    metadata: buildEvidenceMetadata({ evidence, domainsChecked }),
  };
}

export function registerIndustryOverviewTool(server: FastMCP): void {
  server.addTool({
    name: "industry_overview",
    description:
      "Retrieves macro/industry-level research (market structure, key players, growth drivers, TAM/market size) from top-tier consulting/research sources (Deloitte, PwC, EY, KPMG, McKinsey, Bain, BCG, IMARC, Statista, NASSCOM) — the industry-wide context a company-specific (micro) report should sit inside. Pass context.sector when known for a sharper search; if omitted, falls back to searching around context.company's own industry.",
    parameters: paramsSchema,
    annotations: { title: "Industry Overview", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getIndustryOverview(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
