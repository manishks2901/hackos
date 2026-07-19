import * as vscode from "vscode";
import type { Store } from "./store";

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval>;
  private online = true;

  constructor(private store: Store) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "hackathon.sync";
    this.timer = setInterval(() => this.render(), 30_000);
    store.onDidChange(() => this.render());
    this.render();
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.render();
  }

  private render(): void {
    const cache = this.store.cache;
    if (!cache) {
      this.item.hide();
      return;
    }
    const dot = this.online ? "$(pass-filled)" : "$(circle-slash)";
    const next = cache.timeline
      .filter((t) => new Date(t.startsAt).getTime() > Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

    let deadline = "";
    if (next) {
      const ms = new Date(next.startsAt).getTime() - Date.now();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      deadline = ` · $(clock) ${next.title} in ${h > 0 ? `${h}h ` : ""}${m}m`;
    }

    this.item.text = `${dot} ${cache.event.name}${deadline}`;
    this.item.tooltip = this.online
      ? `HackOS connected · last sync ${cache.lastSyncAt ? new Date(cache.lastSyncAt).toLocaleTimeString() : "never"} · click to sync`
      : "HackOS offline — showing cached content · click to retry";
    this.item.show();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.item.dispose();
  }
}
