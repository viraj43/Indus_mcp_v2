import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import { parseFinancialNumber } from "../../core/normalization/normalizer.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
});

export const segmentRevenueMeta: ToolMeta = {
  name: "segment_revenue",
  category: "financial",
  description: "Business-segment / channel revenue mix (e.g. Online vs Offline, product-line splits) when a company discloses it — no fabricated split when it doesn't.",
  inputs: ["context.company"],
  outputs: ["mentions[]"],
  requiredSources: ["financialData", "company"],
  caching: true,
  estimatedRuntimeMs: 2500,
};

// "Online revenue contributed 62%" / "Offline: 38% of revenue" / "Segment A
// accounted for INR 420 cr" — genuinely no way to generalize this to every
// possible segment name, so this only tags the number to whatever label
// text immediately precedes it, and leaves interpretation of which labels
// are the real segments to the caller.
const SEGMENT_SHARE_REGEX = /([A-Z][A-Za-z &/-]{2,30})\s*(?:segment|business|revenue)?[\s:]{0,3}(?:contributed|accounted for|was|stood at)?\s*(?:INR|Rs\.?|₹)?\s*([\d,.]+\s?(?:%|cr(?:ore)?s?|bn|billion|mn|million))/g;

export interface SegmentMention {
  url: string;
  publishedDate: string | null;
  labeledValues: { label: string; raw: string; normalized: number | null }[];
  snippet: string;
}

export interface SegmentRevenueData {
  companyName: string;
  mentions: SegmentMention[];
}

export async function getSegmentRevenue(contextInput: ResearchContextInput): Promise<ToolResult<SegmentRevenueData>> {
  const context = withObjective(contextInput, "financials");
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "segmentRevenue",
    subject: context.company!,
    numResults: 12,
    cacheNamespace: "segment_revenue",
    verifyEntity: context.company,
  });

  const mentions: SegmentMention[] = results
    .map((r) => {
      const matches = Array.from(r.text.matchAll(SEGMENT_SHARE_REGEX));
      if (matches.length < 2) return null; // need at least 2 labeled values to look like an actual mix, not a stray sentence
      const labeledValues = matches.map((m) => ({ label: m[1].trim(), raw: m[2], normalized: parseFinancialNumber(m[2]) }));
      return { url: r.url, publishedDate: r.publishedDate, labeledValues, snippet: r.text.slice(0, 1000) };
    })
    .filter((m): m is SegmentMention => m !== null);

  return {
    data: { companyName: context.company!, mentions },
    citations,
    confidence: mentions.length > 0 ? confidence : Math.min(confidence, 0.3),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          mentions.length === 0
            ? "No segment/channel revenue split was found — not every company discloses one; check the company's investor presentation or annual-report segment note directly."
            : "Segment labels and values are pattern-matched from narrative text, not read from a structured filing table — this can mis-split a sentence with an unrelated number. Verify against the source URL before treating a labeled value as a clean revenue-mix figure.",
      },
    }),
  };
}

export function registerSegmentRevenueTool(server: FastMCP): void {
  server.addTool({
    name: "segment_revenue",
    description:
      "Finds business-segment or channel revenue mix (e.g. Online vs Offline, product-line splits) when a company discloses one in its investor presentation, annual report, or press coverage. Not every company reports this — returns an empty mentions[] rather than a fabricated split when it isn't disclosed. Pattern-matched from narrative text, so verify labeled values against the source URL.",
    parameters: paramsSchema,
    annotations: { title: "Segment Revenue Mix", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getSegmentRevenue(args.context);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
