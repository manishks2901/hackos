import type { FastifyInstance } from "fastify";
import { createResourceSchema, updateResourceSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";
import { enqueueIngest } from "../lib/queue.js";
import { publish } from "../lib/realtime.js";
import { audit } from "../lib/audit.js";

const COLS =
  "id, hackathon_id AS \"hackathonId\", type, title, content, url, version, created_at AS \"createdAt\", updated_at AS \"updatedAt\"";

export async function resourceRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string }; Querystring: { type?: string } }>(
    "/v1/hackathons/:id/resources",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const params: unknown[] = [req.params.id];
      let where = "hackathon_id = $1";
      if (req.query.type) {
        params.push(req.query.type);
        where += " AND type = $2";
      }
      const { rows } = await pool.query(
        `SELECT ${COLS} FROM resources WHERE ${where} ORDER BY created_at DESC`,
        params,
      );
      return rows;
    },
  );

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/resources", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createResourceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { type, title, content, url } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO resources (hackathon_id, type, title, content, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [req.params.id, type, title, content ?? null, url ?? null],
    );
    enqueueIngest(req.params.id, rows[0].id);
    publish(req.params.id, {
      type: "resource.updated",
      payload: { resourceId: rows[0].id, version: rows[0].version },
    });
    audit(req.params.id, member.userId, "resource.create", rows[0].id, { title, type });
    return reply.code(201).send(rows[0]);
  });

  app.patch<{ Params: { id: string; resourceId: string } }>(
    "/v1/hackathons/:id/resources/:resourceId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const parsed = updateResourceSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { type, title, content, url } = parsed.data;
      const { rows } = await pool.query(
        `UPDATE resources SET
           type = COALESCE($3, type),
           title = COALESCE($4, title),
           content = COALESCE($5, content),
           url = COALESCE($6, url),
           version = version + 1,
           updated_at = now()
         WHERE id = $2 AND hackathon_id = $1
         RETURNING ${COLS}`,
        [req.params.id, req.params.resourceId, type ?? null, title ?? null, content ?? null, url ?? null],
      );
      if (!rows[0]) return reply.code(404).send({ error: "resource not found" });
      enqueueIngest(req.params.id, req.params.resourceId);
      publish(req.params.id, {
        type: "resource.updated",
        payload: { resourceId: rows[0].id, version: rows[0].version },
      });
      return rows[0];
    },
  );

  app.delete<{ Params: { id: string; resourceId: string } }>(
    "/v1/hackathons/:id/resources/:resourceId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rowCount } = await pool.query(
        "DELETE FROM resources WHERE id = $2 AND hackathon_id = $1",
        [req.params.id, req.params.resourceId],
      );
      if (!rowCount) return reply.code(404).send({ error: "resource not found" });
      enqueueIngest(req.params.id, req.params.resourceId); // worker clears orphaned chunks
      audit(req.params.id, member.userId, "resource.delete", req.params.resourceId);
      return reply.code(204).send();
    },
  );
}
