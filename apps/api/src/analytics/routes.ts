import type { FastifyInstance } from "fastify";
import { getPool } from "@hackos/db";
import { requireMember } from "../lib/authz.js";

const REFUSAL = "That's not covered in the event docs yet%";

export async function analyticsRoutes(app: FastifyInstance) {
  const pool = getPool();

  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/analytics", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer"]);
    if (!member) return;
    const id = req.params.id;

    const [counts, questions, deliveries] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*) FROM hackathon_members WHERE hackathon_id = $1 AND role = 'participant')::int AS participants,
           (SELECT count(*) FROM hackathon_members WHERE hackathon_id = $1 AND role = 'mentor')::int AS mentors,
           (SELECT count(*) FROM teams WHERE hackathon_id = $1)::int AS teams,
           (SELECT count(*) FROM submissions WHERE hackathon_id = $1)::int AS submissions,
           (SELECT count(*) FROM announcements WHERE hackathon_id = $1)::int AS announcements,
           (SELECT count(*) FROM resources WHERE hackathon_id = $1)::int AS resources,
           (SELECT count(*) FROM qa_logs WHERE hackathon_id = $1)::int AS "questionsAsked",
           (SELECT count(*) FROM qa_logs WHERE hackathon_id = $1 AND answer LIKE $2)::int AS unanswered`,
        [id, REFUSAL],
      ),
      pool.query(
        `SELECT question, answer LIKE $2 AS "wasUnanswered", created_at AS "createdAt"
         FROM qa_logs WHERE hackathon_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id, REFUSAL],
      ),
      pool.query(
        `SELECT d.status, count(*)::int AS count
         FROM integration_deliveries d
         JOIN integrations i ON i.id = d.integration_id
         WHERE i.hackathon_id = $1 GROUP BY d.status`,
        [id],
      ),
    ]);

    const broadcast = { sent: 0, failed: 0 };
    for (const row of deliveries.rows) {
      if (row.status === "sent") broadcast.sent = row.count;
      if (row.status === "failed") broadcast.failed = row.count;
    }

    return { ...counts.rows[0], recentQuestions: questions.rows, broadcast };
  });
}
