# HackOS — The entire hackathon, inside your IDE

Stop juggling chat apps, email, Drive and Devpost. HackOS syncs every announcement, doc, deadline and mentor into VS Code — with an AI assistant that answers event questions, with citations, in seconds.

## What you get

- **Everything synced** — problem statements, docs, sponsor APIs, FAQs, judging criteria and timelines in your sidebar, cached for offline reading
- **AI assistant** — ask anything about the event; answers are grounded in the official docs with clickable citations, or it tells you it doesn't know
- **Real-time announcements** — rule changes and deadline shifts land as notifications in under two seconds; nothing gets missed
- **Team & community chat** — talk to your team, the community, and mentors without leaving the editor
- **Submit from the IDE** — repo, description, demo link; deadline enforced server-side
- **Deadline countdown** — always visible in the status bar

## Getting started

1. Open the HackOS icon (`>_`) in the activity bar
2. **Hackathon: Sign In** — create an account or sign in
3. **Hackathon: Join with Invite Code** — paste the code from your organizer
4. That's it — the event syncs into your sidebar

## Commands

| Command | What it does |
|---|---|
| `Hackathon: Sign In / Sign Out` | Account session |
| `Hackathon: Join with Invite Code` | Connect to an event |
| `Hackathon: Search Event Resources` | Semantic search across event docs |
| `Hackathon: Summarize Today's Announcements` | AI digest of the last 24h |
| `Hackathon: Create Team / Join Team` | Team up |
| `Hackathon: Submit Project` | Submit from the command palette |
| `Hackathon: Sync` | Force refresh |

## Settings

Point the extension at your HackOS deployment (defaults are local development):

- `hackos.apiUrl` — API base URL
- `hackos.aiUrl` — AI service base URL
- `hackos.gatewayUrl` — realtime gateway WebSocket URL

---

Organizers: create and manage events on the HackOS dashboard. One publish reaches every connected IDE simultaneously.
