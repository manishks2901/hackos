# HackOS

AI-powered, IDE-native operating system for hackathons. See `features.md`, `architecture.md`, and `plan.md` for the full picture.

## Layout

| Path | What |
|---|---|
| `apps/web` | Organizer dashboard (Next.js) |
| `apps/api` | Core REST API (Fastify) — auth, events, content |
| `apps/ai` | AI service (RAG over event content, OpenAI) |
| `apps/gateway` | Realtime WebSocket gateway (Redis pub/sub backplane) |
| `apps/workers` | Background jobs (ingestion, Discord/Telegram broadcast) |
| `extension/` | VS Code extension for participants |
| `packages/shared` | Shared types + zod schemas |
| `packages/db` | Postgres pool + SQL migrations (pgvector) |
| `landing/` | Marketing landing page (design reference) |

## Quick start

```bash
cp .env.example .env          # fill in OPENAI_API_KEY when you reach Phase 4
docker compose up -d          # postgres(+pgvector), redis, minio
pnpm install
pnpm build                    # builds shared packages first
pnpm migrate                  # applies packages/db/migrations

pnpm dev:api                  # :4000  REST API
pnpm dev:web                  # :3000  dashboard
pnpm dev:gateway              # :4002  websocket gateway
pnpm dev:ai                   # :4001  AI service (stub until Phase 4)
pnpm dev:workers              #        job workers (stubs until Phase 4/5)
```

Extension: open `extension/` in VS Code, `pnpm build`, then press F5 to launch the Extension Development Host.

## Demo event

```bash
node scripts/seed-demo.mjs        # seeds "HackOS Demo Day" with docs, timeline, invites
```

Prints organizer credentials and invite codes. Sign in on the dashboard as the organizer; join from the extension with the participant invite code.

## Extension packaging

```bash
cd extension && pnpm package      # bundles with esbuild and produces hackos-<version>.vsix
code --install-extension hackos-0.1.0.vsix
```

To publish to the VS Code Marketplace: create a publisher at https://marketplace.visualstudio.com/manage, then `pnpm vsce publish` with a PAT. Endpoints are configurable via the `hackos.*` settings for non-local deployments.

## Verification scripts

```bash
node scripts/test-tenant-isolation.mjs   # cross-event RAG/API isolation (6 checks)
node scripts/loadtest-realtime.mjs 1000  # burst path: N sockets, delivery latency p50/p95
```

## Smoke test

```bash
curl -s localhost:4010/health
curl -s -X POST localhost:4010/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"org@example.com","password":"password123","name":"Org"}'
```
