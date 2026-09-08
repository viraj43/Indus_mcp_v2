import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { getRedisClient } from "../../cache/redisClient.js";
import { env } from "../../config/env.js";
import { buildResponse } from "../../types/common.js";
import { TOOL_REGISTRY } from "../toolRegistry.js";

export function registerHealthCheckTool(server: FastMCP): void {
  server.addTool({
    name: "health_check",
    description: "Reports server health: config validity, Redis cache connectivity, Postgres configuration status, and the tool capability registry.",
    parameters: z.object({}),
    annotations: { title: "Health Check", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async () => {
      const redis = getRedisClient();
      let redisStatus: "connected" | "connecting" | "unavailable" = "unavailable";
      if (redis) {
        redisStatus = redis.status === "ready" ? "connected" : "connecting";
      }

      return buildResponse({
        success: true,
        data: {
          status: "ok",
          redis: redisStatus,
          postgresConfigured: Boolean(env.DATABASE_URL),
          exaConfigured: Boolean(env.EXA_API_KEY),
          uptimeSeconds: Math.round(process.uptime()),
          toolCount: TOOL_REGISTRY.length + 1,
          tools: TOOL_REGISTRY.map((t) => ({
            name: t.name,
            category: t.category,
            requiredSources: t.requiredSources,
            caching: t.caching,
          })),
        },
        confidence: 1,
        metadata: { version: "0.1.0" },
      });
    },
  });
}
