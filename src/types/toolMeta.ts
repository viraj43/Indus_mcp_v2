import type { SourceName } from "../sources/index.js";

export type ToolCategory =
  | "company"
  | "financial"
  | "valuation"
  | "funding"
  | "competitor"
  | "industry"
  | "news"
  | "litigation"
  | "promoter"
  | "report"
  | "export"
  | "ops";

/** Every MCP tool describes itself with one of these, exported alongside
 * its registerXTool function. Aggregated into registerTools.ts's
 * TOOL_REGISTRY — useful for auto-generated docs, capability discovery,
 * and reasoning about cost/latency once the tool count reaches 40+. */
export interface ToolMeta {
  name: string;
  category: ToolCategory;
  description: string;
  inputs: string[];
  outputs: string[];
  /** Source profiles this tool's searches are routed through; empty for
   * tools that do no search (pure calculation, or report assembly). */
  requiredSources: SourceName[];
  caching: boolean;
  estimatedRuntimeMs: number;
}
