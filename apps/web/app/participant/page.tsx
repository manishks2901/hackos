"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthForm } from "../../components/AuthForm";
import { api } from "../../lib/api";

/**
 * Participant onboarding. Participants live in the VS Code extension, so this
 * page's job is simply to let them create the account they'll sign in with —
 * then show exactly how to use it inside VS Code. Optionally they can redeem an
 * invite code here so they're already joined when they open the editor.
 */
const DOWNLOAD_URL = "https://api-production-c174.up.railway.app/v1/extension/download";
const INSTALL_CMD = `curl -L -o hackos.vsix "${DOWNLOAD_URL}" && code --install-extension hackos.vsix`;

export default function ParticipantOnboarding() {
  const [account, setAccount] = useState<{ email: string; name: string } | null>(null);
  const [code, setCode] = useState("");
  const [joinState, setJoinState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link below still works */
    }
  }

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault();
    setJoinState("busy");
    setJoinMsg(null);
    try {
      const event = await api<{ name: string }>("/v1/invites/redeem", {
        method: "POST",
        body: { code: code.trim() },
      });
      setJoinState("done");
      setJoinMsg(`Joined "${event.name}". It'll appear in VS Code after you sign in.`);
    } catch (err) {
      setJoinState("error");
      setJoinMsg(err instanceof Error ? err.message : "Couldn't redeem that code.");
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 460 }}>
        {!account ? (
          <>
            <div className="badge" style={{ marginBottom: 12 }}>For participants</div>
            <h1 style={{ fontSize: 22, letterSpacing: "-0.02em", marginBottom: 6 }}>
              Create your HackOS account
            </h1>
            <p className="hint" style={{ marginTop: 0, marginBottom: 20 }}>
              Make an account here, then sign in with it inside the HackOS VS Code extension to
              join your hackathon.
            </p>
            <AuthForm mode="signup" submitLabel="Create account" onAuthed={setAccount} />
            <p className="hint">
              Already have an account? <Link href="/signin">Sign in</Link> · Organizer?{" "}
              <Link href="/signup">Start here</Link>
            </p>
          </>
        ) : (
          <>
            <div className="badge" style={{ marginBottom: 12 }}>✓ Account created</div>
            <h1 style={{ fontSize: 21, letterSpacing: "-0.02em", marginBottom: 6 }}>
              You&apos;re set, {account.name.split(" ")[0] || "there"} 🎉
            </h1>
            <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
              Now use <span className="mono">{account.email}</span> to sign in inside VS Code.
            </p>

            <div style={{ marginBottom: 18 }}>
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
                {INSTALL_CMD}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={copyInstall}>
                  {copied ? "Copied ✓" : "Copy install command"}
                </button>
                <a
                  className="btn-ghost btn-sm"
                  href={DOWNLOAD_URL}
                  style={{ display: "inline-flex", alignItems: "center" }}
                >
                  Download .vsix
                </a>
              </div>
              <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                Run the command in a terminal, or download the file and use VS Code →{" "}
                <em>Extensions ⋯ → Install from VSIX…</em>
              </p>
            </div>

            <ol className="steps" style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.6 }}>
              <li>Install the <strong>HackOS</strong> extension using the command above.</li>
              <li>
                In VS Code press <span className="mono">Cmd/Ctrl+Shift+P</span> →{" "}
                <strong>Hackathon: Sign In</strong> → enter this email &amp; your password.
              </li>
              <li>
                Press <span className="mono">Cmd/Ctrl+Shift+P</span> →{" "}
                <strong>Hackathon: Join with Invite Code</strong> → paste the code from your
                organizer.
              </li>
            </ol>

            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 16,
                marginTop: 4,
              }}
            >
              <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Have an invite code now? Redeem it here so your event is ready the moment you open
                VS Code (optional).
              </p>
              {joinState === "done" ? (
                <p className="hint" style={{ color: "var(--green)" }}>✓ {joinMsg}</p>
              ) : (
                <form onSubmit={joinWithCode} style={{ display: "flex", gap: 8 }}>
                  <input
                    aria-label="Invite code"
                    className="mono"
                    placeholder="HACK-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                      flex: 1,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      color: "var(--text)",
                    }}
                  />
                  <button className="btn btn-sm" disabled={joinState === "busy" || !code.trim()}>
                    {joinState === "busy" ? "…" : "Join"}
                  </button>
                </form>
              )}
              {joinState === "error" && (
                <p className="error" style={{ marginTop: 8 }}>{joinMsg}</p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
