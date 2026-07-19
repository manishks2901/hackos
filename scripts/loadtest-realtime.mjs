/**
 * Burst-path load test: N websocket clients on one hackathon channel,
 * one announcement published, delivery latency measured on every socket.
 * Run: node scripts/loadtest-realtime.mjs [numClients]   (default 300)
 * Requires: API + gateway up. Uses the seeded org/dev accounts.
 */
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/gateway/package.json", import.meta.url));
const WebSocket = require("ws"); // resolved via the gateway package (pnpm isolation)

const API = process.env.API_URL ?? "http://localhost:4010";
const GW = process.env.GATEWAY_URL ?? "ws://localhost:4012";
const N = Number(process.argv[2] ?? 300);

async function json(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

const participant = await json("/v1/auth/signin", {
  method: "POST",
  body: { email: "dev@example.com", password: "password123" },
});
const organizer = await json("/v1/auth/signin", {
  method: "POST",
  body: { email: "org@example.com", password: "password123" },
});
const [event] = await json("/v1/hackathons", {}, participant.accessToken);

console.log(`connecting ${N} sockets to ${event.name}…`);
const latencies = [];
let connected = 0;
let publishedAt = 0;

const sockets = [];
await new Promise((resolveAll) => {
  for (let i = 0; i < N; i++) {
    const ws = new WebSocket(
      `${GW}/?token=${encodeURIComponent(participant.accessToken)}&hackathon=${event.id}`,
    );
    sockets.push(ws);
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "connected") {
        if (++connected === N) resolveAll();
      } else if (msg.event?.type === "announcement.created" && publishedAt) {
        latencies.push(Date.now() - publishedAt);
      }
    });
    ws.on("error", (err) => console.error("socket error:", err.message));
  }
});

console.log(`${connected} connected; publishing…`);
publishedAt = Date.now();
await json(
  `/v1/hackathons/${event.id}/announcements`,
  {
    method: "POST",
    body: { title: `Load test ${N}`, body: "burst-path latency measurement", priority: "normal" },
  },
  organizer.accessToken,
);

await new Promise((r) => setTimeout(r, 5000));

latencies.sort((x, y) => x - y);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
console.log(`delivered: ${latencies.length}/${N}`);
if (latencies.length) {
  console.log(`p50: ${pct(50)}ms  p95: ${pct(95)}ms  p99: ${pct(99)}ms  max: ${latencies[latencies.length - 1]}ms`);
}
for (const ws of sockets) ws.close();
process.exit(latencies.length === N ? 0 : 1);
