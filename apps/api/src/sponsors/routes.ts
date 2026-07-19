import type { FastifyInstance } from "fastify";
import { createSponsorSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";
import { audit } from "../lib/audit.js";

const COLS =
  "id, name, tier, brand_color AS \"brandColor\", tagline, url, created_at AS \"createdAt\"";

const TIER_ORDER = "array_position(ARRAY['platinum','gold','silver','partner'], tier)";

export async function sponsorRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/sponsors", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM sponsors WHERE hackathon_id = $1 ORDER BY ${TIER_ORDER}, name`,
      [req.params.id],
    );
    return rows;
  });

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/sponsors", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createSponsorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { name, tier, brandColor, tagline, url } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO sponsors (hackathon_id, name, tier, brand_color, tagline, url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLS}`,
      [req.params.id, name, tier, brandColor, tagline ?? null, url ?? null],
    );
    audit(req.params.id, member.userId, "sponsor.create", rows[0].id, { name, tier });
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string; sponsorId: string } }>(
    "/v1/hackathons/:id/sponsors/:sponsorId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rowCount } = await pool.query(
        "DELETE FROM sponsors WHERE id = $2 AND hackathon_id = $1",
        [req.params.id, req.params.sponsorId],
      );
      if (!rowCount) return reply.code(404).send({ error: "sponsor not found" });
      audit(req.params.id, member.userId, "sponsor.delete", req.params.sponsorId);
      return reply.code(204).send();
    },
  );
}
