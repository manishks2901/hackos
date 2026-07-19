import { getPool } from "@hackos/db";

export interface BroadcastJob {
  hackathonId: string;
  announcementId: string;
}

interface Integration {
  id: string;
  kind: "discord" | "telegram";
  config: { webhookUrl?: string; chatId?: string };
}

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const CATEGORY_EMOJI: Record<string, string> = {
  general: "📣",
  deadline: "⏰",
  schedule: "📅",
  food: "🍕",
  workshop: "🛠",
  prize: "🏆",
  tech: "🔌",
};

async function sendDiscord(
  integration: Integration,
  a: {
    title: string;
    body: string;
    priority: string;
    category: string;
    hackathon_id: string;
    sponsor_name: string | null;
  },
): Promise<void> {
  if (!integration.config.webhookUrl) throw new PermanentError("no webhookUrl configured");
  const res = await fetch(integration.config.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `${a.priority === "high" ? "⚡ " : `${CATEGORY_EMOJI[a.category] ?? "📣"} `}${a.title}`,
          description: a.body,
          color: a.priority === "high" ? 0xf5b944 : 0x7c6cff,
          footer: {
            text: a.sponsor_name
              ? `Sponsored · ${a.sponsor_name} — via HackOS`
              : "HackOS announcement",
          },
          url: `${WEB_URL}/dashboard/${a.hackathon_id}`,
        },
      ],
    }),
  });
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new PermanentError(`discord webhook rejected (${res.status})`);
  }
  if (!res.ok) throw new Error(`discord returned ${res.status}`);
}

async function sendTelegram(
  integration: Integration,
  a: {
    title: string;
    body: string;
    priority: string;
    category: string;
    hackathon_id: string;
    sponsor_name: string | null;
  },
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new PermanentError("TELEGRAM_BOT_TOKEN not set on the platform");
  if (!integration.config.chatId) throw new PermanentError("no chatId configured");
  const emoji = CATEGORY_EMOJI[a.category] ?? "📣";
  const prefix = a.priority === "high" ? "⚡ <b>HIGH PRIORITY</b>\n" : "";
  const footer = a.sponsor_name ? `<i>Sponsored · ${a.sponsor_name} — via HackOS</i>` : "<i>via HackOS</i>";
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: integration.config.chatId,
      parse_mode: "HTML",
      text: `${prefix}${emoji} <b>${a.title}</b>\n\n${a.body}\n\n${footer}`,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new PermanentError(`telegram rejected: ${data.description ?? res.status}`);
  }
  if (!res.ok || !data.ok) throw new Error(`telegram returned ${res.status}`);
}

class PermanentError extends Error {}

/** Fan one announcement out to every active integration; logs every delivery. */
export async function runBroadcast({ hackathonId, announcementId }: BroadcastJob): Promise<string> {
  const pool = getPool();
  const { rows: announcements } = await pool.query(
    `SELECT a.id, a.hackathon_id, a.title, a.body, a.priority, a.category, s.name AS sponsor_name
     FROM announcements a LEFT JOIN sponsors s ON s.id = a.sponsor_id
     WHERE a.id = $1 AND a.hackathon_id = $2`,
    [announcementId, hackathonId],
  );
  const announcement = announcements[0];
  if (!announcement) return "announcement gone (retracted)";

  const { rows: integrations } = await pool.query<Integration>(
    "SELECT id, kind, config FROM integrations WHERE hackathon_id = $1 AND status = 'active'",
    [hackathonId],
  );
  if (integrations.length === 0) return "no active integrations";

  const results: string[] = [];
  for (const integration of integrations) {
    try {
      if (integration.kind === "discord") await sendDiscord(integration, announcement);
      else await sendTelegram(integration, announcement);
      await pool.query(
        `INSERT INTO integration_deliveries (integration_id, announcement_id, status)
         VALUES ($1, $2, 'sent')`,
        [integration.id, announcementId],
      );
      results.push(`${integration.kind}:sent`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await pool.query(
        `INSERT INTO integration_deliveries (integration_id, announcement_id, status, error)
         VALUES ($1, $2, 'failed', $3)`,
        [integration.id, announcementId, message],
      );
      if (err instanceof PermanentError) {
        // Bot kicked / bad config: surface on the dashboard, stop retrying this channel.
        await pool.query("UPDATE integrations SET status = 'broken' WHERE id = $1", [
          integration.id,
        ]);
        results.push(`${integration.kind}:broken(${message})`);
      } else {
        results.push(`${integration.kind}:failed(${message})`);
      }
    }
  }
  return results.join(", ");
}
