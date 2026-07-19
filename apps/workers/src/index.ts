import "./env.js";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { runIngest, type IngestJob } from "./ingest.js";

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

ingest.on("failed", (job, err) => console.error(`[ingest] job ${job?.id} failed:`, err.message));

console.log("workers running: ingest");
