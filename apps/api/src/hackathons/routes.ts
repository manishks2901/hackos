import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createHackathonSchema, redeemInviteSchema, updateHackathonSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireAuth } from "../auth/routes.js";
import { requireMember } from "../lib/authz.js";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function inviteCode(): string {
  // Readable, unambiguous: HACK-XXXX-XXXX
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  return `HACK-${pick(4)}-${pick(4)}`;
}

export async function hackathonRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.post("/v1/hackathons", async (req, reply) => {
    const claims = await requireAuth(req.headers.authorization);
    if (!claims) return reply.code(401).send({ error: "unauthorized" });

    const parsed = createHackathonSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { name, description, venue, startsAt, endsAt } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO hackathons (name, slug, description, venue, starts_at, ends_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, slug, description, venue, starts_at, ends_at`,
        [name, slugify(name), description ?? null, venue ?? null, startsAt ?? null, endsAt ?? null, claims.sub],
      );
      const hackathon = rows[0];
      await client.query(
        `INSERT INTO hackathon_members (hackathon_id, user_id, role) VALUES ($1, $2, 'organizer')`,
        [hackathon.id, claims.sub],
      );
      const code = inviteCode();
      await client.query(
        `INSERT INTO invite_codes (hackathon_id, code) VALUES ($1, $2)`,
        [hackathon.id, code],
      );
      await client.query("COMMIT");
      return reply.code(201).send({ ...hackathon, inviteCode: code });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  app.get("/v1/hackathons", async (req, reply) => {
    const claims = await requireAuth(req.headers.authorization);
    if (!claims) return reply.code(401).send({ error: "unauthorized" });

    const { rows } = await pool.query(
      `SELECT h.id, h.name, h.slug, h.description, h.venue, h.starts_at, h.ends_at, m.role
       FROM hackathons h
       JOIN hackathon_members m ON m.hackathon_id = h.id
       WHERE m.user_id = $1
       ORDER BY h.created_at DESC`,
      [claims.sub],
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT id, name, slug, description, venue,
              starts_at AS "startsAt", ends_at AS "endsAt"
       FROM hackathons WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not found" });
    return { ...rows[0], role: member.role };
  });

  app.patch<{ Params: { id: string } }>("/v1/hackathons/:id", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = updateHackathonSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { name, description, venue, startsAt, endsAt } = parsed.data;
    const { rows } = await pool.query(
      `UPDATE hackathons SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         venue = COALESCE($4, venue),
         starts_at = COALESCE($5, starts_at),
         ends_at = COALESCE($6, ends_at)
       WHERE id = $1
       RETURNING id, name, slug, description, venue, starts_at AS "startsAt", ends_at AS "endsAt"`,
      [req.params.id, name ?? null, description ?? null, venue ?? null, startsAt ?? null, endsAt ?? null],
    );
    return rows[0];
  });

  app.post("/v1/invites/redeem", async (req, reply) => {
    const claims = await requireAuth(req.headers.authorization);
    if (!claims) return reply.code(401).send({ error: "unauthorized" });

    const parsed = redeemInviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE invite_codes SET uses = uses + 1
         WHERE code = $1 AND revoked = false
           AND (expires_at IS NULL OR expires_at > now())
           AND (max_uses IS NULL OR uses < max_uses)
         RETURNING hackathon_id, role`,
        [parsed.data.code],
      );
      const invite = rows[0];
      if (!invite) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "invalid or expired invite code" });
      }
      await client.query(
        `INSERT INTO hackathon_members (hackathon_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (hackathon_id, user_id) DO NOTHING`,
        [invite.hackathon_id, claims.sub, invite.role],
      );
      const hack = await client.query(
        `SELECT id, name, slug, description, venue, starts_at, ends_at FROM hackathons WHERE id = $1`,
        [invite.hackathon_id],
      );
      await client.query("COMMIT");
      return { ...hack.rows[0], role: invite.role };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
}
