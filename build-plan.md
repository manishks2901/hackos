# MVP Build Plan — AI-Powered IDE-Native Hackathon Platform

Phased plan to ship a working MVP. Each phase produces something demoable, so you can stop at any phase boundary and still have a coherent product. Features cut from MVP are listed at the end.

## MVP Definition

The thinnest slice that proves the core value proposition:

> An organizer publishes event content on a web dashboard → a participant joins via invite code in VS Code → content and announcements appear in their IDE → they ask the AI questions and get cited answers.

Everything else (team chat, mentor interaction, submissions, auto-FAQ) is layered on after this loop works end-to-end.

## Suggested Stack

| Layer | Choice | Why |
|---|---|---|
| Backend API | Node.js + Express or Next.js API routes | One language across web + extension |
| Database | Postgres (Supabase) or MongoDB Atlas | Supabase adds auth + realtime for free |
| Vector store | pgvector (in Supabase) or Chroma | Avoid a separate service if using Supabase |
| Web dashboard | Next.js + Tailwind | Fast to build, easy deploy on Vercel |
| VS Code extension | TypeScript + VS Code Extension API (webview + tree view) | Standard approach |
| AI | OpenAI API (`gpt-4o` + `text-embedding-3-small`) for RAG | Quality answers with citations, single API key |
| Realtime | Supabase Realtime or WebSocket (Socket.io) | Push announcements to IDEs |

---

## Phase 0 — Foundation (setup)

**Goal:** Repos scaffolded, services connected, hello-world everywhere.

- [ ] Monorepo setup: `apps/web`, `apps/api` (if separate), `extension/`, `packages/shared` (shared types)
- [ ] Database provisioned; core schema drafted:
  - `hackathons` (id, name, description, invite_code, timeline, venue)
  - `resources` (id, hackathon_id, type, title, content/url) — type covers docs, problem statements, sponsor APIs, FAQs, judging criteria, submission guidelines
  - `announcements` (id, hackathon_id, title, body, created_at)
  - `users` / `participants` (id, hackathon_id, name, email)
- [ ] Auth: sign-up/sign-in for both organizers and participants (email + OAuth); participants redeem invite codes against their account
- [ ] VS Code extension scaffolded (`yo code`), activates and shows a sidebar view
- [ ] Web app scaffolded, deployed skeleton

**Demo checkpoint:** extension sidebar renders; web app loads; API responds.

---

## Phase 1 — Organizer Dashboard (content in)

**Goal:** An organizer can create a hackathon and fill it with content.

- [ ] Organizer sign-up / login
- [ ] Create hackathon → auto-generate invite code
- [ ] CRUD for resources: problem statements, docs (markdown editor or file upload), resource links, sponsor APIs, judging criteria, submission guidelines
- [ ] CRUD for announcements
- [ ] Timeline / schedule editor (simple list of dated events is enough for MVP)
- [ ] REST API exposing all of the above, keyed by hackathon

**Demo checkpoint:** organizer creates "Demo Hackathon 2026", uploads a problem statement and rules, posts an announcement — all visible via API.

---

## Phase 2 — VS Code Extension (content out)

**Goal:** A participant joins with an invite code and sees everything in the IDE.

- [ ] "Join Hackathon" command → prompts for invite code → stores session
- [ ] Sidebar tree view with sections: Problem Statements, Docs & Resources, Announcements, Timeline, Sponsor APIs
- [ ] Click a resource → opens rendered markdown in a webview/editor tab
- [ ] Manual refresh + polling for new content (realtime push comes in Phase 4)
- [ ] Status bar item showing connected event + next deadline

**Demo checkpoint:** the end-to-end loop works — organizer publishes on web, participant sees it in VS Code after refresh.

**This is the minimum viable demo. Everything after this is what makes it win.**

---

## Phase 3 — AI Knowledge Assistant (the differentiator)

**Goal:** Participants ask natural-language questions in the IDE and get accurate, cited answers.

- [ ] Ingestion pipeline: on resource/announcement create or update → chunk text → embed → store vectors with metadata (source doc, section)
- [ ] RAG query endpoint: embed question → retrieve top-k chunks → GPT-4o generates answer with citations back to source docs
- [ ] Chat panel in the extension (webview): ask questions, see answers with clickable citations that open the source resource
- [ ] Guardrail: answer only from event content; say "not covered in event docs" instead of guessing
- [ ] Semantic search command ("Search hackathon resources") reusing the same retrieval

**Demo checkpoint:** "What's the submission deadline?" / "Which sponsor API should I use for payments?" → correct cited answers inside VS Code.

---

## Phase 4 — Realtime Announcements

**Goal:** Zero missed announcements — updates land in the IDE the moment they're published.

- [ ] WebSocket / Supabase Realtime channel per hackathon
- [ ] Extension subscribes on join; organizer publish → instant push
- [ ] VS Code native notification for high-priority announcements; sidebar badge for the rest
- [ ] AI summarization: "Summarize today's announcements" command (reuses Phase 3 pipeline)

**Demo checkpoint:** organizer posts "Deadline extended 2 hours" on the web → notification pops in VS Code within seconds. This is the money demo moment.

---

## Phase 5 — Polish & Demo Readiness

**Goal:** The product feels finished for judging.

- [ ] Seed a realistic demo hackathon (docs, sponsor APIs, FAQs, announcements)
- [ ] Empty states, loading states, error handling in extension and dashboard
- [ ] Dashboard analytics stub: participant count, most-asked AI questions (organizer value story)
- [ ] README, architecture diagram, 3-minute demo script
- [ ] Rehearse the demo loop: create content → join in IDE → ask AI → live announcement push

---

## Stretch (post-MVP, only if time remains)

Ordered by demo impact vs. effort:

1. **Project submission from VS Code** — form in webview posting repo URL + description; organizer sees submissions on dashboard. High wow, moderate effort.
2. **Auto-FAQ generation** — the LLM clusters asked questions into an FAQ the organizer can publish with one click. Reuses existing pipeline.
3. **Team/community chat in IDE** — real effort sink; only attempt with realtime infra already solid from Phase 4.
4. **Mentor availability + interaction** — needs presence, scheduling; cut unless trivial.
5. **Resource recommendations** — proactive suggestions based on what the participant is working on.

## Cut from MVP (explicitly out of scope)

- Devpost/Slack integrations or migrations (Discord/Telegram announcement broadcast IS in scope — see production plan Phase 5)
- Multi-organizer roles and permissions
- Judging workflow / scoring
- Mobile or web participant view (the IDE *is* the participant surface — that's the pitch)

---

## Risk Notes

- **VS Code webview quirks** eat time (CSP, message passing). Prototype the chat webview early in Phase 3, not last.
- **RAG quality depends on chunking.** Keep resources in markdown; chunk by heading. Don't ingest PDFs in MVP if avoidable.
- **Realtime is a demo risk.** Keep polling as a fallback path so the demo never stalls on a dropped socket.
- **Scope creep on chat.** Team chat looks core but isn't — the AI assistant is the differentiator. Defend Phase 3 time.
