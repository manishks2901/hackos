import type { Announcement } from "../types";

/** Notification shape sent to the pet webview. */
export interface PetNotification {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "critical" | "winner";
  category?: string;
  timestamp: number;
  /** Epoch ms of a live countdown target (critical deadlines). */
  deadlineAt?: number;
}

/**
 * Map an organizer Announcement (2-level API priority) onto the pet's 4-level
 * severity using category + keyword heuristics, so a "high" deadline reads as
 * *critical* while a "high" venue change reads as *important*.
 */
export function toPetNotification(a: Announcement): PetNotification {
  const text = `${a.title} ${a.body}`.toLowerCase();
  let priority: PetNotification["priority"];
  let category = a.category;

  if (/\b(winner|winners|congrats|congratulations|1st place|first place|champion|you won)\b/.test(text)) {
    priority = "winner";
    category = "winner";
  } else if (/\b(emergency|evacuat|urgent|fire|medical)\b/.test(text)) {
    priority = "critical";
    category = "emergency";
  } else if (
    a.priority === "high" &&
    /\b(deadline|submission|submit|closing|closes|portal|final call|last call)\b/.test(text)
  ) {
    priority = "critical";
    category = category ?? "deadline";
  } else if (/\b\d{1,3}\s*min(ute)?s?\b.*\b(remain|left|to go|until)\b/.test(text)) {
    priority = "critical";
    category = category ?? "deadline";
  } else if (a.priority === "high") {
    priority = "important";
  } else {
    priority = "normal";
  }

  let deadlineAt: number | undefined;
  const m = text.match(/\b(\d{1,3})\s*min(ute)?s?\b/);
  if (m && priority === "critical") deadlineAt = Date.now() + Number(m[1]) * 60_000;

  return {
    id: a.id,
    title: a.title,
    body: a.body,
    priority,
    category,
    timestamp: new Date(a.createdAt).getTime() || Date.now(),
    deadlineAt,
  };
}
