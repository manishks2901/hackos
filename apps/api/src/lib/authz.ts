import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@hackos/db";
import { requireAuth } from "../auth/routes.js";

export type Role = "organizer" | "mentor" | "participant";

/**
 * Authenticates the request and checks membership in the hackathon.
 * Replies 401/403 and returns null on failure.
 */
export async function requireMember(
  pool: Pool,
  req: FastifyRequest,
  reply: FastifyReply,
  hackathonId: string,
  roles?: Role[],
): Promise<{ userId: string; role: Role } | null> {
  const claims = await requireAuth(req.headers.authorization);
  if (!claims) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const { rows } = await pool.query(
    "SELECT role FROM hackathon_members WHERE hackathon_id = $1 AND user_id = $2",
    [hackathonId, claims.sub],
  );
  const role = rows[0]?.role as Role | undefined;
  if (!role) {
    reply.code(403).send({ error: "not a member of this hackathon" });
    return null;
  }
  if (roles && !roles.includes(role)) {
    reply.code(403).send({ error: `requires role: ${roles.join(" or ")}` });
    return null;
  }
  return { userId: claims.sub, role };
}
