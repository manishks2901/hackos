import type { FastifyInstance } from "fastify";
import { createAnnouncementSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";
import { publish } from "../lib/realtime.js";
import { enqueueBroadcast } from "../lib/queue.js";
import { audit } from "../lib/audit.js";

const COLS =
  "a.id, a.hackathon_id AS \"hackathonId\", a.title, a.body, a.priority, a.category, a.created_at AS \"createdAt\"";

const SPONSOR_JSON = `CASE WHEN s.id IS NULL THEN NULL ELSE
  json_build_object('name', s.name, 'tier', s.tier, 'brandColor', s.brand_color, 'url', s.url)
END AS sponsor`;

export async function announcementRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    "/v1/hackathons/:id/announcements",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const limit = Math.min(Number(req.query.limit ?? 50), 100);
      const params: unknown[] = [req.params.id, limit];
      let where = "a.hackathon_id = $1";
      if (req.query.cursor) {
        params.push(req.query.cursor);
        where += " AND a.created_at < $3";
      }
      const { rows } = await pool.query(
        `SELECT ${COLS}, ${SPONSOR_JSON}
         FROM announcements a LEFT JOIN sponsors s ON s.id = a.sponsor_id
         WHERE ${where} ORDER BY a.created_at DESC LIMIT $2`,
        params,
      );
      return rows;
    },
  );

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/announcements", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { title, body, priority, category, sponsorId } = parsed.data;

    if (sponsorId) {
      const s = await pool.query("SELECT 1 FROM sponsors WHERE id = $1 AND hackathon_id = $2", [
        sponsorId,
        req.params.id,
      ]);
      if (!s.rowCount) return reply.code(400).send({ error: "unknown sponsor" });
    }

    const inserted = await pool.query(
      `INSERT INTO announcements (hackathon_id, title, body, priority, category, sponsor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.params.id, title, body, priority, category, sponsorId ?? null, member.userId],
    );
    const { rows } = await pool.query(
      `SELECT ${COLS}, ${SPONSOR_JSON}
       FROM announcements a LEFT JOIN sponsors s ON s.id = a.sponsor_id
       WHERE a.id = $1`,
      [inserted.rows[0].id],
    );
    publish(req.params.id, { type: "announcement.created", payload: rows[0] });
    enqueueBroadcast(req.params.id, rows[0].id);
    audit(req.params.id, member.userId, "announcement.create", rows[0].id, {
      title,
      priority,
      category,
    });
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string; announcementId: string } }>(
    "/v1/hackathons/:id/announcements/:announcementId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rowCount } = await pool.query(
        "DELETE FROM announcements WHERE id = $2 AND hackathon_id = $1",
        [req.params.id, req.params.announcementId],
      );
      if (!rowCount) return reply.code(404).send({ error: "announcement not found" });
      audit(req.params.id, member.userId, "announcement.delete", req.params.announcementId);
      return reply.code(204).send();
    },
  );
}
