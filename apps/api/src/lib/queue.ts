import { Queue } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const ingestQueue = new Queue("ingest", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export function enqueueIngest(hackathonId: string, resourceId: string): void {
  ingestQueue.add("ingest", { hackathonId, resourceId }).catch(() => {
    // Redis down: content still saved; the resource re-indexes on its next edit.
  });
}
