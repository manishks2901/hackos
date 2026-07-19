import { defineRailway, github, group, project, service } from "railway/iac";

const REPO = "manishks2901/hackos";

// Build each service (and its workspace deps via `...`) from the pnpm monorepo,
// then run its compiled entrypoint. Secrets are NOT declared here — they are set
// per service with `railway variables` so no credentials land in source.
export default defineRailway(() => {
  const api = service("api", {
    source: github(REPO, { branch: "main" }),
    build: "pnpm install --no-frozen-lockfile && pnpm --filter @hackos/api... build",
    start: "node apps/api/dist/index.js",
  });

  const ai = service("ai", {
    source: github(REPO, { branch: "main" }),
    build: "pnpm install --no-frozen-lockfile && pnpm --filter @hackos/ai... build",
    start: "node apps/ai/dist/index.js",
  });

  const gateway = service("gateway", {
    source: github(REPO, { branch: "main" }),
    build: "pnpm install --no-frozen-lockfile && pnpm --filter @hackos/gateway... build",
    start: "node apps/gateway/dist/index.js",
  });

  const workers = service("workers", {
    source: github(REPO, { branch: "main" }),
    build: "pnpm install --no-frozen-lockfile && pnpm --filter @hackos/workers... build",
    start: "node apps/workers/dist/index.js",
  });

  return project("hackos", {
    resources: [group("Backend", [api, ai, gateway, workers])],
  });
});
