import * as vscode from "vscode";
import type { ApiClient } from "./api";
import type { Store } from "./store";

export interface ChatMessage {
  id: string;
  teamId: string | null;
  body: string;
  createdAt: string;
  userName: string;
  userRole: string;
}

export class TeamChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "hackos.teamchat";
  private view: vscode.WebviewView | undefined;
  private channelTeamId: string | null = null; // null = community

  constructor(
    private api: ApiClient,
    private store: Store,
  ) {}

  /** Called by the realtime client when a chat.message event arrives. */
  deliver(message: ChatMessage): void {
    if ((message.teamId ?? null) === this.channelTeamId) {
      this.view?.webview.postMessage({ type: "message", message });
    }
  }

  async setTeamChannel(teamId: string | null): Promise<void> {
    this.channelTeamId = teamId;
    await this.loadHistory();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
      if (msg.type === "ready") await this.loadHistory();
      if (msg.type === "send" && typeof msg.body === "string") await this.send(msg.body);
      if (msg.type === "channel") {
        this.channelTeamId = msg.teamId ? String(msg.teamId) : null;
        await this.loadHistory();
      }
    });
  }

  private async myTeam(): Promise<{ id: string; name: string } | undefined> {
    const event = this.store.event;
    if (!event) return undefined;
    try {
      const teams = await this.api.request<Array<{ id: string; name: string; isMine: boolean }>>(
        `/v1/hackathons/${event.id}/teams`,
      );
      return teams.find((t) => t.isMine);
    } catch {
      return undefined;
    }
  }

  private async loadHistory(): Promise<void> {
    const event = this.store.event;
    if (!event || !this.view) return;
    const team = await this.myTeam();
    try {
      const query = this.channelTeamId ? `?teamId=${this.channelTeamId}` : "";
      const messages = await this.api.request<ChatMessage[]>(
        `/v1/hackathons/${event.id}/messages${query}`,
      );
      this.view.webview.postMessage({
        type: "history",
        messages,
        team: team ? { id: team.id, name: team.name } : null,
        activeTeamId: this.channelTeamId,
      });
    } catch (err) {
      this.view.webview.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async send(body: string): Promise<void> {
    const event = this.store.event;
    if (!event) return;
    try {
      await this.api.request(`/v1/hackathons/${event.id}/messages`, {
        method: "POST",
        body: { body, teamId: this.channelTeamId },
      });
      // Delivery comes back through the realtime channel (single source of truth).
    } catch (err) {
      this.view?.webview.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private html(): string {
    return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root {
    --accent: #7c6cff;
    --accent-border: rgba(124, 108, 255, 0.28);
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    font-size: 13px;
    display: flex; flex-direction: column; height: 100vh;
  }
  #channels {
    display: flex; gap: 5px;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
  }
  .ch {
    font-family: inherit; font-size: 11.5px; font-weight: 600;
    padding: 4px 12px; border-radius: 999px; cursor: pointer;
    background: transparent; color: var(--vscode-foreground); opacity: 0.55;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
    transition: opacity 150ms ease, border-color 150ms ease, transform 140ms var(--ease-out);
  }
  .ch:active { transform: scale(0.96); }
  .ch.active {
    opacity: 1;
    border-color: var(--accent-border);
    background: rgba(124, 108, 255, 0.12);
    color: var(--vscode-foreground);
  }
  #log { flex: 1; overflow-y: auto; padding: 12px; }

  .empty { opacity: 0.55; line-height: 1.6; padding: 8px 4px; }

  .m {
    display: flex; gap: 9px;
    margin-bottom: 3px;
    opacity: 0; transform: translateY(5px);
    animation: rise 240ms var(--ease-out) forwards;
  }
  .m.first { margin-top: 12px; }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }
  .av {
    width: 26px; height: 26px; border-radius: 8px; flex: none;
    display: grid; place-items: center;
    font-size: 11px; font-weight: 700; color: #fff;
    margin-top: 2px;
  }
  .av.ghost { visibility: hidden; height: 0; margin: 0; }
  .mbody { flex: 1; min-width: 0; }
  .mhead { display: flex; align-items: baseline; gap: 7px; margin-bottom: 1px; }
  .who { font-weight: 600; font-size: 12.5px; }
  .role {
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 1px 6px; border-radius: 5px;
  }
  .role.mentor { color: #3ecf8e; background: rgba(62,207,142,0.12); border: 1px solid rgba(62,207,142,0.35); }
  .role.organizer { color: #f5b944; background: rgba(245,185,68,0.12); border: 1px solid rgba(245,185,68,0.35); }
  .when { opacity: 0.4; font-size: 10.5px; }
  .text { line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }
  .err { color: var(--vscode-errorForeground); padding: 6px 4px; font-size: 12px; }

  #bar {
    display: flex; gap: 6px;
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
  }
  #input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 9px;
    padding: 8px 11px;
    font-family: inherit; font-size: 13px; outline: none;
    transition: border-color 150ms ease;
  }
  #input:focus { border-color: var(--accent); }
  #send {
    background: linear-gradient(180deg, #8f7bff, #6d59f5);
    color: #fff; border: none; border-radius: 9px;
    padding: 0 13px; cursor: pointer; font-weight: 600;
    transition: transform 140ms var(--ease-out), filter 150ms ease;
  }
  #send:hover { filter: brightness(1.08); }
  #send:active { transform: scale(0.96); }

  @media (prefers-reduced-motion: reduce) {
    .m { animation: none; opacity: 1; transform: none; }
  }
</style>
</head>
<body>
  <div id="channels">
    <button class="ch active" id="ch-community"># community</button>
    <button class="ch" id="ch-team" style="display:none"># team</button>
  </div>
  <div id="log"><div class="empty">Say hi to everyone at the event 👋<br>Mentors and organizers are here too.</div></div>
  <div id="bar">
    <input id="input" placeholder="Message # community" />
    <button id="send">Send</button>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const chCommunity = document.getElementById("ch-community");
  const chTeam = document.getElementById("ch-team");
  let myTeam = null;
  let lastSender = null;
  let lastAt = 0;

  const AV_COLORS = ["#7c6cff","#3ecf8e","#f5b944","#ff7a70","#4cc2ff","#e879f9","#a3e635","#fb923c"];
  function avColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }
  function initials(name) {
    return name.split(/\\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
  function esc(s) { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  function render(m) {
    const t = new Date(m.createdAt).getTime();
    // group consecutive messages from the same sender within 5 minutes
    const grouped = m.userName === lastSender && t - lastAt < 5 * 60 * 1000;
    lastSender = m.userName; lastAt = t;

    const div = document.createElement("div");
    div.className = "m" + (grouped ? "" : " first");
    const when = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const role = m.userRole !== "participant"
      ? '<span class="role ' + m.userRole + '">' + m.userRole + "</span>" : "";
    div.innerHTML =
      '<div class="av' + (grouped ? " ghost" : "") + '" style="background:' + avColor(m.userName) + '">' +
        initials(m.userName) + "</div>" +
      '<div class="mbody">' +
        (grouped ? "" :
          '<div class="mhead"><span class="who">' + esc(m.userName) + "</span>" + role +
          '<span class="when">' + when + "</span></div>") +
        '<div class="text">' + esc(m.body) + "</div>" +
      "</div>";
    log.appendChild(div);
  }

  function setActive(teamMode) {
    chCommunity.classList.toggle("active", !teamMode);
    chTeam.classList.toggle("active", teamMode);
    input.placeholder = teamMode && myTeam ? "Message # " + myTeam.name : "Message # community";
  }

  chCommunity.addEventListener("click", () => {
    setActive(false);
    vscode.postMessage({ type: "channel", teamId: null });
  });
  chTeam.addEventListener("click", () => {
    if (!myTeam) return;
    setActive(true);
    vscode.postMessage({ type: "channel", teamId: myTeam.id });
  });

  function send() {
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    vscode.postMessage({ type: "send", body });
  }
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "history") {
      myTeam = msg.team;
      chTeam.style.display = myTeam ? "" : "none";
      if (myTeam) chTeam.textContent = "# " + myTeam.name;
      setActive(!!msg.activeTeamId);
      log.innerHTML = "";
      lastSender = null; lastAt = 0;
      if (!msg.messages.length) {
        log.innerHTML = '<div class="empty">No messages yet — start the conversation.</div>';
      }
      for (const m of msg.messages) render(m);
      log.scrollTop = log.scrollHeight;
    }
    if (msg.type === "message") {
      document.querySelector(".empty")?.remove();
      render(msg.message);
      log.scrollTop = log.scrollHeight;
    }
    if (msg.type === "error") {
      const div = document.createElement("div");
      div.className = "err";
      div.textContent = "⚠ " + msg.message;
      log.appendChild(div);
    }
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
  }
}
