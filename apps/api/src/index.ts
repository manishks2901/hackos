import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Storage } from "@hackos/shared";
import { env } from "./env.js";
import { authRoutes } from "./auth/routes.js";
import { oauthRoutes } from "./auth/oauth.js";
import { hackathonRoutes } from "./hackathons/routes.js";
import { resourceRoutes } from "./resources/routes.js";
import { announcementRoutes } from "./announcements/routes.js";
import { timelineRoutes } from "./timeline/routes.js";
import { inviteRoutes } from "./invites/routes.js";
import { integrationRoutes } from "./integrations/routes.js";
import { teamRoutes } from "./teams/routes.js";
import { messageRoutes } from "./messages/routes.js";
import { submissionRoutes } from "./submissions/routes.js";
import { analyticsRoutes } from "./analytics/routes.js";
import { sponsorRoutes } from "./sponsors/routes.js";
import { extensionRoutes } from "./extension/routes.js";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
});
await app.register(rateLimit, {
  max: 300, // per IP per minute; auth endpoints get a stricter override below
  timeWindow: "1 minute",
});

app.get("/health", async () => ({ ok: true, service: "api" }));

await app.register(authRoutes);
await app.register(oauthRoutes);
await app.register(hackathonRoutes);
await app.register(resourceRoutes);
await app.register(announcementRoutes);
await app.register(timelineRoutes);
await app.register(inviteRoutes);
await app.register(integrationRoutes);
await app.register(teamRoutes);
await app.register(messageRoutes);
await app.register(submissionRoutes);
await app.register(analyticsRoutes);
await app.register(sponsorRoutes);
await app.register(extensionRoutes);

// Object storage reachability (non-fatal): logs whether the S3/MinIO bucket is
// usable at boot, so misconfigured credentials surface immediately.
try {
  const store = new Storage();
  const reachable = await store.ping();
  app.log.info(
    { bucket: store.bucket },
    reachable ? "storage: bucket reachable" : "storage: bucket NOT reachable (check creds/policy)",
  );
} catch {
  app.log.warn("storage: not configured — submission file uploads are disabled");
}

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
