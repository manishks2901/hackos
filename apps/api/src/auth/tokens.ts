import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Pool } from "@hackos/db";
import { env } from "../env.js";

export interface AccessClaims {
  sub: string;
  email: string;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: env.accessTtlSec });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.jwtSecret) as AccessClaims;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(pool: Pool, userId: string): Promise<string> {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, jti }, env.jwtRefreshSecret, {
    expiresIn: env.refreshTtlSec,
  });
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [userId, hashToken(token), env.refreshTtlSec],
  );
  return token;
}

/** Verifies + rotates: revokes the presented token and issues a new pair. */
export async function rotateRefreshToken(
  pool: Pool,
  token: string,
): Promise<{ userId: string; refreshToken: string } | null> {
  let payload: { sub: string };
  try {
    payload = jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
  } catch {
    return null;
  }
  const { rowCount } = await pool.query(
    `UPDATE refresh_tokens SET revoked = true
     WHERE token_hash = $1 AND revoked = false AND expires_at > now()`,
    [hashToken(token)],
  );
  if (rowCount === 0) return null; // unknown, expired, or replayed token
  const refreshToken = await issueRefreshToken(pool, payload.sub);
  return { userId: payload.sub, refreshToken };
}
