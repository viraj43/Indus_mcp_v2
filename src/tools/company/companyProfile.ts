import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { normalizeCompanyName } from "../../core/normalization/normalizer.js";
import { isValidCIN } from "../../core/quality/validationEngine.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const companyProfileMeta: ToolMeta = {
  name: "company_profile",
  category: "company",
  description: "Registry-grade company profile facts (CIN, incorporation date, registered office).",
  inputs: ["context.company", "context.listed"],
  outputs: ["cin", "incorporationDate", "listingStatus", "sourceUrls"],
  requiredSources: ["company", "mca"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

// Deliberately loose: finds any 21-character alphanumeric token near the
// text, then the Validator stage (isValidCIN) enforces the real CIN
// format rules. This catches candidates a stricter single regex would miss
// due to inconsistent spacing/casing in scraped source text.
const CIN_CANDIDATE_REGEX = /\b[A-Z0-9]{21}\b/g;
const INCORPORATION_REGEX = /incorporat(?:ed|ion)[^.]{0,40}?(\d{1,2}[\s\-/][A-Za-z]{3,9}[\s\-/]\d{4}|\d{4})/i;

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

function findValidCin(text: string): string | null {
  const candidates = Array.from(text.matchAll(CIN_CANDIDATE_REGEX), (m) => m[0]);
  return candidates.find(isValidCIN) ?? null;
}

export interface CompanyProfileData {
  companyName: string;
  cin: string | null;
  incorporationDate: string | null;
  listingStatus: string;
  sourceUrls: string[];
}

/** Core logic, reusable by both the standalone MCP tool and composite
 * orchestrator tools (e.g. generate_institutional_report). */
export async function getCompanyProfile(contextInput: ResearchContextInput): Promise<ToolResult<CompanyProfileData>> {
  const context = withObjective(contextInput, "company_overview");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount, validationIssues } =
    await runSearchPipeline({
      context,
      templateKey: "registryProfile",
      subject: context.company!,
      numResults: 6,
      cacheNamespace: "company_profile",
      verifyEntity: context.company,
      validate: (r) => {
        const combined = r.map((item) => item.text).join(" \n ");
        return findValidCin(combined) ? [] : ["No 21-character token validated as a well-formed CIN."];
      },
    });

  const combinedText = results.map((r) => r.text).join(" \n ");
  const validCin = findValidCin(combinedText);
  const incorporationMatch = combinedText.match(INCORPORATION_REGEX);

  return {
    data: {
      companyName: normalizeCompanyName(context.company!),
      cin: validCin,
      incorporationDate: incorporationMatch?.[1] ?? null,
      listingStatus: context.listed,
      sourceUrls: results.map((r) => r.url),
    },
    citations,
    confidence: validCin ? confidence : Math.min(confidence, 0.6),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: { validationIssues: validationIssues.length ? validationIssues : undefined },
    }),
  };
}

export function registerCompanyProfileTool(server: FastMCP): void {
  server.addTool({
    name: "company_profile",
    description:
      "Retrieves registry-grade company profile facts (CIN, incorporation date, registered office) by searching MCA/Tofler/Zauba/OpenCorporates and the company's own site.",
    parameters: paramsSchema,
    annotations: { title: "Company Profile", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getCompanyProfile(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
