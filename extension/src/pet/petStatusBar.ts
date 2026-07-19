import * as vscode from "vscode";
import type { PetNotification } from "./petClassify";
import type { PetHistory } from "./petHistory";

const CAT_ICON: Record<string, string> = {
  deadline: "⏰", schedule: "📅", food: "🍕", workshop: "📚", prize: "🏆",
  tech: "🔌", venue: "📍", rules: "📋", emergency: "🚨", winner: "🎉",
};
const PET_GLYPH: Record<string, string> = { fox: "🦊", cat: "🐱", duck: "🦆", slime: "🟣" };

/**
 * The pet's ALWAYS-VISIBLE presence. A webview only exists while its panel is
 * open, but the status bar is global — so this item is the pet's global layer:
 * a little companion that's always on screen, badges unread announcements, and
 * surfaces critical alerts (with a live countdown) even when the panel is shut.
 * Clicking it opens the full sprite playground.
 */
export class PetStatusBar {
  private item: vscode.StatusBarItem;
  private idleTimer: ReturnType<typeof setInterval>;
  private alertTimer: ReturnType<typeof setInterval> | undefined;
  private alert: PetNotification | undefined;
  private frame = 0;

  private static readonly IDLE = ["", "", "", "✨", "", "", "💤", ""]; // occasional emote

  constructor(
    private readonly history: PetHistory,
    private petType: () => string,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "hackos.pet.focus"; // click → reveal the playground panel
    this.history.onDidChange(() => this.render());
    // gentle idle emote cycle — slow + cheap, never distracting
    this.idleTimer = setInterval(() => {
      this.frame = (this.frame + 1) % PetStatusBar.IDLE.length;
      if (!this.alert) this.render();
    }, 2500);
    this.render();
    this.item.show();
  }

  setPetType(): void {
    this.render();
  }

  /** An organizer announcement arrived — flash it globally on the status bar. */
  flash(note: PetNotification): void {
    if (note.priority === "critical" || note.priority === "important" || note.priority === "winner") {
      this.alert = note;
      if (this.alertTimer) clearInterval(this.alertTimer);
      // tick the countdown / hold the banner; auto-clear after a while
      const started = Date.now();
      const holdMs = note.priority === "critical" ? 60_000 : 12_000;
      this.alertTimer = setInterval(() => {
        if (Date.now() - started > holdMs) {
          this.clearAlert();
        } else {
          this.render();
        }
      }, 1000);
    }
    this.render();
  }

  private clearAlert(): void {
    if (this.alertTimer) clearInterval(this.alertTimer);
    this.alertTimer = undefined;
    this.alert = undefined;
    this.render();
  }

  private render(): void {
    const glyph = PET_GLYPH[this.petType()] ?? "🦊";
    const unread = this.history.unreadCount;

    if (this.alert) {
      const a = this.alert;
      const icon = a.priority === "critical" ? "🚨" : CAT_ICON[a.category ?? ""] ?? "📢";
      let text = `${icon} ${a.title}`;
      if (a.deadlineAt) {
        const remain = Math.max(0, a.deadlineAt - Date.now());
        const t = Math.floor(remain / 1000), m = Math.floor(t / 60), s = t % 60;
        text += `  ⏳ ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      this.item.text = text;
      this.item.backgroundColor = new vscode.ThemeColor(
        a.priority === "critical" ? "statusBarItem.errorBackground" : "statusBarItem.warningBackground",
      );
      this.item.tooltip = this.tooltip(a);
      return;
    }

    this.item.backgroundColor = undefined;
    const emote = PetStatusBar.IDLE[this.frame];
    this.item.text = unread > 0 ? `${glyph}${emote} $(bell) ${unread}` : `${glyph}${emote}`;
    this.item.tooltip = this.tooltip();
  }

  private tooltip(a?: PetNotification): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    if (a) {
      md.appendMarkdown(`**${CAT_ICON[a.category ?? ""] ?? "📢"} ${a.title}**\n\n${a.body}\n\n`);
    }
    const unread = this.history.unreadCount;
    md.appendMarkdown(`**HackOS Pet** — your hackathon teammate\n\n`);
    md.appendMarkdown(
      unread > 0
        ? `$(bell) ${unread} unread announcement${unread === 1 ? "" : "s"}\n\n`
        : `$(check) all caught up\n\n`,
    );
    md.appendMarkdown(
      `[$(window) Open the pet](command:hackos.pet.focus) · ` +
        `[$(history) History](command:hackos.pet.history)`,
    );
    return md;
  }

  dispose(): void {
    clearInterval(this.idleTimer);
    if (this.alertTimer) clearInterval(this.alertTimer);
    this.item.dispose();
  }
}
