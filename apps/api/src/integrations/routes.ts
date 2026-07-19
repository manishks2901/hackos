import type { FastifyInstance } from "fastify";
import { createIntegrationSchema } from "@hackos/shared";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";

const COLS = "id, kind, config, status, created_at AS \"createdAt\"";

export async function integrationRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/integrations", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM integrations WHERE hackathon_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    return rows;
  });

  // Phase 2: store the connection (channel/chat ids entered on the dashboard).
  // Phase 5 replaces manual entry with the bot-invite / linking-code flows and
  // wires the broadcast worker to these rows.
  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/integrations", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const parsed = createIntegrationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { kind, config } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO integrations (hackathon_id, kind, config)
       VALUES ($1, $2, $3) RETURNING ${COLS}`,
      [req.params.id, kind, JSON.stringify(config)],
    );
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string; integrationId: string } }>(
    "/v1/hackathons/:id/integrations/:integrationId",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
      if (!member) return;
      const { rowCount } = await pool.query(
        "DELETE FROM integrations WHERE id = $2 AND hackathon_id = $1",
        [req.params.id, req.params.integrationId],
      );
      if (!rowCount) return reply.code(404).send({ error: "integration not found" });
      return reply.code(204).send();
    },
  );
}
