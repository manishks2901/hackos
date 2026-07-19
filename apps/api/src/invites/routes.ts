import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createInviteSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";

const COLS =
  "id, code, role, max_uses AS \"maxUses\", uses, expires_at AS \"expiresAt\", revoked, created_at AS \"createdAt\"";

function inviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  return `HACK-${pick(4)}-${pick(4)}`;
}

export async function inviteRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/invites", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM invite_codes WHERE hackathon_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    return rows;
  });

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/invites", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createInviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { role, maxUses, expiresAt } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO invite_codes (hackathon_id, code, role, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [req.params.id, inviteCode(), role, maxUses ?? null, expiresAt ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  app.post<{ Params: { id: string; inviteId: string } }>(
    "/v1/hackathons/:id/invites/:inviteId/revoke",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rows } = await pool.query(
        `UPDATE invite_codes SET revoked = true
         WHERE id = $2 AND hackathon_id = $1 RETURNING ${COLS}`,
        [req.params.id, req.params.inviteId],
      );
      if (!rows[0]) return reply.code(404).send({ error: "invite not found" });
      return rows[0];
    },
  );
}
