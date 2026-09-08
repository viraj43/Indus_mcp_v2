import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSearchPipeline } from "../../core/pipeline/searchPipeline.js";
import { ResearchContextInputSchema, withObjective, type ResearchContextInput } from "../../types/context.js";
import { buildResponse, errorResponse, type ToolResult } from "../../types/common.js";
import { buildEvidenceMetadata } from "../shared/evidenceMetadata.js";
import type { ToolMeta } from "../../types/toolMeta.js";

const paramsSchema = z.object({
  context: ResearchContextInputSchema.required({ company: true }),
  /** The specific KPI names to look for, e.g. ["same store sales growth",
   * "store count", "DAU", "MAU", "average daily turnover"] — this tool
   * deliberately doesn't guess which operating metrics matter for an
   * arbitrary company's sector; the caller (who by this point has read the
   * industry/competitor sections) supplies the vocabulary. Defaults to a
   * generic cross-sector list when omitted. */
  metricNames: z.array(z.string()).optional(),
});

export const operatingMetricsMeta: ToolMeta = {
  name: "operating_metrics",
  category: "financial",
  description: "Sector-specific operating KPIs (store count, SSSG, DAU/MAU, ADTO, GMV, etc.) pattern-matched from investor-presentation and press coverage for named metrics.",
  inputs: ["context.company", "metricNames?"],
  outputs: ["metrics[]"],
  requiredSources: ["financialData", "company"],
  caching: true,
  estimatedRuntimeMs: 3000,
};

const DEFAULT_METRICS = [
  "same store sales growth",
  "SSSG",
  "store count",
  "stores",
  "DAU",
  "MAU",
  "monthly active users",
  "GMV",
  "average order value",
  "average daily turnover",
  "ADTO",
  "market share",
  "capacity utilization",
  "occupancy",
  "churn",
  "ARPU",
];

const NUMBER_NEAR_REGEX = (metric: string) =>
  new RegExp(`${metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.\\n]{0,60}?([\\d,.]+\\s?(?:%|x|cr(?:ore)?s?|bn|billion|mn|million|lakh?s?)?)`, "gi");

export interface OperatingMetricMention {
  metric: string;
  url: string;
  publishedDate: string | null;
  valueRaw: string;
  context: string;
}

export interface OperatingMetricsData {
  companyName: string;
  metricsSearched: string[];
  mentions: OperatingMetricMention[];
}

export async function getOperatingMetrics(contextInput: ResearchContextInput, metricNames?: string[]): Promise<ToolResult<OperatingMetricsData>> {
  const context = withObjective(contextInput, "financials");
  const metrics = metricNames && metricNames.length > 0 ? metricNames : DEFAULT_METRICS;
  const { results, citations, confidence, evidence, domainsChecked, entityRejectedCount } = await runSearchPipeline({
    context,
    templateKey: "operatingMetrics",
    subject: context.company!,
    numResults: 14,
    cacheNamespace: "operating_metrics",
    verifyEntity: context.company,
  });

  const mentions: OperatingMetricMention[] = [];
  for (const r of results) {
    for (const metric of metrics) {
      const regex = NUMBER_NEAR_REGEX(metric);
      const match = regex.exec(r.text);
      if (match) {
        mentions.push({ metric, url: r.url, publishedDate: r.publishedDate, valueRaw: match[1], context: r.text.slice(Math.max(0, match.index - 80), match.index + 150) });
      }
    }
  }

  return {
    data: { companyName: context.company!, metricsSearched: metrics, mentions },
    citations,
    confidence: mentions.length > 0 ? confidence : Math.min(confidence, 0.3),
    metadata: buildEvidenceMetadata({
      evidence,
      domainsChecked,
      entityRejectedCount,
      extra: {
        note:
          "This is the hardest tool in the server to make reliable: sector-specific operating KPIs (store counts, DAU/MAU, ADTO, SSSG) aren't in any single generalizable schema. Results are pattern-matched proximity of a number to a metric name in free text, not read from a structured KPI table — false positives are more likely here than in any other tool. Always verify against the source URL before quoting a value from this tool.",
      },
    }),
  };
}

export function registerOperatingMetricsTool(server: FastMCP): void {
  server.addTool({
    name: "operating_metrics",
    description:
      "Searches for sector-specific operating KPIs (store count, same-store-sales growth, DAU/MAU, average daily turnover, GMV, capacity utilization, etc.) in investor-presentation and press coverage. Pass metricNames with the specific KPI vocabulary for this company's sector (read from its industry_overview/discover_competitors results first) for a sharper search — without it, falls back to a generic cross-sector list. This is inherently noisier than the server's other tools: results are proximity-matched numbers near a metric name in free text, not a structured KPI table, so treat every value as a lead to verify against its source URL, not a citable fact on its own.",
    parameters: paramsSchema,
    annotations: { title: "Operating Metrics", readOnlyHint: true, openWorldHint: true },
    execute: async (args) => {
      try {
        const result = await getOperatingMetrics(args.context, args.metricNames);
        return buildResponse({ success: true, ...result });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}
