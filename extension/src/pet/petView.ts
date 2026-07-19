import * as vscode from "vscode";
import type { PetNotification } from "./petClassify";
import { PetHistory, type HistoryEntry } from "./petHistory";

type Reaction =
  | "typingFast" | "buildOk" | "buildFail" | "testOk" | "testFail"
  | "commit" | "debugStart" | "debugEnd" | "inactive" | "active";

/**
 * Extension-host side of the pet. Owns the webview view, bridges organizer
 * notifications + IDE events into it, persists history, and services the
 * pet's right-click menu. All heavy animation lives in the webview (media/pet).
 */
export class PetViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "hackos.pet";

  private view: vscode.WebviewView | undefined;
  private ready = false;
  private readonly pending: unknown[] = []; // messages queued until the webview is ready

  private readonly _onDidNotify = new vscode.EventEmitter<PetNotification>();
  /** Fires for every delivered notification (drives the global status-bar layer). */
  readonly onDidNotify = this._onDidNotify.event;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly history: PetHistory,
  ) {}

  // ---------------------------------------------------------------- lifecycle
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media", "pet")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((m: { type: string; [k: string]: unknown }) =>
      this.onMessage(m),
    );
    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }

  // ---------------------------------------------------------------- outbound
  private post(msg: unknown): void {
    if (this.ready && this.view) this.view.webview.postMessage(msg);
    else this.pending.push(msg);
  }

  /** Deliver an organizer notification (the pet becomes the messenger). */
  notify(note: PetNotification): void {
    void this.history.add(note);
    this.post({ type: "notify", note });
    this._onDidNotify.fire(note);
  }

  /** Fire a smart IDE reaction (build passed, commit, fast typing…). */
  react(key: Reaction): void {
    this.post({ type: "react", key });
  }

  /** Play every activity once — an on-demand showcase. */
  parade(): void {
    this.post({ type: "demo" });
  }

  private pushSettings(): void {
    const cfg = vscode.workspace.getConfiguration("hackos.pet");
    this.post({
      type: "settings",
      settings: {
        petType: cfg.get<string>("type", "fox"),
        reducedMotion: cfg.get<boolean>("reducedMotion", false),
        muted: this.ctx.globalState.get<boolean>("hackos.pet.muted", false),
      },
    });
  }

  // ---------------------------------------------------------------- inbound
  private async onMessage(m: { type: string; [k: string]: unknown }): Promise<void> {
    switch (m.type) {
      case "ready":
        this.ready = true;
        this.pushSettings();
        while (this.pending.length) this.view?.webview.postMessage(this.pending.shift());
        break;
      case "ack":
        if (typeof m.id === "string") await this.history.markRead(m.id);
        break;
      case "logHistory":
        // history is already added in notify(); this is a no-op guard for
        // notifications that originate inside the webview (none today).
        break;
      case "restPosition":
        if (typeof m.x === "number") {
          await this.ctx.globalState.update("hackos.pet.restX", m.x);
        }
        break;
      case "menu":
        await this.handleMenu(String(m.action));
        break;
    }
  }

  private async handleMenu(action: string): Promise<void> {
    switch (action) {
      case "history":
        await this.showHistory();
        break;
      case "mute": {
        const cur = this.ctx.globalState.get<boolean>("hackos.pet.muted", false);
        await this.ctx.globalState.update("hackos.pet.muted", !cur);
        this.pushSettings();
        vscode.window.setStatusBarMessage(
          `HackOS pet: notifications ${!cur ? "muted" : "unmuted"}`,
          2500,
        );
        break;
      }
      case "changePet": {
        const opts = ["fox", "cat", "duck", "slime"];
        const picked = await vscode.window.showQuickPick(opts, { placeHolder: "Choose your pet" });
        if (picked) {
          await vscode.workspace
            .getConfiguration("hackos.pet")
            .update("type", picked, vscode.ConfigurationTarget.Global);
          this.pushSettings();
        }
        break;
      }
      case "settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "hackos.pet");
        break;
      case "about":
        vscode.window.showInformationMessage(
          "HackOS Pet 🦊 — your hackathon teammate on the status panel. It delivers organizer announcements and reacts to your coding, without ever interrupting you.",
        );
        break;
    }
  }

  /** Notification History panel: searchable QuickPick with filter + actions. */
  async showHistory(): Promise<void> {
    const entries = this.history.all();
    if (entries.length === 0) {
      vscode.window.showInformationMessage("HackOS pet: no announcements yet.");
      return;
    }
    type Item = vscode.QuickPickItem & { entry?: HistoryEntry; cmd?: "clear" | "markAll" };
    const icon: Record<string, string> = {
      critical: "🚨", important: "⚡", winner: "🎉", normal: "📢",
    };
    const toItems = (): Item[] => {
      const rows: Item[] = this.history.all().map((e) => ({
        label: `${e.read ? "$(check)" : "$(circle-filled)"} ${icon[e.priority] ?? "📢"} ${e.title}`,
        description: new Date(e.timestamp).toLocaleString(),
        detail: e.body,
        entry: e,
      }));
      rows.push(
        { label: "", kind: vscode.QuickPickItemKind.Separator } as Item,
        { label: "$(check-all) Mark all as read", cmd: "markAll" },
        { label: "$(trash) Clear history", cmd: "clear" },
      );
      return rows;
    };

    const qp = vscode.window.createQuickPick<Item>();
    qp.title = "HackOS — Announcement History";
    qp.placeholder = "Search announcements…";
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.items = toItems();
    qp.onDidAccept(async () => {
      const sel = qp.selectedItems[0];
      if (!sel) return;
      if (sel.cmd === "clear") {
        await this.history.clear();
        qp.hide();
        return;
      }
      if (sel.cmd === "markAll") {
        await this.history.markAllRead();
        qp.items = toItems();
        return;
      }
      if (sel.entry) {
        await this.history.markRead(sel.entry.id);
        qp.items = toItems();
      }
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  }

  // ---------------------------------------------------------------- html
  private html(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const base = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "pet");
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "pet.css"));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "pet.js"));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>HackOS Pet</title>
</head>
<body>
  <canvas id="stage" aria-label="HackOS pet companion"></canvas>
  <div id="tip" role="status"></div>
  <div id="bubble" role="alert" aria-live="polite"></div>
  <div id="menu" role="menu">
    <button data-action="pause">⏸ Pause pet</button>
    <button data-action="changePet">🐾 Change pet</button>
    <button data-action="history">🕘 Notification history</button>
    <button data-action="mute">🔕 Mute notifications</button>
    <hr />
    <button data-action="settings">⚙ Settings</button>
    <button data-action="about">ℹ About</button>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
