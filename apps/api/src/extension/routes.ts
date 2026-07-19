import type { FastifyInstance } from "fastify";
import { Storage } from "@hackos/shared";

// The published VSIX lives in the private bucket under downloads/. This route is
// a permanent public link: it mints a short-lived presigned URL on each request
// and redirects to it, so the object stays private but the link never expires.
const VSIX_KEY = "downloads/hackos-0.1.0.vsix";

let storageInstance: Storage | null | undefined;
function getStorage(): Storage | null {
  if (storageInstance !== undefined) return storageInstance;
  try {
    storageInstance = new Storage();
  } catch {
    storageInstance = null;
  }
  return storageInstance;
}

export async function extensionRoutes(app: FastifyInstance) {
  app.get("/v1/extension/download", async (_req, reply) => {
    const store = getStorage();
    if (!store) return reply.code(503).send({ error: "extension download is not available" });
    const url = await store.presignDownload(VSIX_KEY, { expiresIn: 300 });
    // Never cache the redirect — each presigned URL is short-lived.
    reply.header("cache-control", "no-store");
    return reply.redirect(url);
  });
}
