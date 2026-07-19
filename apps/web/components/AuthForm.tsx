"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setTokens } from "../lib/api";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = mode === "signup" ? { name, email, password } : { email, password };
      const res = await api<{ accessToken: string; refreshToken: string }>(
        `/v1/auth/${mode}`,
        { method: "POST", body, auth: false },
      );
      setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "signup" ? 8 : 1}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={busy} style={{ width: "100%" }}>
        {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
