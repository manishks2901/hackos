import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

/** Fire-and-forget publish to the gateway backplane; clients replay via sync if missed. */
export function publish(hackathonId: string, event: { type: string; payload: unknown }): void {
  redis
    .publish(
      `hackathon:${hackathonId}`,
      JSON.stringify({ hackathonId, event, ts: new Date().toISOString() }),
    )
    .catch(() => {});
}
