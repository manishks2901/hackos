import type { FastifyInstance } from "fastify";
import { createTimelineItemSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";
import { publish } from "../lib/realtime.js";

const COLS =
  "id, hackathon_id AS \"hackathonId\", title, description, starts_at AS \"startsAt\", ends_at AS \"endsAt\"";

export async function timelineRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/timeline", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM timeline_items WHERE hackathon_id = $1 ORDER BY starts_at ASC`,
      [req.params.id],
    );
    return rows;
  });

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/timeline", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createTimelineItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { title, description, startsAt, endsAt } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO timeline_items (hackathon_id, title, description, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [req.params.id, title, description ?? null, startsAt, endsAt ?? null],
    );
    publish(req.params.id, {
      type: "deadline.changed",
      payload: { timelineItemId: rows[0].id, startsAt: rows[0].startsAt },
    });
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/v1/hackathons/:id/timeline/:itemId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rowCount } = await pool.query(
        "DELETE FROM timeline_items WHERE id = $2 AND hackathon_id = $1",
        [req.params.id, req.params.itemId],
      );
      if (!rowCount) return reply.code(404).send({ error: "timeline item not found" });
      return reply.code(204).send();
    },
  );
}
