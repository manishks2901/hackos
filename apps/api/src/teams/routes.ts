import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";

const createTeamSchema = z.object({ name: z.string().min(1).max(60) });

export async function teamRoutes(app: FastifyInstance) {
  const pool = getPool();

  // Teams with members; the caller's own team is flagged.
  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/teams", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT t.id, t.name,
              COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name)
                       ORDER BY tm.joined_at) FILTER (WHERE u.id IS NOT NULL), '[]') AS members,
              bool_or(u.id = $2) AS "isMine",
              EXISTS (SELECT 1 FROM submissions s WHERE s.team_id = t.id) AS "hasSubmission"
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN users u ON u.id = tm.user_id
       WHERE t.hackathon_id = $1
       GROUP BY t.id
       ORDER BY t.created_at ASC`,
      [req.params.id, member.userId],
    );
    return rows;
  });

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/teams", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
         WHERE t.hackathon_id = $1 AND tm.user_id = $2`,
        [req.params.id, member.userId],
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "you are already in a team for this event" });
      }
      const { rows } = await client.query(
        "INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id, name",
        [req.params.id, parsed.data.name],
      );
      await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)", [
        rows[0].id,
        member.userId,
      ]);
      await client.query("COMMIT");
      return reply.code(201).send(rows[0]);
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "team name already taken" });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.post<{ Params: { id: string; teamId: string } }>(
    "/v1/hackathons/:id/teams/:teamId/join",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const team = await pool.query(
        "SELECT id, name FROM teams WHERE id = $1 AND hackathon_id = $2",
        [req.params.teamId, req.params.id],
      );
      if (!team.rows[0]) return reply.code(404).send({ error: "team not found" });
      const existing = await pool.query(
        `SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
         WHERE t.hackathon_id = $1 AND tm.user_id = $2`,
        [req.params.id, member.userId],
      );
      if (existing.rowCount) {
        return reply.code(409).send({ error: "you are already in a team for this event" });
      }
      await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)", [
        req.params.teamId,
        member.userId,
      ]);
      return team.rows[0];
    },
  );

  // Mentors of this event (for the extension's Team section).
  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/mentors", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT u.id, u.name FROM hackathon_members m JOIN users u ON u.id = m.user_id
       WHERE m.hackathon_id = $1 AND m.role = 'mentor' ORDER BY u.name`,
      [req.params.id],
    );
    return rows;
  });
}
