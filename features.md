# Features — AI-Powered IDE-Native Hackathon Platform

An AI-powered platform that makes the developer's IDE the central workspace for an entire hackathon, replacing fragmented communication across email, Discord, Slack, WhatsApp, Telegram, Google Drive, Devpost, Notion, and websites.

The platform has three pillars:

1. **Web Platform** — for organizers
2. **VS Code Extension** — for participants
3. **AI Knowledge Assistant** — event-specific RAG layer connecting the two

---

## 0. Authentication & Accounts

- **Organizer sign-up / sign-in** — email + password and OAuth (GitHub/Google)
- **Participant sign-up / sign-in** — email + password and OAuth (GitHub/Google)
- Participants join a specific hackathon with an invite code *after* signing in — one account, many events
- Role-based access: organizer / mentor / participant
- Session management: JWT access + refresh tokens; extension stores tokens in VS Code SecretStorage

## 1. Organizer Web Platform

### 1.1 Hackathon Management Dashboard
- Create and manage hackathons from a centralized dashboard
- Configure event details: name, description, venue information, timelines
- Generate invite codes for participant onboarding

### 1.2 Content & Resource Management
- Upload and manage problem statements
- Upload documentation and resource links
- Publish sponsor resources and sponsor APIs
- Manage FAQs (manual + AI-generated)
- Define judging criteria
- Publish submission guidelines and submission details
- Share workshop schedules and mentor availability

### 1.3 Announcements & Communication
- Post real-time announcements (rule changes, deadlines, schedule updates)
- Push updates instantly to all connected participants' IDEs
- Reduce repetitive support load — AI answers common participant queries automatically

### 1.4 External Channel Integrations (Discord & Telegram)
- Organizer connects a **Discord server** (bot invite + channel selection) and/or **Telegram** (bot added to group/channel) from the dashboard
- Every announcement pushed on the platform automatically broadcasts to the connected Discord/Telegram channels — one publish, all channels
- Formatted messages with priority markers and deep links back to the platform
- Per-integration toggle and channel mapping (e.g., only high-priority announcements to Telegram)
- Connection status and delivery logs visible on the dashboard

---

## 2. Participant VS Code Extension

### 2.1 Onboarding & Sync
- Sign up / sign in from within the extension (email or OAuth device flow)
- Join a hackathon using an invite code tied to the signed-in account
- Extension auto-connects to the event after joining
- Automatic synchronization of all event resources into the IDE
- Always up-to-date — latest rules, docs, and announcements without leaving VS Code

### 2.2 In-IDE Event Access
- Browse documentation, problem statements, and sponsor resources inside the IDE
- Receive real-time announcements as they're published
- View event timelines, deadlines, and workshop schedules
- Access venue information and mentor availability

### 2.3 Communication & Collaboration
- Chat with teammates from within VS Code
- Community-wide communication channel
- Interact with mentors directly from the IDE

### 2.4 Project Submission
- Submit projects directly from within VS Code
- Access submission guidelines and deadlines in-IDE

---

## 3. AI Knowledge Assistant (RAG-Powered)

### 3.1 Event-Specific Q&A
- Understands all hackathon documents, rules, announcements, FAQs, and resources
- Retrieval-Augmented Generation (RAG) over event content — not a generic chatbot
- Natural-language questions with accurate, **cited** answers

### 3.2 Intelligent Features
- **Semantic search** across all event resources
- **Announcement summarization** — digest of what changed and what matters
- **Automatic FAQ generation** from documents and repeated questions
- **Resource recommendations** — surfaces relevant docs/APIs based on context
- **Organizer support deflection** — instantly answers common queries, reducing repeated questions to organizers

---

## 4. Cross-Cutting Goals

- **Minimize context switching** — everything happens inside the IDE
- **Unified source of truth** — one platform instead of 8+ fragmented channels
- **Real-time information flow** — no missed critical announcements
- **Improved engagement** — participants spend time building, not searching
- **Latest information guarantee** — every team always has current rules, deadlines, and resources
