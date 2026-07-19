"use client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4010";

// Phase 1 dev-grade token storage; moves to httpOnly cookies in Phase 8 hardening.
export function getTokens() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("hackos.tokens");
  return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
}

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  if (tokens) localStorage.setItem("hackos.tokens", JSON.stringify(tokens));
  else localStorage.removeItem("hackos.tokens");
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== false) {
    const tokens = getTokens();
    if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  }
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}
