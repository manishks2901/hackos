"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getTokens } from "../../../lib/api";

const RESOURCE_TYPES = [
  ["problem_statement", "Problem Statement"],
  ["doc", "Documentation"],
  ["link", "Link"],
  ["sponsor_api", "Sponsor API"],
  ["faq", "FAQ"],
  ["judging_criteria", "Judging Criteria"],
  ["submission_guidelines", "Submission Guidelines"],
] as const;

const typeLabel = (t: string) => RESOURCE_TYPES.find(([k]) => k === t)?.[1] ?? t;

interface Hackathon {
  id: string;
  name: string;
  description: string | null;
  venue: string | null;
  role: string;
}
interface Resource {
  id: string;
  type: string;
  title: string;
  content: string | null;
  url: string | null;
  version: number;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "high";
  category?: string;
  sponsor?: { name: string; brandColor: string } | null;
  createdAt: string;
}

interface Sponsor {
  id: string;
  name: string;
  tier: string;
  brandColor: string;
  tagline: string | null;
  url: string | null;
}
interface TimelineItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
}
interface Invite {
  id: string;
  code: string;
  role: string;
  uses: number;
  maxUses: number | null;
  revoked: boolean;
}

const TABS = [
  "Content",
  "Announcements",
  "Timeline",
  "Teams & Submissions",
  "Sponsors",
  "Analytics",
  "Invites",
] as const;

const CATEGORIES = [
  ["general", "📣 General"],
  ["deadline", "⏰ Deadline"],
  ["schedule", "📅 Schedule"],
  ["food", "🍕 Food"],
  ["workshop", "🛠 Workshop"],
  ["prize", "🏆 Prize"],
  ["tech", "🔌 Sponsor tech"],
] as const;

const AI_URL = process.env.NEXT_PUBLIC_AI_URL ?? "http://localhost:4011";

const EXT_DOWNLOAD_URL = "https://api-production-c174.up.railway.app/v1/extension/download";
const EXT_INSTALL_CMD = `curl -L -o hackos.vsix "${EXT_DOWNLOAD_URL}" && code --install-extension hackos.vsix`;

// Shown to participants/mentors: how to get the VS Code extension.
function ExtensionBanner() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(EXT_INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the download link still works */
    }
  }
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <strong>Get the HackOS VS Code extension</strong>
      <p className="hint" style={{ margin: "4px 0 10px" }}>
        Install it to see announcements, docs, deadlines, chat and submissions right inside your
        editor. Then run <span className="mono">Hackathon: Sign In</span>.
      </p>
      <div
        className="mono"
        style={{
          fontSize: 12,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
          overflowX: "auto",
          whiteSpace: "nowrap",
          color: "var(--text)",
        }}
      >
        {EXT_INSTALL_CMD}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-sm" onClick={copy}>
          {copied ? "Copied ✓" : "Copy install command"}
        </button>
        <a className="btn-ghost btn-sm" href={EXT_DOWNLOAD_URL} style={{ display: "inline-flex", alignItems: "center" }}>
          Download .vsix
        </a>
      </div>
    </div>
  );
}

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Hackathon | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Content");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace("/signin");
      return;
    }
    api<Hackathon>(`/v1/hackathons/${id}`)
      .then(setEvent)
      .catch((e) => setError(e.message));
  }, [id, router]);

  if (error) return <main style={{ padding: 48 }} className="error">{error}</main>;
  if (!event) return <main style={{ padding: 48 }} className="hint">Loading…</main>;

  const isOrganizer = event.role === "organizer";
  // Analytics and Invites are organizer-only on the API; hide them from everyone
  // else so participants/mentors don't hit "requires role: organizer".
  const ORGANIZER_ONLY = ["Analytics", "Invites"];
  const visibleTabs = TABS.filter((t) => isOrganizer || !ORGANIZER_ONLY.includes(t));

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>
      <p style={{ marginBottom: 16 }}>
        <a href="/dashboard" className="hint">← All hackathons</a>
      </p>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{event.name}</h1>
        <p className="hint">
          {event.venue ?? "No venue set"} · your role: <span className="mono">{event.role}</span>
        </p>
      </header>

      {!isOrganizer && <ExtensionBanner />}

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Content" && <ContentTab id={id} isOrganizer={isOrganizer} />}
      {tab === "Announcements" && <AnnouncementsTab id={id} isOrganizer={isOrganizer} />}
      {tab === "Timeline" && <TimelineTab id={id} isOrganizer={isOrganizer} />}
      {tab === "Teams & Submissions" && <TeamsTab id={id} isOrganizer={isOrganizer} />}
      {tab === "Sponsors" && <SponsorsTab id={id} isOrganizer={isOrganizer} />}
      {tab === "Analytics" && isOrganizer && <AnalyticsTab id={id} />}
      {tab === "Invites" && isOrganizer && <InvitesTab id={id} />}
    </main>
  );
}

function useList<T>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<T[]>(path).then(setItems).catch((e) => setError(e.message));
  }, [path]);
  useEffect(reload, [reload]);
  return { items, error, reload, setError };
}

function ContentTab({ id, isOrganizer }: { id: string; isOrganizer: boolean }) {
  const { items, error, reload, setError } = useList<Resource>(`/v1/hackathons/${id}/resources`);
  const [type, setType] = useState<string>("doc");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/hackathons/${id}/resources`, {
        method: "POST",
        body: {
          type,
          title,
          ...(content ? { content } : {}),
          ...(url ? { url } : {}),
        },
      });
      setTitle("");
      setContent("");
      setUrl("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {isOrganizer && (
        <form className="card" onSubmit={create} style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {RESOURCE_TYPES.map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Content (markdown)</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="field">
            <label>URL (optional)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <button className="btn" disabled={busy}>{busy ? "…" : "Add resource"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 && <p className="hint">No resources yet.</p>}
        {items.map((r) => (
          <div className="row" key={r.id}>
            <div>
              <strong>{r.title}</strong>{" "}
              <span className="pill">{typeLabel(r.type)}</span>{" "}
              <span className="pill">v{r.version}</span>
              {r.url && (
                <p className="hint" style={{ marginTop: 4 }}>{r.url}</p>
              )}
            </div>
            {isOrganizer && (
              <button
                className="btn-sm"
                onClick={() =>
                  api(`/v1/hackathons/${id}/resources/${r.id}`, { method: "DELETE" }).then(reload)
                }
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementsTab({ id, isOrganizer }: { id: string; isOrganizer: boolean }) {
  const { items, error, reload, setError } = useList<Announcement>(
    `/v1/hackathons/${id}/announcements`,
  );
  const { items: sponsors } = useList<Sponsor>(`/v1/hackathons/${id}/sponsors`);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [category, setCategory] = useState("general");
  const [sponsorId, setSponsorId] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/hackathons/${id}/announcements`, {
        method: "POST",
        body: { title, body, priority, category, ...(sponsorId ? { sponsorId } : {}) },
      });
      setTitle("");
      setBody("");
      setPriority("normal");
      setCategory("general");
      setSponsorId("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const catLabel = (c?: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

  return (
    <div>
      {isOrganizer && (
        <form className="card" onSubmit={publish} style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "normal" | "high")}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sponsor (optional)</label>
              <select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
                <option value="">— none —</option>
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.tier})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <button className="btn" disabled={busy}>{busy ? "…" : "Publish announcement"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 && <p className="hint">No announcements yet.</p>}
        {items.map((a) => (
          <div className="row" key={a.id}>
            <div>
              <strong>{a.title}</strong>{" "}
              {a.priority === "high" && <span className="pill high">HIGH</span>}{" "}
              {a.category && a.category !== "general" && (
                <span className="pill">{catLabel(a.category)}</span>
              )}{" "}
              {a.sponsor && (
                <span
                  className="pill"
                  style={{ color: a.sponsor.brandColor, borderColor: a.sponsor.brandColor }}
                >
                  {a.sponsor.name}
                </span>
              )}
              <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 4 }}>{a.body}</p>
              <p className="hint" style={{ marginTop: 4 }}>
                {new Date(a.createdAt).toLocaleString()}
              </p>
            </div>
            {isOrganizer && (
              <button
                className="btn-sm"
                onClick={() =>
                  api(`/v1/hackathons/${id}/announcements/${a.id}`, { method: "DELETE" }).then(
                    reload,
                  )
                }
              >
                Retract
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineTab({ id, isOrganizer }: { id: string; isOrganizer: boolean }) {
  const { items, error, reload, setError } = useList<TimelineItem>(`/v1/hackathons/${id}/timeline`);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/hackathons/${id}/timeline`, {
        method: "POST",
        body: { title, startsAt: new Date(startsAt).toISOString() },
      });
      setTitle("");
      setStartsAt("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {isOrganizer && (
        <form className="card" onSubmit={create} style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12 }}>
            <div className="field">
              <label>Milestone</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Submissions close"
                required
              />
            </div>
            <div className="field">
              <label>When</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
          </div>
          <button className="btn" disabled={busy}>{busy ? "…" : "Add to timeline"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 && <p className="hint">No timeline items yet.</p>}
        {items.map((t) => (
          <div className="row" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <p className="hint" style={{ marginTop: 4 }}>
                {new Date(t.startsAt).toLocaleString()}
              </p>
            </div>
            {isOrganizer && (
              <button
                className="btn-sm"
                onClick={() =>
                  api(`/v1/hackathons/${id}/timeline/${t.id}`, { method: "DELETE" }).then(reload)
                }
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SponsorsTab({ id, isOrganizer }: { id: string; isOrganizer: boolean }) {
  const { items, error, reload, setError } = useList<Sponsor>(`/v1/hackathons/${id}/sponsors`);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("gold");
  const [brandColor, setBrandColor] = useState("#7c6cff");
  const [tagline, setTagline] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/hackathons/${id}/sponsors`, {
        method: "POST",
        body: {
          name,
          tier,
          brandColor,
          ...(tagline ? { tagline } : {}),
          ...(url ? { url } : {}),
        },
      });
      setName("");
      setTagline("");
      setUrl("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const monogram = (n: string) =>
    n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div>
      {isOrganizer && (
        <form className="card" onSubmit={create} style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px", gap: 12 }}>
            <div className="field">
              <label>Company name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Tier</label>
              <select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="platinum">Platinum</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="partner">Partner</option>
              </select>
            </div>
            <div className="field">
              <label>Brand color</label>
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                style={{ padding: 4, height: 42 }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Tagline (optional)</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Sponsors the $2000 FinTech prize"
              />
            </div>
            <div className="field">
              <label>Website (optional)</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <button className="btn" disabled={busy}>{busy ? "…" : "Add sponsor"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 && <p className="hint">No sponsors yet.</p>}
        {items.map((s) => (
          <div className="row" key={s.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  background: s.brandColor,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  flex: "none",
                }}
              >
                {monogram(s.name)}
              </span>
              <div>
                <strong>{s.name}</strong> <span className="pill">{s.tier}</span>
                {s.tagline && <p className="hint" style={{ marginTop: 2 }}>{s.tagline}</p>}
                {s.url && (
                  <p className="hint" style={{ marginTop: 2 }}>
                    <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
                  </p>
                )}
              </div>
            </div>
            {isOrganizer && (
              <button
                className="btn-sm"
                onClick={() =>
                  api(`/v1/hackathons/${id}/sponsors/${s.id}`, { method: "DELETE" }).then(reload)
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface TeamRow {
  id: string;
  name: string;
  members: Array<{ id: string; name: string }>;
  hasSubmission: boolean;
}
interface SubmissionRow {
  id: string;
  teamName: string;
  teamSize: number;
  repoUrl: string;
  description: string | null;
  demoUrl: string | null;
  submittedAt: string;
}

function TeamsTab({ id, isOrganizer }: { id: string; isOrganizer: boolean }) {
  const { items: teams, error } = useList<TeamRow>(`/v1/hackathons/${id}/teams`);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  useEffect(() => {
    if (!isOrganizer) return;
    api<SubmissionRow[]>(`/v1/hackathons/${id}/submissions`)
      .then(setSubmissions)
      .catch(() => {});
  }, [id, isOrganizer]);

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>
        Teams <span className="pill">{teams.length}</span>
      </h2>
      <div className="card" style={{ marginBottom: 24 }}>
        {teams.length === 0 && <p className="hint">No teams yet.</p>}
        {teams.map((t) => (
          <div className="row" key={t.id}>
            <div>
              <strong>{t.name}</strong>{" "}
              {t.hasSubmission && <span className="pill ok">submitted</span>}
              <p className="hint" style={{ marginTop: 4 }}>
                {t.members.map((m) => m.name).join(", ") || "no members"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {isOrganizer && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>
            Submissions <span className="pill">{submissions.length}</span>
          </h2>
          <div className="card">
            {submissions.length === 0 && <p className="hint">No submissions yet.</p>}
            {submissions.map((s) => (
              <div className="row" key={s.id}>
                <div>
                  <strong>{s.teamName}</strong>{" "}
                  <span className="pill">{s.teamSize} member{s.teamSize === 1 ? "" : "s"}</span>
                  <p className="hint" style={{ marginTop: 4 }}>
                    <a href={s.repoUrl} target="_blank" rel="noreferrer">{s.repoUrl}</a>
                    {s.demoUrl && (
                      <>
                        {" · "}
                        <a href={s.demoUrl} target="_blank" rel="noreferrer">demo</a>
                      </>
                    )}
                  </p>
                  {s.description && (
                    <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4 }}>
                      {s.description}
                    </p>
                  )}
                  <p className="hint" style={{ marginTop: 4 }}>
                    {new Date(s.submittedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface Analytics {
  participants: number;
  mentors: number;
  teams: number;
  submissions: number;
  announcements: number;
  resources: number;
  questionsAsked: number;
  unanswered: number;
  recentQuestions: Array<{ question: string; wasUnanswered: boolean; createdAt: string }>;
  broadcast: { sent: number; failed: number };
}

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 28, fontWeight: 650, letterSpacing: "-0.02em" }}>{value}</div>
      <div className="hint" style={{ marginTop: 2 }}>{label}</div>
      {sub && <div className="hint" style={{ marginTop: 2, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function AnalyticsTab({ id }: { id: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    api<Analytics>(`/v1/hackathons/${id}/analytics`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  async function generateFaq() {
    setBusy(true);
    setError(null);
    setPublished(false);
    try {
      const tokens = getTokens();
      const res = await fetch(`${AI_URL}/v1/insights/faq`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tokens?.accessToken}`,
        },
        body: JSON.stringify({ hackathonId: id }),
      });
      const body = (await res.json()) as { faqs?: Array<{ question: string; answer: string }>; error?: string };
      if (!res.ok) throw new Error(body.error ?? "generation failed");
      setFaqs(body.faqs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishFaq() {
    if (!faqs?.length) return;
    setBusy(true);
    try {
      const content = faqs.map((f) => `## ${f.question}\n\n${f.answer}`).join("\n\n");
      await api(`/v1/hackathons/${id}/resources`, {
        method: "POST",
        body: { type: "faq", title: "FAQ (auto-generated)", content },
      });
      setPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="hint">Loading…</p>;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatTile label="Participants" value={data.participants} sub={`${data.mentors} mentor${data.mentors === 1 ? "" : "s"}`} />
        <StatTile label="Teams" value={data.teams} sub={`${data.submissions} submitted`} />
        <StatTile label="AI questions asked" value={data.questionsAsked} sub={`${data.unanswered} unanswered`} />
        <StatTile
          label="Announcements"
          value={data.announcements}
          sub={`broadcast: ${data.broadcast.sent} sent, ${data.broadcast.failed} failed`}
        />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong>Auto-FAQ from participant questions</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-sm" onClick={generateFaq} disabled={busy || data.questionsAsked === 0}>
              {busy ? "…" : "Generate draft"}
            </button>
            {faqs && faqs.length > 0 && !published && (
              <button className="btn-sm" onClick={publishFaq} disabled={busy}>
                Publish as FAQ resource
              </button>
            )}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {published && (
          <p className="hint" style={{ color: "var(--green)" }}>
            Published — it's now in Content and indexed for the AI assistant.
          </p>
        )}
        {faqs === null && (
          <p className="hint">
            Clusters everything participants asked the assistant into a publishable FAQ.
            {data.questionsAsked === 0 && " No questions logged yet."}
          </p>
        )}
        {faqs?.length === 0 && <p className="hint">No questions to cluster yet.</p>}
        {faqs?.map((f, i) => (
          <div className="row" key={i}>
            <div>
              <strong>{f.question}</strong>
              <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 4 }}>{f.answer}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong style={{ display: "block", marginBottom: 8 }}>Recent AI questions</strong>
        {data.recentQuestions.length === 0 && <p className="hint">Nothing asked yet.</p>}
        {data.recentQuestions.map((q, i) => (
          <div className="row" key={i}>
            <div>
              {q.question}
              <p className="hint" style={{ marginTop: 4 }}>
                {new Date(q.createdAt).toLocaleString()}
              </p>
            </div>
            {q.wasUnanswered ? (
              <span className="pill high">unanswered</span>
            ) : (
              <span className="pill ok">answered</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InvitesTab({ id }: { id: string }) {
  const { items, error, reload, setError } = useList<Invite>(`/v1/hackathons/${id}/invites`);
  const [role, setRole] = useState("participant");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/hackathons/${id}/invites`, { method: "POST", body: { role } });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Role for new invite</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="participant">Participant</option>
            <option value="mentor">Mentor</option>
            <option value="organizer">Organizer</option>
          </select>
        </div>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? "…" : "Generate invite code"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {items.length === 0 && <p className="hint">No invite codes yet.</p>}
        {items.map((i) => (
          <div className="row" key={i.id}>
            <div>
              <span className="mono" style={{ fontSize: 15 }}>{i.code}</span>{" "}
              <span className="pill">{i.role}</span>{" "}
              {i.revoked ? (
                <span className="pill high">revoked</span>
              ) : (
                <span className="pill ok">active</span>
              )}
              <p className="hint" style={{ marginTop: 4 }}>
                {i.uses} use{i.uses === 1 ? "" : "s"}
                {i.maxUses ? ` of ${i.maxUses}` : ""}
              </p>
            </div>
            {!i.revoked && (
              <button
                className="btn-sm"
                onClick={() =>
                  api(`/v1/hackathons/${id}/invites/${i.id}/revoke`, { method: "POST" }).then(
                    reload,
                  )
                }
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
