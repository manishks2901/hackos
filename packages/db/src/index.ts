import pg from "pg";

let pool: pg.Pool | undefined;

/**
 * TLS config for the connection. Managed providers (DigitalOcean, RDS, …)
 * present a certificate chain Node doesn't trust out of the box, so a plain
 * `sslmode=require` connection throws SELF_SIGNED_CERT_IN_CHAIN.
 *   - local (localhost / 127.0.0.1) → no SSL
 *   - DATABASE_CA_CERT set          → verify against that CA (correct for prod)
 *   - otherwise                     → TLS on, chain verification off
 */
function sslConfig(connectionString: string): pg.PoolConfig["ssl"] {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const wantsSsl = /sslmode=(require|verify-ca|verify-full)/.test(connectionString) || !isLocal;
  if (isLocal || !wantsSsl) return undefined;
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Remove `sslmode` from the URL. node-postgres treats `sslmode=require` as
 * "verify the certificate" (unlike libpq, where it means "encrypt, don't
 * verify"), and that URL setting overrides the explicit `ssl` config — so we
 * strip it and let sslConfig() be the single source of truth.
 */
function stripSslMode(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return connectionString.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    const raw =
      process.env.DATABASE_URL ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "postgres://hackos:hackos@localhost:5433/hackos");
    if (!raw) throw new Error("DATABASE_URL is not set");
    const ssl = sslConfig(raw);
    const connectionString = ssl ? stripSslMode(raw) : raw;
    pool = new pg.Pool({ connectionString, max: 10, ssl });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type { Pool, PoolClient, QueryResult } from "pg";
