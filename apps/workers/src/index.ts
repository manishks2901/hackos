import "./env.js";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { runIngest, type IngestJob } from "./ingest.js";
import { runBroadcast, type BroadcastJob } from "./broadcast.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const ingest = new Worker<IngestJob>(
  "ingest",
  async (job) => {
    const result = await runIngest(job.data);
    console.log(`[ingest] ${job.id} resource=${job.data.resourceId}: ${result}`);
  },
  { connection, concurrency: 4 },
);

const broadcast = new Worker<BroadcastJob>(
  "broadcast",
  async (job) => {
    const result = await runBroadcast(job.data);
    console.log(`[broadcast] ${job.id} announcement=${job.data.announcementId}: ${result}`);
  },
  { connection, concurrency: 4 },
);

for (const w of [ingest, broadcast]) {
  w.on("failed", (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
}

console.log("workers running: ingest, broadcast");
