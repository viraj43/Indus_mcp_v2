import type { SourceTier } from "../sources/types.js";

/** Every MCP tool in this server returns this envelope, per the response
 * contract in the project spec: success flag, payload, citations, an
 * aggregate confidence score, and free-form metadata. */
export interface ToolResponse<T> {
  success: boolean;
  data: T | null;
  citations: Citation[];
  confidence: number;
  metadata: Record<string, unknown>;
  error?: string;
}

/** Every citation carries the four components the Source Priority Engine
 * scores it on: Tier (where the source sits in the trust hierarchy),
 * Authority (the source's baseline trust score), Recency (a penalty for
 * stale documents), and the resulting combined Confidence. */
export interface Citation {
  source: string;
  url: string;
  publicationDate: string | null;
  evidenceSnippet: string;
  tier: SourceTier;
  authority: number;
  recencyPenalty: number;
  confidenceScore: number;
}

export interface ExaSearchResultItem {
  url: string;
  title: string;
  publishedDate: string | null;
  author: string | null;
  text: string;
  score: number;
}

/** The shape a tool's core logic function returns, before it's wrapped
 * into a ToolResponse envelope. Every research tool splits into a plain
 * `get<Thing>(context)` function returning this, plus a thin
 * `registerXTool` that wraps it for MCP — so composite/orchestrator tools
 * (e.g. generate_institutional_report) can call the same logic directly,
 * in-process, instead of re-entering the MCP protocol for each phase. */
export interface ToolResult<T> {
  data: T;
  citations: Citation[];
  confidence: number;
  metadata: Record<string, unknown>;
}

/** Builds the envelope object (not JSON-stringified) — exported for the
 * rare tool that needs to embed it alongside other MCP content blocks
 * (e.g. generate_pdf attaching a binary resource block next to the JSON
 * envelope). Most tools should use buildResponse()/errorResponse() below
 * instead, which return the JSON string FastMCP's execute return type
 * requires. */
export function makeEnvelope<T>(params: {
  success: boolean;
  data: T | null;
  citations?: Citation[];
  confidence?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}): ToolResponse<T> {
  return {
    success: params.success,
    data: params.data,
    citations: params.citations ?? [],
    confidence: params.confidence ?? 0,
    metadata: params.metadata ?? {},
    ...(params.error ? { error: params.error } : {}),
  };
}

/** Builds the standard tool response envelope and serializes it to JSON
 * text — the shape FastMCP's `execute` return type requires — so every
 * tool can just `return buildResponse({...})` directly. */
export function buildResponse<T>(params: {
  success: boolean;
  data: T | null;
  citations?: Citation[];
  confidence?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}): string {
  return JSON.stringify(makeEnvelope(params));
}

export function errorResponse(message: string, metadata: Record<string, unknown> = {}): string {
  return JSON.stringify(makeEnvelope<null>({ success: false, data: null, confidence: 0, metadata, error: message }));
}
