import { Queue, Worker, type Job, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { childLogger } from "../logger.js";

const log = childLogger("queue");

// BullMQ requires its own connection with maxRetriesPerRequest disabled.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
connection.on("error", (err: Error) => log.warn({ err: err.message }, "BullMQ Redis connection error"));

export const RESEARCH_QUEUE_NAME = "induss-research-jobs";

export interface ResearchJobData {
  toolName: string;
  params: Record<string, unknown>;
  requestedAt: string;
}

let queue: Queue<ResearchJobData> | null = null;

/** Lazily creates the shared research job queue. Used for long-running
 * work (e.g. full report generation across many sources) that a tool call
 * can enqueue instead of blocking on synchronously. */
export function getResearchQueue(): Queue<ResearchJobData> {
  if (!queue) {
    queue = new Queue<ResearchJobData>(RESEARCH_QUEUE_NAME, { connection });
  }
  return queue;
}

export function startResearchWorker(processor: Processor<ResearchJobData>): Worker<ResearchJobData> {
  const worker = new Worker<ResearchJobData>(RESEARCH_QUEUE_NAME, processor, {
    connection,
    concurrency: env.EXA_MAX_CONCURRENCY,
  });

  worker.on("failed", (job: Job<ResearchJobData> | undefined, err: Error) => {
    log.error({ err, jobId: job?.id, toolName: job?.data.toolName }, "Research job failed");
  });

  return worker;
}

export async function enqueueResearchJob(data: ResearchJobData): Promise<string> {
  const job = await getResearchQueue().add(data.toolName, data);
  return job.id ?? "unknown";
}
