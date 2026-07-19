import * as vscode from "vscode";
import type { PetNotification } from "./petClassify";

const KEY = "hackos.pet.history";
const MAX = 200;

export interface HistoryEntry extends PetNotification {
  read: boolean;
}

/**
 * Persistent notification history in globalState. Survives reloads so
 * participants can scroll back through every organizer announcement, search /
 * filter it, mark read, and clear it (spec: Notification History).
 */
export class PetHistory {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private state: vscode.Memento) {}

  all(): HistoryEntry[] {
    return this.state.get<HistoryEntry[]>(KEY, []);
  }

  get unreadCount(): number {
    return this.all().filter((e) => !e.read).length;
  }

  async add(note: PetNotification): Promise<void> {
    const list = this.all();
    if (list.some((e) => e.id === note.id)) return; // dedupe
    list.unshift({ ...note, read: false });
    await this.state.update(KEY, list.slice(0, MAX));
    this._onDidChange.fire();
  }

  async markRead(id: string): Promise<void> {
    const list = this.all().map((e) => (e.id === id ? { ...e, read: true } : e));
    await this.state.update(KEY, list);
    this._onDidChange.fire();
  }

  async markAllRead(): Promise<void> {
    await this.state.update(KEY, this.all().map((e) => ({ ...e, read: true })));
    this._onDidChange.fire();
  }

  async clear(): Promise<void> {
    await this.state.update(KEY, []);
    this._onDidChange.fire();
  }
}
