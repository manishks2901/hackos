import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { signupSchema, signinSchema, refreshSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from "./tokens.js";

export async function requireAuth(authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.post("/v1/auth/signup", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password, name } = parsed.data;

    const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existing.rowCount) return reply.code(409).send({ error: "email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3) RETURNING id, email, name, avatar_url`,
      [email, passwordHash, name],
    );
    const user = rows[0];
    return reply.code(201).send({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url },
      accessToken: signAccessToken({ sub: user.id, email: user.email }),
      refreshToken: await issueRefreshToken(pool, user.id),
    });
  });

  app.post("/v1/auth/signin", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const { rows } = await pool.query(
      "SELECT id, email, name, avatar_url, password_hash FROM users WHERE email = $1",
      [email],
    );
    const user = rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    return {
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url },
      accessToken: signAccessToken({ sub: user.id, email: user.email }),
      refreshToken: await issueRefreshToken(pool, user.id),
    };
  });

  app.post("/v1/auth/refresh", async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const rotated = await rotateRefreshToken(pool, parsed.data.refreshToken);
    if (!rotated) return reply.code(401).send({ error: "invalid refresh token" });

    const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1", [
      rotated.userId,
    ]);
    if (!rows[0]) return reply.code(401).send({ error: "unknown user" });

    return {
      accessToken: signAccessToken({ sub: rows[0].id, email: rows[0].email }),
      refreshToken: rotated.refreshToken,
    };
  });

  app.get("/v1/auth/me", async (req, reply) => {
    const claims = await requireAuth(req.headers.authorization);
    if (!claims) return reply.code(401).send({ error: "unauthorized" });
    const { rows } = await pool.query(
      "SELECT id, email, name, avatar_url FROM users WHERE id = $1",
      [claims.sub],
    );
    if (!rows[0]) return reply.code(401).send({ error: "unknown user" });
    const u = rows[0];
    return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url };
  });
}
