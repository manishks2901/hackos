import * as vscode from "vscode";
import type { ApiClient } from "./api";
import type { Store } from "./store";
import type {
  Announcement,
  Mentor,
  Resource,
  Sponsor,
  Submission,
  Team,
  TimelineItem,
} from "./types";
import { markSeen, notifyAnnouncement } from "./notify";

export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | undefined;
  private firstSyncThisSession = true;
  private _onDidSync = new vscode.EventEmitter<{ ok: boolean }>();
  readonly onDidSync = this._onDidSync.event;

  constructor(
    private api: ApiClient,
    private store: Store,
  ) {}

  startPolling(intervalMs = 30_000): void {
    this.stopPolling();
    this.timer = setInterval(() => void this.sync({ silent: true }), intervalMs);
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async sync(opts: { silent?: boolean } = {}): Promise<boolean> {
    const cache = this.store.cache;
    if (!cache) return false;
    const { event } = cache;
    try {
      const [resources, announcements, timeline, teams, mentors, mySubmission, sponsors] =
        await Promise.all([
          this.api.request<Resource[]>(`/v1/hackathons/${event.id}/resources`),
          this.api.request<Announcement[]>(`/v1/hackathons/${event.id}/announcements`),
          this.api.request<TimelineItem[]>(`/v1/hackathons/${event.id}/timeline`),
          this.api.request<Team[]>(`/v1/hackathons/${event.id}/teams`),
          this.api.request<Mentor[]>(`/v1/hackathons/${event.id}/mentors`),
          this.api.request<Submission | null>(`/v1/hackathons/${event.id}/submissions/mine`),
          this.api.request<Sponsor[]>(`/v1/hackathons/${event.id}/sponsors`),
        ]);

      if (this.firstSyncThisSession) {
        // Never replay history as toasts — on join or on VS Code restart.
        markSeen(announcements.map((a) => a.id));
        this.firstSyncThisSession = false;
      } else {
        for (const a of [...announcements].reverse()) notifyAnnouncement(a);
      }

      await this.store.update({
        event,
        resources,
        announcements,
        timeline,
        teams,
        mentors,
        sponsors,
        mySubmission,
        // Fresh join: everything counts as read. Afterwards the list persists
        // across restarts, so only genuinely new announcements show as unread.
        readAnnouncements:
          cache.readAnnouncements ?? announcements.map((a) => a.id),
        lastSyncAt: new Date().toISOString(),
      });
      this._onDidSync.fire({ ok: true });
      return true;
    } catch (err) {
      // Offline or API down: keep serving the cache, stay quiet unless user-initiated.
      if (!opts.silent) {
        vscode.window.showWarningMessage(
          `HackOS sync failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      this._onDidSync.fire({ ok: false });
      return false;
    }
  }

  dispose(): void {
    this.stopPolling();
  }
}
