import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT ?? process.env.GATEWAY_PORT ?? 4012);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-access-secret-change-me";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

// hackathonId -> connected sockets on this node
const rooms = new Map<string, Set<WebSocket>>();

const sub = new Redis(REDIS_URL);
sub.psubscribe("hackathon:*");
sub.on("pmessage", (_pattern, channel, message) => {
  const hackathonId = channel.slice("hackathon:".length);
  const sockets = rooms.get(hackathonId);
  if (!sockets) return;
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
});

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "gateway" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  const hackathonId = url.searchParams.get("hackathon");

  if (!token || !hackathonId) {
    ws.close(4400, "token and hackathon query params required");
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4401, "invalid token");
    return;
  }

  let room = rooms.get(hackathonId);
  if (!room) {
    room = new Set();
    rooms.set(hackathonId, room);
  }
  room.add(ws);
  ws.send(JSON.stringify({ type: "connected", hackathonId }));

  // heartbeat: terminate dead connections
  let alive = true;
  ws.on("pong", () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30_000);

  ws.on("close", () => {
    clearInterval(heartbeat);
    room.delete(ws);
    if (room.size === 0) rooms.delete(hackathonId);
  });
});

server.listen(PORT, () => {
  console.log(`gateway listening on :${PORT}`);
});

// Rolling-deploy drain: stop accepting, tell clients to go away (1001), exit.
// Extensions auto-reconnect (to another node behind the LB) and replay via sync.
function drain() {
  console.log("gateway draining…");
  server.close();
  for (const ws of wss.clients) ws.close(1001, "server restarting");
  void sub.quit();
  setTimeout(() => process.exit(0), 2000);
}
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
