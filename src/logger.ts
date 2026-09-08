import pino from "pino";
import { env } from "./config/env.js";

// stdio MCP transport uses stdout exclusively for protocol messages, so all
// logging (in every environment) must go to stderr (destination: 2) or it
// will corrupt the MCP stream.
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname", destination: 2 },
  },
});

export function childLogger(name: string) {
  return logger.child({ module: name });
}
