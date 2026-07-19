# VS Code Extension — Development Plan

Detailed plan for the participant-facing VS Code extension: the primary product surface. Aligns with `plan.md` (master phases) and `architecture.md`. Master-plan Phases 3, 5, and 6 correspond to extension milestones E2, E4, and E5 below.

---

## 1. Extension Architecture

```
extension/
├── src/
│   ├── extension.ts            # activate/deactivate, wiring
│   ├── auth/                   # invite-code join, JWT refresh, SecretStorage
│   ├── api/                    # typed SDK client (from packages/shared) + retry/backoff
│   ├── sync/                   # local cache, since-cursor delta sync, polling scheduler
│   ├── realtime/               # WebSocket client, reconnect, event router
│   ├── views/
│   │   ├── sidebar/            # TreeDataProviders (resources, announcements, timeline, team)
│   │   ├── reader/             # markdown rendering in webview/editor tabs
│   │   ├── chat-ai/            # AI assistant webview (SSE streaming, citations)
│   │   └── chat-team/          # team/community chat webview
│   ├── commands/               # command palette entries
│   ├── status/                 # status bar (event, deadline countdown, connection state)
│   └── notifications/          # announcement toasts, badge counts
├── media/                      # webview assets (bundled, CSP-compliant)
├── package.json                # contributes: views, commands, configuration
└── test/                       # unit + @vscode/test-electron integration tests
```

Principles:

- **Thin client.** All business logic server-side; the extension renders state and forwards intents. No OpenAI calls from the extension — AI goes through the platform's AI service.
- **Offline-first.** Everything synced is readable without network (workspace storage cache). Sync is delta-based via `since` cursors.
- **Realtime is an enhancement.** WebSocket for liveness; polling fallback always present. UI state must be identical whichever path delivered the data.
- **Webviews are islands.** Strict CSP, message-passing only (`postMessage` protocol typed in `packages/shared`), no remote script loading. Prototype webview plumbing early — it's the highest-friction part of extension development.

## 2. UI Surfaces

| Surface | VS Code API | Content |
|---|---|---|
| Activity bar container | `contributes.viewsContainers` | Event icon with unread badge |
| Sidebar: Event | `TreeDataProvider` | Problem statements, docs, sponsor APIs, judging criteria, submission guidelines, FAQs |
| Sidebar: Announcements | `TreeDataProvider` | Reverse-chron, priority-flagged, unread markers |
| Sidebar: Timeline | `TreeDataProvider` | Dated items, next deadline highlighted |
| Sidebar: Team | `TreeDataProvider` | Members, mentor availability, submission status |
| Resource reader | Webview panel / markdown preview | Rendered markdown, working links, citation deep-links from AI answers |
| AI chat | Webview view (persistent) | Streaming answers, clickable citations, history |
| Team chat | Webview view | Team + community channels, unread counts |
| Submission form | Webview panel | Repo URL, description, demo link; deadline countdown; server-validated |
| Status bar | `StatusBarItem` | `⚡ HackX · ends 04:12:33 · ●connected` |
| Notifications | `window.showInformationMessage` + badges | High-priority announcements toast; others badge only (no notification spam) |

## 3. Commands

- `hackathon.signIn` — sign in / sign up (OAuth device flow or email) → tokens to SecretStorage
- `hackathon.join` — enter invite code (requires signed-in account) → initial sync
- `hackathon.askAI` — focus AI chat (also keybinding)
- `hackathon.search` — semantic search across event resources (QuickPick)
- `hackathon.showTimeline` / `hackathon.nextDeadline`
- `hackathon.submitProject`
- `hackathon.summarizeAnnouncements` — today's digest via AI
- `hackathon.sync` — force refresh
- `hackathon.leave` — disconnect + clear local data and tokens
- `hackathon.feedback` — in-extension feedback (launch phase)

## 4. Build Milestones

### E1 — Skeleton (with master Phase 1)
Scaffold (`yo code`, esbuild bundling), activity-bar container + empty views, activation events, CI (lint, typecheck, unit tests, packaging with `vsce package`).
**Exit:** installable `.vsix` showing the sidebar.

### E2 — Join & Read (with master Phase 3)
Sign-in flow (OAuth device flow or email → JWT in SecretStorage, auto-refresh), join flow (invite code redeemed against the account), typed SDK wiring, all read-only tree views, markdown reader, workspace-storage cache + delta sync + polling, status bar.
**Exit:** full event browsable in the IDE, offline reading works, master Phase 3 exit criterion met.

### E3 — AI Chat (with master Phase 4)
AI webview: streaming SSE rendering, citation links that open resources at the right section, chat history (workspace state), semantic search command, error/rate-limit states.
**Exit:** cited Q&A in the IDE against the demo event; citations navigate correctly.

### E4 — Live (with master Phase 5)
WebSocket client with backoff + resubscribe, event router updating trees/badges in place, missed-event replay on reconnect, priority-aware notifications, connection state in status bar.
**Exit:** <2s announcement delivery; gateway kill → silent recovery with replay.

### E5 — Collaborate & Submit (with master Phase 6)
Team chat webview over the same socket, mentor availability + threads, submission form with server-side deadline enforcement and clear rejection states.
**Exit:** form team → chat → mentor reply → submit, all in-IDE.

### E6 — Ship (with master Phases 8–9)
Telemetry (opt-in) + Sentry, performance pass (activation <200ms, lazy webviews), `n-1` API compatibility check, walkthrough (`contributes.walkthroughs`), Marketplace listing (README, screenshots, demo GIF), publish to VS Code Marketplace + Open VSX, versioning/release automation.
**Exit:** public listing installable; pilot-event feedback channel live.

## 5. Engineering Notes & Risks

- **Auth:** tokens only in `SecretStorage`; never in settings/globalState. Refresh on 401 once, then surface re-join.
- **Webview CSP:** nonce'd scripts, `localResourceRoots` pinned to `media/`; retain state with `retainContextWhenHidden: false` + serialized state (memory pressure at hackathons with 10 extensions running).
- **SSE in webviews:** stream via the extension host (fetch with readable stream) and forward chunks over `postMessage` — webviews can't hold authenticated SSE connections cleanly.
- **Version skew:** extension declares minimum API version; server supports `n-1`. Feature-flag payloads gate new UI so old extensions degrade gracefully.
- **Performance:** activate on `onView`/`onCommand` (not `*`); bundle with esbuild; heavy webviews load lazily.
- **Testing:** unit-test sync/realtime reducers headlessly (pure functions over event streams); integration smoke via `@vscode/test-electron`; a mock server package for offline dev.
- **Top schedule risk:** webview ↔ extension messaging. Build the typed `postMessage` protocol in E1–E2, even before webviews are needed.
