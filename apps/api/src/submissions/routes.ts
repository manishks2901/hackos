import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "@hackos/db";
import { Storage } from "@hackos/shared";
import { requireMember } from "../lib/authz.js";

const submitSchema = z.object({
  repoUrl: z.string().url(),
  description: z.string().max(4000).optional(),
  demoUrl: z.string().url().optional(),
});

const uploadSchema = z.object({
  // safe filename only — no path separators, so callers can't escape their prefix
  filename: z.string().min(1).max(200).regex(/^[\w.\- ]+$/, "letters, numbers, spaces, . _ - only"),
  contentType: z.string().max(160).optional(),
});
const downloadSchema = z.object({ key: z.string().min(1).max(512) });

// Object storage is optional: instantiate lazily so the API still boots when
// S3/MinIO isn't configured (the upload endpoints then return 503).
let storageInstance: Storage | null | undefined;
function getStorage(): Storage | null {
  if (storageInstance !== undefined) return storageInstance;
  try {
    storageInstance = new Storage();
  } catch {
    storageInstance = null;
  }
  return storageInstance;
}

export async function submissionRoutes(app: FastifyInstance) {
  const pool = getPool();

  const teamOf = async (hackathonId: string, userId: string): Promise<string | undefined> => {
    const { rows } = await pool.query(
      `SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id
       WHERE t.hackathon_id = $1 AND tm.user_id = $2`,
      [hackathonId, userId],
    );
    return rows[0]?.id as string | undefined;
  };

  // Presigned PUT URL so a team uploads a submission artifact (build, slides,
  // video) straight to S3 — the file never passes through the API.
  app.post<{ Params: { id: string } }>(
    "/v1/hackathons/:id/submissions/upload-url",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const store = getStorage();
      if (!store) return reply.code(503).send({ error: "file storage is not configured" });

      const teamId = await teamOf(req.params.id, member.userId);
      if (!teamId) return reply.code(400).send({ error: "join or create a team first" });

      const key = `submissions/${req.params.id}/${teamId}/${parsed.data.filename}`;
      const uploadUrl = await store.presignUpload(key, {
        contentType: parsed.data.contentType,
        expiresIn: 900,
      });
      return reply.code(200).send({ key, uploadUrl, expiresIn: 900 });
    },
  );

  // Presigned GET URL for a stored artifact. Participants may only read their own
  // team's files; organizers and mentors may read any in the hackathon.
  app.post<{ Params: { id: string } }>(
    "/v1/hackathons/:id/submissions/download-url",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const parsed = downloadSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const store = getStorage();
      if (!store) return reply.code(503).send({ error: "file storage is not configured" });

      const { key } = parsed.data;
      const prefix = `submissions/${req.params.id}/`;
      if (!key.startsWith(prefix)) return reply.code(400).send({ error: "invalid key" });
      if (member.role !== "organizer" && member.role !== "mentor") {
        const teamId = await teamOf(req.params.id, member.userId);
        if (!teamId || !key.startsWith(`${prefix}${teamId}/`)) {
          return reply.code(403).send({ error: "forbidden" });
        }
      }
      const url = await store.presignDownload(key, { expiresIn: 300 });
      return reply.code(200).send({ url, expiresIn: 300 });
    },
  );

  // Submit (or update) the caller's team submission. Deadline enforced server-side.
  app.post<{ Params: { id: string } }>("/v1/hackathons/:id/submissions", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id);
    if (!member) return;
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const deadline = await pool.query(
      "SELECT ends_at FROM hackathons WHERE id = $1",
      [req.params.id],
    );
    const endsAt = deadline.rows[0]?.ends_at;
    if (endsAt && new Date(endsAt).getTime() < Date.now()) {
      return reply.code(403).send({ error: "submission deadline has passed" });
    }

    const team = await pool.query(
      `SELECT t.id, t.name FROM teams t JOIN team_members tm ON tm.team_id = t.id
       WHERE t.hackathon_id = $1 AND tm.user_id = $2`,
      [req.params.id, member.userId],
    );
    if (!team.rows[0]) return reply.code(400).send({ error: "join or create a team first" });

    const { repoUrl, description, demoUrl } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO submissions (hackathon_id, team_id, repo_url, description, demo_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (hackathon_id, team_id) DO UPDATE SET
         repo_url = EXCLUDED.repo_url,
         description = EXCLUDED.description,
         demo_url = EXCLUDED.demo_url,
         submitted_at = now()
       RETURNING id, repo_url AS "repoUrl", description, demo_url AS "demoUrl",
                 submitted_at AS "submittedAt"`,
      [req.params.id, team.rows[0].id, repoUrl, description ?? null, demoUrl ?? null],
    );
    return reply.code(201).send({ ...rows[0], teamName: team.rows[0].name });
  });

  // The caller's team submission (extension shows status).
  app.get<{ Params: { id: string } }>(
    "/v1/hackathons/:id/submissions/mine",
    async (req, reply) => {
      const member = await requireMember(pool, req, reply, req.params.id);
      if (!member) return;
      const { rows } = await pool.query(
        `SELECT s.id, s.repo_url AS "repoUrl", s.description, s.demo_url AS "demoUrl",
                s.submitted_at AS "submittedAt", t.name AS "teamName"
         FROM submissions s
         JOIN teams t ON t.id = s.team_id
         JOIN team_members tm ON tm.team_id = t.id
         WHERE s.hackathon_id = $1 AND tm.user_id = $2`,
        [req.params.id, member.userId],
      );
      return rows[0] ?? null;
    },
  );

  // All submissions — organizers (and mentors, read-only) on the dashboard.
  app.get<{ Params: { id: string } }>("/v1/hackathons/:id/submissions", async (req, reply) => {
    const member = await requireMember(pool, req, reply, req.params.id, ["organizer", "mentor"]);
    if (!member) return;
    const { rows } = await pool.query(
      `SELECT s.id, s.repo_url AS "repoUrl", s.description, s.demo_url AS "demoUrl",
              s.submitted_at AS "submittedAt", t.name AS "teamName",
              (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS "teamSize"
       FROM submissions s JOIN teams t ON t.id = s.team_id
       WHERE s.hackathon_id = $1
       ORDER BY s.submitted_at DESC`,
      [req.params.id],
    );
    return rows;
  });
}
