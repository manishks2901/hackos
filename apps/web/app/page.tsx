"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ---------- helpers ---------- */

function useReveals() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "-60px 0px" },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return rootRef;
}

function useCountdown(startSeconds: number) {
  const [left, setLeft] = useState(startSeconds);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : startSeconds)), 1000);
    return () => clearInterval(id);
  }, [startSeconds]);
  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ---------- VS Code mockup ---------- */

function VSCodeMock() {
  const countdown = useCountdown(4 * 3600 + 12 * 60 + 33);
  return (
    <div className="mock-outer stagger d5" aria-hidden="true">
      <div className="mock">
        <div className="mock-titlebar">
          <span className="tl-dot" style={{ background: "#ff5f57" }} />
          <span className="tl-dot" style={{ background: "#febc2e" }} />
          <span className="tl-dot" style={{ background: "#28c840" }} />
          <span className="mock-title">HackNight 2026 — Visual Studio Code</span>
        </div>
        <div className="mock-body">
          <aside className="mock-side">
            <div className="side-label">HackNight 2026</div>
            <div className="side-item"><span className="ic">▸</span> Problem Statements</div>
            <div className="side-item"><span className="ic">▸</span> Docs &amp; Resources</div>
            <div className="side-item"><span className="ic">▸</span> Sponsor APIs</div>
            <div className="side-item active"><span className="ic">◆</span> AI Assistant</div>
            <div className="side-item">
              <span className="ic">▸</span> Announcements <span className="count">3</span>
            </div>
            <div className="side-item"><span className="ic">▸</span> Timeline</div>
            <div className="side-item"><span className="ic">▸</span> Team — nullpointers</div>
            <div className="side-item"><span className="ic">▸</span> Submit Project</div>
          </aside>
          <div className="mock-main">
            <div className="chat-q">can we use a pre-built auth library or does it count as boilerplate?</div>
            <div className="chat-a">
              <strong>Yes — pre-built auth libraries are allowed.</strong> The rules only prohibit
              full app templates. Rule 4.2 states that &ldquo;authentication, UI kits and
              infrastructure libraries are permitted, provided core project logic is written during
              the event.&rdquo;<span className="caret" />
              <div className="cites">
                <span className="cite">§ rules.md · 4.2</span>
                <span className="cite">§ faq.md · Q7</span>
              </div>
            </div>

            <div className="mock-toast">
              <div className="t-head">⚡ ANNOUNCEMENT · HIGH PRIORITY</div>
              <div className="t-body">Submission deadline extended by 2 hours — now 6:00 PM.</div>
              <div className="t-meta">
                <span>delivered by Hackat 🐈</span>
                <span>→ live in every connected IDE</span>
              </div>
            </div>
          </div>
        </div>
        <div className="statusbar">
          <span className="live">● connected</span>
          <span className="deadline">⏱ submissions in {countdown}</span>
          <span>HackNight 2026</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Organizer dashboard walkthrough ---------- */

const DASH_TABS = [
  "Content",
  "Announcements",
  "Timeline",
  "Teams & Submissions",
  "Analytics",
  "Invites",
] as const;

function DashPanel({ tab }: { tab: (typeof DASH_TABS)[number] }) {
  switch (tab) {
    case "Content":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div>
              <div className="r-title">FinTech Track — Problem Statement</div>
              <div className="r-sub">v3 · re-indexed for the AI assistant 2 min ago</div>
            </div>
            <span className="dash-pill violet">problem_statement</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Payments Sandbox — API Reference</div>
              <div className="r-sub">sponsor keys served read-only, access audit-logged</div>
            </div>
            <span className="dash-pill violet">sponsor_api</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Judging Criteria</div>
              <div className="r-sub">weights: innovation 40 · execution 40 · demo 20</div>
            </div>
            <span className="dash-pill violet">judging_criteria</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Submission Guidelines</div>
              <div className="r-sub">deadline synced to every status bar</div>
            </div>
            <span className="dash-pill violet">submission_guidelines</span>
          </div>
          <div className="dash-note">
            Also: docs, resource links and FAQs — every edit re-syncs to participants and re-indexes
            the AI within seconds.
          </div>
        </div>
      );
    case "Announcements":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div>
              <div className="r-title">Submission deadline extended to 6:00 PM</div>
              <div className="r-sub">reached 412 connected IDEs in 1.4s</div>
            </div>
            <span className="dash-pill high">HIGH</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Pizza has landed in Hall B 🍕</div>
              <div className="r-sub">quiet badge, no toast — priorities respected</div>
            </div>
            <span className="dash-pill">normal</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Mentor office hours start at 3 PM</div>
              <div className="r-sub">scheduled · will broadcast automatically</div>
            </div>
            <span className="dash-pill">normal</span>
          </div>
          <div className="dash-note">
            High-priority updates toast in every editor; normal ones badge quietly. One publish,
            every IDE.
          </div>
        </div>
      );
    case "Timeline":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div className="r-title">Kickoff &amp; team formation</div>
            <span className="dash-pill ok">done</span>
          </div>
          <div className="dash-row">
            <div className="r-title">Workshop — Building on the Payments API</div>
            <span className="dash-pill ok">live now</span>
          </div>
          <div className="dash-row">
            <div className="r-title">Submissions close</div>
            <span className="dash-pill high">6:00 PM</span>
          </div>
          <div className="dash-row">
            <div className="r-title">Judging &amp; demos</div>
            <span className="dash-pill">7:30 PM</span>
          </div>
          <div className="dash-note">
            The full schedule syncs into every participant&apos;s sidebar — change it once, it
            changes everywhere.
          </div>
        </div>
      );
    case "Teams & Submissions":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div>
              <div className="r-title">nullpointers</div>
              <div className="r-sub">4 members · repo + demo link attached</div>
            </div>
            <span className="dash-pill ok">submitted</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">segfault society</div>
              <div className="r-sub">3 members · draft saved from VS Code</div>
            </div>
            <span className="dash-pill">in progress</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">off-by-one</div>
              <div className="r-sub">2 members · no submission yet</div>
            </div>
            <span className="dash-pill high">not started</span>
          </div>
          <div className="dash-note">
            Live view of every team and submission — deadline enforcement included, no
            spreadsheet-wrangling at 5:59 PM.
          </div>
        </div>
      );
    case "Analytics":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div>
              <div className="r-title">&ldquo;What&apos;s the submission deadline?&rdquo;</div>
              <div className="r-sub">asked 87× · answered by AI every time</div>
            </div>
            <span className="dash-pill ok">deflected</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">&ldquo;Can we use the sponsor credits after the event?&rdquo;</div>
              <div className="r-sub">asked 19× · not covered by your docs</div>
            </div>
            <span className="dash-pill high">unanswered</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title">Auto-generated FAQ draft ready</div>
              <div className="r-sub">12 entries clustered from real questions</div>
            </div>
            <span className="dash-pill violet">publish in 1 click</span>
          </div>
          <div className="dash-note">
            See what participants actually ask. Gaps become FAQ entries; FAQ entries become instant
            AI answers.
          </div>
        </div>
      );
    case "Invites":
      return (
        <div className="dash-panel">
          <div className="dash-row">
            <div>
              <div className="r-title mono">HACK-9F2K</div>
              <div className="r-sub">role: participant · 214/500 used · expires at kickoff +24h</div>
            </div>
            <span className="dash-pill ok">active</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title mono">MNTR-X41A</div>
              <div className="r-sub">role: mentor · 8/20 used</div>
            </div>
            <span className="dash-pill ok">active</span>
          </div>
          <div className="dash-row">
            <div>
              <div className="r-title mono">HACK-LEAK</div>
              <div className="r-sub">posted publicly by mistake — revoked in one click</div>
            </div>
            <span className="dash-pill high">revoked</span>
          </div>
          <div className="dash-note">
            Invite codes are role-scoped, expirable and revocable — one account per person, many
            events.
          </div>
        </div>
      );
  }
}

function OrganizerDash() {
  const [tab, setTab] = useState<(typeof DASH_TABS)[number]>("Content");
  return (
    <div className="dash reveal" style={{ ["--rd" as string]: "80ms" }}>
      <div className="dash-tabs" role="tablist" aria-label="Organizer dashboard tabs">
        {DASH_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`dash-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <DashPanel tab={tab} />
    </div>
  );
}

/* ---------- Page ---------- */

export default function Home() {
  const rootRef = useReveals();

  return (
    <div className="lp" ref={rootRef}>
      <nav className="lp-nav">
        <div className="wrap nav-inner">
          <Link className="logo" href="/">
            <span className="logo-mark">&gt;_</span>
            HackOS
          </Link>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#organizers">For organizers</a>
            <a href="#ai">AI</a>
            <a href="#how">How it works</a>
            <Link href="/signin" className="nav-cta">Sign in</Link>
            <Link className="btn nav-cta" href="/signup" style={{ padding: "8px 15px" }}>
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ---------- Hero ---------- */}
      <header className="hero">
        <div className="wrap">
          <div className="badge stagger d1">
            <span className="dot" /> Live during your event · IDE-native
          </div>
          <h1 className="stagger d2">
            The entire hackathon,
            <br />
            <span className="grad">inside your IDE.</span>
          </h1>
          <p className="sub stagger d3">
            Stop juggling chat apps, email, Drive and Devpost. HackOS syncs every announcement, doc,
            deadline and mentor into VS Code — with an AI that answers event questions, with
            citations, in seconds.
          </p>
          <div className="hero-ctas stagger d4">
            <Link className="btn" href="/signup">Get started free</Link>
            <a className="btn-ghost" href="#organizers">Create a hackathon →</a>
          </div>
          <p className="hero-hint stagger d4">
            Join an event in seconds: <code>⌘⇧P → Hackathon: Join</code>
          </p>

          <VSCodeMock />
        </div>
      </header>

      {/* ---------- Participant features ---------- */}
      <section id="features">
        <div className="wrap">
          <div className="kicker reveal">For participants</div>
          <h2 className="reveal">Your event, where your hands already are</h2>
          <p className="section-sub reveal">
            Participants lose hours to context switching across eight apps. HackOS collapses the
            whole event into the editor they never leave.
          </p>

          <div className="grid">
            <div className="fcard reveal" style={{ ["--rd" as string]: "0ms" }}>
              <div className="ico">⚡</div>
              <h3>Real-time announcements</h3>
              <p>
                Rule changes and deadline shifts land in the IDE in under two seconds. High-priority
                updates toast; the rest badge quietly. Nothing gets missed.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "50ms" }}>
              <div className="ico">◆</div>
              <h3>AI that cites its sources</h3>
              <p>
                Ask anything about rules, judging or sponsor APIs. Answers come grounded in{" "}
                <em>your</em> event docs with citations that open the source — and when the docs
                don&apos;t cover it, it says so instead of guessing.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "100ms" }}>
              <div className="ico">⟳</div>
              <h3>Everything synced, even offline</h3>
              <p>
                Problem statements, docs, schedules and sponsor resources cached locally. Conference
                Wi-Fi dies; your event doesn&apos;t — everything delta-syncs on reconnect.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "0ms" }}>
              <div className="ico">⌕</div>
              <h3>Semantic search</h3>
              <p>
                Search by meaning, not keywords.{" "}
                <code>&ldquo;prize for best use of the payments API&rdquo;</code> finds the right
                sponsor doc instantly.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "50ms" }}>
              <div className="ico">◉</div>
              <h3>Teams &amp; mentors, in-editor</h3>
              <p>
                Team chat, community-wide channels and mentor availability live in the sidebar. Get
                unstuck without alt-tabbing away from the bug.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "100ms" }}>
              <div className="ico">➤</div>
              <h3>Submit without leaving</h3>
              <p>
                Repo, description, demo link — submitted from the command palette with a live
                deadline countdown in the status bar.
              </p>
            </div>

            <div className="hackat reveal" style={{ ["--rd" as string]: "150ms" }}>
              <div className="hackat-cat">(=^･ω･^=)ﾉ</div>
              <div>
                <h3>Delivered by Hackat, your in-IDE mascot</h3>
                <p>
                  Every notification arrives via Hackat, the animated cat who lives in your editor —
                  padding in with high-priority toasts, batting the announcement badge, and napping
                  on the status bar between updates. The most reliable courier at the event, and the
                  only one that purrs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Organizer section ---------- */}
      <section id="organizers" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="kicker reveal">For organizers</div>
          <h2 className="reveal">One dashboard runs the whole event</h2>
          <p className="section-sub reveal">
            Publish content, broadcast announcements, watch submissions roll in, and let the AI
            deflect the question flood — every tab below is a real part of the product.
          </p>

          <OrganizerDash />

          <ul className="org-points reveal" style={{ ["--rd" as string]: "120ms" }}>
            <li>
              Six content types — problem statements, docs, sponsor APIs, FAQs, judging criteria,
              submission guidelines — versioned and instantly synced.
            </li>
            <li>Announcements with priorities: high ones toast in every IDE, normal ones badge.</li>
            <li>Auto-FAQ generation from real participant questions, published in one click.</li>
            <li>Role-scoped invite codes (organizer / mentor / participant) with instant revocation.</li>
            <li>Analytics on most-asked and unanswered questions — see the gaps in your docs.</li>
            <li>Teams &amp; submissions live view with deadline enforcement built in.</li>
          </ul>
        </div>
      </section>

      {/* ---------- Broadcast ---------- */}
      <section id="broadcast" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="kicker reveal">Broadcast</div>
          <h2 className="reveal">Publish once, reach every editor</h2>

          <div className="broadcast reveal">
            <div>
              <h3>One publish → every connected IDE</h3>
              <p>
                Publish an announcement once and it lands in every connected IDE simultaneously —
                priority-marked and delivered in real time, with a full delivery log on your
                dashboard.
              </p>
            </div>
            <div className="chips">
              <span className="chip"><span className="sq" style={{ background: "#7c6cff" }} /> VS Code</span>
            </div>
          </div>

          <div className="dlog reveal" style={{ ["--rd" as string]: "80ms" }} aria-label="Delivery log">
            <div className="dlog-title">Delivery log — &ldquo;Deadline extended to 6:00 PM&rdquo;</div>
            <div className="dlog-row">
              <span className="ts">17:58:02.114</span>
              <span>vscode · 412 connected IDEs</span>
              <span className="ok">delivered in 1.4s</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- AI section ---------- */}
      <section id="ai" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="kicker reveal">The AI layer</div>
          <h2 className="reveal">An assistant that only knows your event — on purpose</h2>
          <p className="section-sub reveal">
            Not a generic chatbot. HackOS builds a retrieval pipeline over your event&apos;s own
            documents, so every answer is grounded and every claim is traceable to a source.
          </p>

          <div className="pipeline reveal" style={{ ["--rd" as string]: "60ms" }}>
            <div className="pipe-step">
              <div className="p-label">01 · Ingest</div>
              <h4>Your docs</h4>
              <p>Rules, FAQs, sponsor APIs, guidelines — everything you publish, as you publish it.</p>
            </div>
            <span className="pipe-arrow">→</span>
            <div className="pipe-step">
              <div className="p-label">02 · Chunk</div>
              <h4>Split by section</h4>
              <p>Documents are broken into overlapping, heading-aware passages that keep context.</p>
            </div>
            <span className="pipe-arrow">→</span>
            <div className="pipe-step">
              <div className="p-label">03 · Embed</div>
              <h4>Indexed by meaning</h4>
              <p>Each passage becomes a vector, searchable by what it means — not what it says.</p>
            </div>
            <span className="pipe-arrow">→</span>
            <div className="pipe-step">
              <div className="p-label">04 · Answer</div>
              <h4>Cited answers</h4>
              <p>The best passages ground every reply, with citations that open the source doc.</p>
            </div>
          </div>

          <div className="grid" style={{ marginTop: 14 }}>
            <div className="fcard reveal" style={{ ["--rd" as string]: "0ms" }}>
              <div className="ico">≋</div>
              <h3>Answer cache</h3>
              <p>
                &ldquo;What&apos;s the deadline?&rdquo; gets asked 500 times. Semantically similar
                questions hit a cache, so answers stay instant even during announcement spikes.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "50ms" }}>
              <div className="ico">⏳</div>
              <h3>Per-user rate limits</h3>
              <p>
                Fair-use limits per participant keep the assistant fast for everyone and your AI
                bill predictable — enforced server-side, never in the client.
              </p>
            </div>
            <div className="fcard reveal" style={{ ["--rd" as string]: "100ms" }}>
              <div className="ico">⛨</div>
              <h3>Tenant isolation, tested</h3>
              <p>
                Retrieval is hard-scoped to your event and enforced at the database layer — with an
                automated test that tries (and fails) to leak answers across events.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="kicker reveal">How it works</div>
          <h2 className="reveal">Up and running before the pizza arrives</h2>

          <div className="steps">
            <div className="step reveal" style={{ ["--rd" as string]: "0ms" }}>
              <h3>Organizers publish</h3>
              <p>
                Create your event on the dashboard: problem statements, rules, sponsor APIs, judging
                criteria, schedule. Share one invite code.
              </p>
            </div>
            <div className="step reveal" style={{ ["--rd" as string]: "50ms" }}>
              <h3>Participants connect</h3>
              <p>
                Sign in, enter the code, and the extension syncs the entire event into VS Code. The
                AI assistant indexes every document automatically.
              </p>
            </div>
            <div className="step reveal" style={{ ["--rd" as string]: "100ms" }}>
              <h3>Everyone stays in flow</h3>
              <p>
                Updates stream to every connected IDE in real time. Questions get instant cited
                answers instead of pinging organizers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="cta-final" id="get-started" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="kicker reveal">Get started</div>
          <h2 className="reveal" style={{ maxWidth: "20ch", marginLeft: "auto", marginRight: "auto" }}>
            Run your next hackathon on HackOS
          </h2>
          <p className="section-sub reveal" style={{ textAlign: "center" }}>
            Free for participants. Organizers set up an event in under ten minutes.
          </p>
          <div className="hero-ctas reveal">
            <Link className="btn" href="/signup">Create your account</Link>
            <Link className="btn-ghost" href="/signin">Sign in →</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>© 2026 HackOS — the operating system for hackathons.</span>
          <span>
            <a href="#features">Features</a>
            <a href="#organizers">Organizers</a>
            <a href="#ai">AI</a>
            <a href="#how">How it works</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
