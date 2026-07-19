import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getPool } from "@hackos/db";
import { signAccessToken, issueRefreshToken } from "./tokens.js";

const providerSchema = z.enum(["google", "github"]);
type Provider = z.infer<typeof providerSchema>;

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const webUrl = () => process.env.WEB_URL ?? "http://localhost:3000";
const callbackBase = () => process.env.OAUTH_CALLBACK_BASE ?? "http://localhost:4010";
const redirectUri = (provider: Provider) =>
  `${callbackBase()}/v1/auth/oauth/${provider}/callback`;

function credentials(provider: Provider): { clientId: string; clientSecret: string } | null {
  const clientId =
    provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// Short-TTL in-memory state store (single API instance in dev; move to Redis when clustered).
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, { provider: Provider; expiresAt: number }>();

function createState(provider: Provider): string {
  const now = Date.now();
  for (const [key, entry] of pendingStates) {
    if (entry.expiresAt <= now) pendingStates.delete(key);
  }
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, { provider, expiresAt: now + STATE_TTL_MS });
  return state;
}

function consumeState(state: string, provider: Provider): boolean {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  return !!entry && entry.provider === provider && entry.expiresAt > Date.now();
}

interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}

async function exchangeCode(
  provider: Provider,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const tokenUrl =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://github.com/login/oauth/access_token";
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(provider),
      ...(provider === "google" ? { grant_type: "authorization_code" } : {}),
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchProfile(provider: Provider, accessToken: string): Promise<OAuthProfile | null> {
  if (provider === "google") {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      id?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (!u.id) return null;
    return {
      providerUserId: String(u.id),
      email: u.email ?? null,
      name: u.name || u.email || "Google user",
      avatarUrl: u.picture ?? null,
    };
  }

  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "hackos-api",
  };
  const res = await fetch("https://api.github.com/user", { headers });
  if (!res.ok) return null;
  const u = (await res.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };
  if (!u.id) return null;

  let email = u.email ?? null;
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (primary) email = primary.email;
  }

  return {
    providerUserId: String(u.id),
    email,
    name: u.name || u.login || "GitHub user",
    avatarUrl: u.avatar_url ?? null,
  };
}

export async function oauthRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get("/v1/auth/oauth/:provider/start", async (req, reply) => {
    const parsed = providerSchema.safeParse((req.params as { provider: string }).provider);
    if (!parsed.success) return reply.code(400).send({ error: "unknown provider" });
    const provider = parsed.data;

    const creds = credentials(provider);
    if (!creds) return reply.redirect(`${webUrl()}/signin?error=oauth_not_configured`);

    const state = createState(provider);
    const authorizeUrl =
      provider === "google"
        ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
            client_id: creds.clientId,
            redirect_uri: redirectUri(provider),
            response_type: "code",
            scope: "openid email profile",
            state,
          })}`
        : `https://github.com/login/oauth/authorize?${new URLSearchParams({
            client_id: creds.clientId,
            redirect_uri: redirectUri(provider),
            scope: "read:user user:email",
            state,
          })}`;
    return reply.redirect(authorizeUrl);
  });

  app.get("/v1/auth/oauth/:provider/callback", async (req, reply) => {
    const parsed = providerSchema.safeParse((req.params as { provider: string }).provider);
    if (!parsed.success) return reply.code(400).send({ error: "unknown provider" });
    const provider = parsed.data;

    const creds = credentials(provider);
    if (!creds) return reply.redirect(`${webUrl()}/signin?error=oauth_not_configured`);

    const query = callbackQuerySchema.safeParse(req.query);
    if (!query.success || !consumeState(query.data.state, provider)) {
      return reply.redirect(`${webUrl()}/signin?error=oauth_failed`);
    }

    const providerToken = await exchangeCode(
      provider,
      query.data.code,
      creds.clientId,
      creds.clientSecret,
    );
    if (!providerToken) return reply.redirect(`${webUrl()}/signin?error=oauth_failed`);

    const profile = await fetchProfile(provider, providerToken);
    if (!profile) return reply.redirect(`${webUrl()}/signin?error=oauth_failed`);

    // Upsert: linked oauth account → existing user by email → brand-new user.
    let userId: string | undefined;
    const linked = await pool.query(
      "SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2",
      [provider, profile.providerUserId],
    );
    if (linked.rows[0]) {
      userId = linked.rows[0].user_id;
    } else {
      if (profile.email) {
        const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
          profile.email,
        ]);
        userId = existing.rows[0]?.id;
      }
      if (!userId) {
        if (!profile.email) {
          // users.email is NOT NULL — we cannot create an account without one.
          return reply.redirect(`${webUrl()}/signin?error=oauth_no_email`);
        }
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, name, avatar_url)
           VALUES ($1, NULL, $2, $3) RETURNING id`,
          [profile.email, profile.name, profile.avatarUrl],
        );
        userId = rows[0].id;
      }
      await pool.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
         VALUES ($1, $2, $3) ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [userId, provider, profile.providerUserId],
      );
    }

    const { rows: userRows } = await pool.query("SELECT id, email FROM users WHERE id = $1", [
      userId,
    ]);
    const user = userRows[0];
    if (!user) return reply.redirect(`${webUrl()}/signin?error=oauth_failed`);

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(pool, user.id);

    // Tokens travel in the URL fragment so they never appear in server logs.
    return reply.redirect(
      `${webUrl()}/auth/callback#access=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`,
    );
  });
}
