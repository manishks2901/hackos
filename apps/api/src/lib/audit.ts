import { getPool } from "@hackos/db";

/** Fire-and-forget audit trail for organizer mutations. Never blocks the request. */
export function audit(
  hackathonId: string,
  userId: string,
  action: string,
  targetId?: string,
  detail?: Record<string, unknown>,
): void {
  getPool()
    .query(
      `INSERT INTO audit_logs (hackathon_id, user_id, action, target_id, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [hackathonId, userId, action, targetId ?? null, detail ? JSON.stringify(detail) : null],
    )
    .catch(() => {});
}
