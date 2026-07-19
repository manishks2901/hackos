import * as vscode from "vscode";
import WebSocket from "ws";
import type { Store } from "./store";
import type { SyncEngine } from "./sync";
import type { Announcement } from "./types";
import { notifyAnnouncement } from "./notify";
import { gatewayUrl } from "./config";

interface Envelope {
  hackathonId: string;
  event: { type: string; payload: unknown };
  ts: string;
}

/**
 * Live channel to the gateway. Purely an enhancement: every reconnect runs a
 * full sync (replaying anything missed), and polling stays on as the fallback.
 */
export class RealtimeClient {
  private ws: WebSocket | undefined;
  private backoffMs = 1000;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private _onDidChangeState = new vscode.EventEmitter<boolean>();
  readonly onDidChangeState = this._onDidChangeState.event;

  private _onChatMessage = new vscode.EventEmitter<unknown>();
  readonly onChatMessage = this._onChatMessage.event;

  constructor(
    private secrets: vscode.SecretStorage,
    private store: Store,
    private sync: SyncEngine,
  ) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = undefined;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const event = this.store.event;
    const token = await this.secrets.get("hackos.accessToken");
    if (!event || !token) return;

    const ws = new WebSocket(
      `${gatewayUrl()}/?token=${encodeURIComponent(token)}&hackathon=${event.id}`,
    );
    this.ws = ws;

    ws.on("open", () => {
      this.backoffMs = 1000;
      this._onDidChangeState.fire(true);
      // Replay anything published while we were disconnected.
      void this.sync.sync({ silent: true });
    });

    ws.on("message", (raw) => {
      try {
        this.handle(JSON.parse(String(raw)) as Envelope);
      } catch {
        /* malformed frame: ignore, polling will reconcile */
      }
    });

    const retry = () => {
      if (this.stopped) return;
      this._onDidChangeState.fire(false);
      this.reconnectTimer = setTimeout(() => void this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    };
    ws.on("close", retry);
    ws.on("error", () => ws.close());
  }

  private handle(envelope: Envelope): void {
    const { event } = envelope;
    if (event.type === "connected") return;

    if (event.type === "chat.message") {
      this._onChatMessage.fire(event.payload);
      return; // chat doesn't touch the content cache
    }
    if (event.type === "announcement.created") {
      notifyAnnouncement(event.payload as Announcement);
    }
    // Any content event: pull fresh state (cheap, and keeps one code path for updates).
    void this.sync.sync({ silent: true });
  }

  dispose(): void {
    this.stop();
  }
}
