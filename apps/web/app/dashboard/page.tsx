"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getTokens, setTokens } from "../../lib/api";

interface Hackathon {
  id: string;
  name: string;
  slug: string;
  role: string;
  inviteCode?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace("/signin");
      return;
    }
    api<Hackathon[]>("/v1/hackathons")
      .then(setHackathons)
      .catch((e) => setError(e.message));
  }, [router]);

  async function createHackathon(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Hackathon>("/v1/hackathons", {
        method: "POST",
        body: { name },
      });
      setHackathons((prev) => [{ ...created, role: "organizer" }, ...prev]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <h1 style={{ fontSize: 24, letterSpacing: "-0.02em" }}>Your hackathons</h1>
        <button
          className="btn"
          style={{ background: "transparent", border: "1px solid var(--border-strong)" }}
          onClick={() => {
            setTokens(null);
            router.replace("/signin");
          }}
        >
          Sign out
        </button>
      </header>

      <form className="card" onSubmit={createHackathon} style={{ marginBottom: 24 }}>
        <div className="field">
          <label htmlFor="name">Create a hackathon</label>
          <input
            id="name"
            placeholder="HackNight 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? "…" : "Create"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {hackathons.map((h) => (
        <a
          key={h.id}
          href={`/dashboard/${h.id}`}
          className="card"
          style={{ marginBottom: 12, display: "block", color: "var(--text)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>{h.name}</strong>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {h.role}
            </span>
          </div>
          {h.inviteCode && (
            <p className="hint">
              Invite code: <span className="mono">{h.inviteCode}</span>
            </p>
          )}
        </a>
      ))}
      {hackathons.length === 0 && !error && (
        <p className="hint">No hackathons yet — create your first one above.</p>
      )}
    </main>
  );
}
