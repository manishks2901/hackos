import * as vscode from "vscode";
import type { Announcement } from "./types";
import { toPetNotification, type PetNotification } from "./pet/petClassify";

// Session-scoped dedupe: realtime and polling can both report the same
// announcement; whoever gets there first notifies, the other is a no-op.
const seen = new Set<string>();

// The pet is the primary messenger; a native toast is the fallback until the
// pet view is wired up during activation.
let deliver: ((n: PetNotification) => void) | undefined;
export function setPet(fn: (n: PetNotification) => void): void {
  deliver = fn;
}

export function markSeen(ids: string[]): void {
  for (const id of ids) seen.add(id);
}

export function notifyAnnouncement(a: Announcement): void {
  if (seen.has(a.id)) return;
  seen.add(a.id);

  if (deliver) {
    deliver(toPetNotification(a));
    return;
  }

  // Fallback: classic VS Code toast.
  const emoji: Record<string, string> = {
    deadline: "⏰",
    schedule: "📅",
    food: "🍕",
    workshop: "🛠",
    prize: "🏆",
    tech: "🔌",
  };
  const icon = a.priority === "high" ? "⚡" : (emoji[a.category ?? ""] ?? "📣");
  if (a.priority === "high") {
    vscode.window.showWarningMessage(`${icon} ${a.title} — ${a.body}`);
  } else {
    vscode.window.showInformationMessage(`${icon} ${a.title}`);
  }
}
