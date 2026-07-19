import OpenAI from "openai";
import { Redis } from "ioredis";
import { getPool } from "@hackos/db";
import { chunkMarkdown } from "./chunk.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const openai = new OpenAI();
const EMBED_MODEL = "text-embedding-3-small";

export interface IngestJob {
  hackathonId: string;
  resourceId: string;
}

const toVector = (e: number[]) => `[${e.join(",")}]`;

/**
 * Re-indexes one resource: chunk -> embed -> replace chunks atomically.
 * A deleted resource just clears its chunks (FK cascade also covers this).
 */
export async function runIngest({ hackathonId, resourceId }: IngestJob): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, title, content, url, version FROM resources WHERE id = $1 AND hackathon_id = $2",
    [resourceId, hackathonId],
  );
  const resource = rows[0];

  if (!resource) {
    await pool.query("DELETE FROM resource_chunks WHERE resource_id = $1", [resourceId]);
    await redis.incr(`corpus:${hackathonId}`).catch(() => {}); // invalidate answer cache
    return "resource gone, chunks cleared";
  }

  const text = [resource.title, resource.url, resource.content].filter(Boolean).join("\n\n");
  const chunks = chunkMarkdown(text);
  if (chunks.length === 0) return "nothing to index";

  const { data } = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: chunks.map((c) => c.content),
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Tombstone everything from prior versions, then insert the new set.
    await client.query("DELETE FROM resource_chunks WHERE resource_id = $1", [resourceId]);
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO resource_chunks (resource_id, hackathon_id, version, section, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [resourceId, hackathonId, resource.version, chunks[i].section, chunks[i].content,
         toVector(data[i].embedding)],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await redis.incr(`corpus:${hackathonId}`).catch(() => {}); // invalidate answer cache
  return `indexed ${chunks.length} chunk(s) at v${resource.version}`;
}
