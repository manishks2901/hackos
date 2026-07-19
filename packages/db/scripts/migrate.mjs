import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const connectionString =
  process.env.DATABASE_URL ?? "postgres://hackos:hackos@localhost:5433/hackos";

// Managed DBs (DigitalOcean/RDS) need TLS but present an untrusted chain; verify
// against DATABASE_CA_CERT when provided, otherwise connect without chain check.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
const ssl = isLocal
  ? undefined
  : process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
    : { rejectUnauthorized: false };

// node-postgres treats sslmode=require in the URL as "verify cert", overriding
// the ssl config; strip it so the ssl object above is authoritative.
let cs = connectionString;
if (ssl) {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    cs = u.toString();
  } catch {
    cs = connectionString.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
  }
}

const client = new pg.Client({ connectionString: cs, ssl });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`apply  ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
