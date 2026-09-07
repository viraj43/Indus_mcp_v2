import { FastMCP } from "fastmcp";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { registerAllTools } from "./tools/registerTools.js";

const server = new FastMCP({
  name: "INDUSS Research Intelligence",
  version: "0.1.0",
  health: { enabled: true, path: "/health" },
});

registerAllTools(server);

async function main() {
  if (env.MCP_TRANSPORT === "httpStream") {
    await server.start({
      transportType: "httpStream",
      httpStream: { port: env.MCP_HTTP_PORT, endpoint: "/mcp", host: "0.0.0.0" },
    });
    logger.info({ port: env.MCP_HTTP_PORT }, "INDUSS MCP server listening (httpStream)");
  } else {
    await server.start({ transportType: "stdio" });
    logger.info("INDUSS MCP server listening (stdio)");
  }
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start INDUSS MCP server");
  process.exit(1);
});
