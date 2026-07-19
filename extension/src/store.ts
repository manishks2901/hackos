import * as vscode from "vscode";
import type { EventCache, EventInfo } from "./types";

const KEY = "hackos.cache";

/** Offline-first cache in globalState — the tree renders from here, never from the network. */
export class Store {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private state: vscode.Memento) {}

  get cache(): EventCache | undefined {
    return this.state.get<EventCache>(KEY);
  }

  get event(): EventInfo | undefined {
    return this.cache?.event;
  }

  async setEvent(event: EventInfo): Promise<void> {
    await this.state.update(KEY, {
      event,
      resources: [],
      announcements: [],
      timeline: [],
      lastSyncAt: null,
    } satisfies EventCache);
    this._onDidChange.fire();
  }

  async update(cache: EventCache): Promise<void> {
    await this.state.update(KEY, cache);
    this._onDidChange.fire();
  }

  async clear(): Promise<void> {
    await this.state.update(KEY, undefined);
    this._onDidChange.fire();
  }

  get unreadAnnouncements(): number {
    const cache = this.cache;
    if (!cache) return 0;
    const read = new Set(cache.readAnnouncements ?? []);
    return cache.announcements.filter((a) => !read.has(a.id)).length;
  }

  isAnnouncementRead(id: string): boolean {
    return (this.cache?.readAnnouncements ?? []).includes(id);
  }

  async markAnnouncementRead(id: string): Promise<void> {
    const cache = this.cache;
    if (!cache || cache.readAnnouncements?.includes(id)) return;
    await this.update({
      ...cache,
      readAnnouncements: [...(cache.readAnnouncements ?? []), id],
    });
  }
}
