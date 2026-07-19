import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";
import { publish } from "../lib/realtime.js";

const sendSchema = z.object({
  body: z.string().min(1).max(4000),
  teamId: z.string().uuid().nullable().optional(), // null/absent = community channel
});

async function inTeam(hackathonId: string, teamId: string, userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
     WHERE t.hackathon_id = $1 AND tm.team_id = $2 AND tm.user_id = $3`,
    [hackathonId, teamId, userId],
  );
  return !!rowCount;
}

export async function messageRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string }; Querystring: { teamId?: string; limit?: string } }>(
    "/v1/hackathons/:id/messages",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const teamId = req.query.teamId ?? null;
      if (teamId && !(await inTeam(req.params.id, teamId, member.userId))) {
        // Mentors and organizers may read any team channel to help out.
        if (member.role === "participant") {
          return reply.code(403).send({ error: "not in this team" });
        }
      }
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const { rows } = await pool.query(
        `SELECT m.id, m.team_id AS "teamId", m.body, m.created_at AS "createdAt",
                u.name AS "userName",
                (SELECT role FROM hackathon_members hm
                 WHERE hm.hackathon_id = m.hackathon_id AND hm.user_id = m.user_id) AS "userRole"
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.hackathon_id = $1 AND m.team_id IS NOT DISTINCT FROM $2
         ORDER BY m.created_at DESC LIMIT $3`,
        [req.params.id, teamId, limit],
      );
      return rows.reverse();
    },
  );

  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/messages", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const teamId = parsed.data.teamId ?? null;
    if (teamId && member.role === "participant" && !(await inTeam(req.params.id, teamId, member.userId))) {
      return reply.code(403).send({ error: "not in this team" });
    }
    const { rows } = await pool.query(
      `INSERT INTO messages (hackathon_id, team_id, user_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, team_id AS "teamId", body, created_at AS "createdAt"`,
      [req.params.id, teamId, member.userId, parsed.data.body],
    );
    const nameRes = await pool.query("SELECT name FROM users WHERE id = $1", [member.userId]);
    const message = { ...rows[0], userName: nameRes.rows[0].name, userRole: member.role };
    publish(req.params.id, { type: "chat.message", payload: message });
    return reply.code(201).send(message);
  });
}
