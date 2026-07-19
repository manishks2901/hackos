import * as vscode from "vscode";
import type { ApiClient } from "./api";
import type { Store } from "./store";
import { aiUrl } from "./config";

interface Citation {
  marker: number;
  resourceId: string;
  title: string;
  section: string | null;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "hackos.chat";

  constructor(
    private context: vscode.ExtensionContext,
    private api: ApiClient,
    private store: Store,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
      if (msg.type === "ask" && typeof msg.question === "string") {
        await this.ask(view, msg.question);
      }
      if (msg.type === "openResource" && typeof msg.resourceId === "string") {
        await vscode.commands.executeCommand("hackathon.openResource", msg.resourceId);
      }
    });
  }

  private async ask(view: vscode.WebviewView, question: string): Promise<void> {
    const event = this.store.event;
    if (!event) {
      view.webview.postMessage({ type: "error", message: "Join a hackathon first." });
      return;
    }
    try {
      const token = await this.context.secrets.get("hackos.accessToken");
      const res = await fetch(`${aiUrl()}/v1/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ hackathonId: event.id, question }),
      });
      const data = (await res.json()) as {
        answer?: string;
        citations?: Citation[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
      view.webview.postMessage({ type: "answer", answer: data.answer, citations: data.citations });
    } catch (err) {
      view.webview.postMessage({
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
    --accent-soft: rgba(124, 108, 255, 0.10);
    --accent-border: rgba(124, 108, 255, 0.28);
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  #log { flex: 1; overflow-y: auto; padding: 12px 12px 4px; }

  /* ---- empty state ---- */
  #empty { padding: 8px 4px 0; }
  #empty .hero {
    display: flex; align-items: center; gap: 8px;
    font-weight: 600; margin-bottom: 6px;
  }
  #empty .spark {
    width: 22px; height: 22px; border-radius: 7px; flex: none;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #8f7bff, #5b46f0);
    color: #fff; font-size: 12px;
  }
  #empty p { opacity: 0.65; line-height: 1.55; margin-bottom: 14px; }
  .chips { display: flex; flex-direction: column; gap: 6px; }
  .chip {
    text-align: left;
    font-family: inherit; font-size: 12.5px;
    color: var(--vscode-foreground);
    background: var(--accent-soft);
    border: 1px solid var(--accent-border);
    border-radius: 10px;
    padding: 8px 11px;
    cursor: pointer;
    transition: transform 140ms var(--ease-out), background 150ms ease;
  }
  .chip:hover { background: rgba(124, 108, 255, 0.18); }
  .chip:active { transform: scale(0.98); }

  /* ---- messages ---- */
  .msg {
    margin-bottom: 12px;
    opacity: 0; transform: translateY(6px);
    animation: rise 280ms var(--ease-out) forwards;
  }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }
  .meta {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; margin-bottom: 4px;
  }
  .meta .dot { width: 6px; height: 6px; border-radius: 50%; }
  .msg.q .meta .dot { background: var(--vscode-descriptionForeground); }
  .msg.a .meta .dot { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .meta .who { opacity: 0.75; }
  .bubble {
    border-radius: 10px;
    padding: 9px 12px;
    line-height: 1.6;
    word-wrap: break-word;
  }
  .msg.q .bubble {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-widget-border, transparent);
  }
  .msg.a .bubble {
    background: var(--accent-soft);
    border: 1px solid var(--accent-border);
  }
  .bubble code {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    background: rgba(128, 128, 128, 0.18);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .bubble .cm { /* [n] citation marker */
    font-size: 10.5px; font-weight: 700;
    color: var(--accent);
    vertical-align: super;
  }
  .bubble ul { padding-left: 18px; margin: 4px 0; }
  .err .bubble {
    border-color: rgba(255, 122, 112, 0.4);
    background: rgba(255, 122, 112, 0.08);
    color: var(--vscode-errorForeground);
  }

  .cites { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
  .cite {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 7px;
    background: rgba(124, 108, 255, 0.15);
    border: 1px solid var(--accent-border);
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: transform 120ms var(--ease-out), background 150ms ease;
  }
  .cite:hover { background: rgba(124, 108, 255, 0.25); }
  .cite:active { transform: scale(0.96); }
  .cite .n { color: var(--accent); font-weight: 700; }

  /* thinking indicator */
  .dots { display: inline-flex; gap: 4px; padding: 2px 0; }
  .dots span {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.15s; }
  .dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }

  /* ---- input ---- */
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
    font-family: inherit; font-size: 13px;
    outline: none;
    transition: border-color 150ms ease;
  }
  #input:focus { border-color: var(--accent); }
  #send {
    background: linear-gradient(180deg, #8f7bff, #6d59f5);
    color: #fff; border: none; border-radius: 9px;
    padding: 0 14px; cursor: pointer; font-weight: 600;
    transition: transform 140ms var(--ease-out), filter 150ms ease;
  }
  #send:hover { filter: brightness(1.08); }
  #send:active { transform: scale(0.96); }
  #send:disabled { opacity: 0.5; cursor: default; }

  @media (prefers-reduced-motion: reduce) {
    .msg { animation: none; opacity: 1; transform: none; }
    .dots span { animation: none; opacity: 0.7; }
  }
</style>
</head>
<body>
  <div id="log">
    <div id="empty">
      <div class="hero"><span class="spark">◆</span> Event assistant</div>
      <p>Answers come from this event's official docs, with citations — or it says it doesn't know.</p>
      <div class="chips">
        <button class="chip">What's the submission deadline?</button>
        <button class="chip">Can I use pre-built libraries?</button>
        <button class="chip">Which sponsor APIs are available?</button>
        <button class="chip">How is judging scored?</button>
      </div>
    </div>
  </div>
  <div id="bar">
    <input id="input" placeholder="Ask about rules, deadlines, APIs…" />
    <button id="send">Ask</button>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  let thinking = null;

  function esc(s) { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  // markdown-lite: bold, inline code, [n] markers, bullet lists, line breaks
  function md(s) {
    let h = esc(s);
    h = h.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
    h = h.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
    h = h.replace(/\\[(\\d+)\\]/g, '<span class="cm">[$1]</span>');
    const lines = h.split("\\n");
    let out = "", inList = false;
    for (const line of lines) {
      const m = line.match(/^\\s*[-•]\\s+(.*)/);
      if (m) {
        if (!inList) { out += "<ul>"; inList = true; }
        out += "<li>" + m[1] + "</li>";
      } else {
        if (inList) { out += "</ul>"; inList = false; }
        out += line + "<br>";
      }
    }
    if (inList) out += "</ul>";
    return out.replace(/(<br>)+$/, "");
  }

  function addMsg(cls, who, html) {
    const div = document.createElement("div");
    div.className = "msg " + cls;
    div.innerHTML =
      '<div class="meta"><span class="dot"></span><span class="who">' + who + "</span></div>" +
      '<div class="bubble">' + html + "</div>";
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function ask(q) {
    if (!q || thinking) return;
    document.getElementById("empty")?.remove();
    addMsg("q", "You", md(q));
    input.value = "";
    send.disabled = true;
    thinking = addMsg("a", "HackOS", '<span class="dots"><span></span><span></span><span></span></span>');
    vscode.postMessage({ type: "ask", question: q });
  }

  send.addEventListener("click", () => ask(input.value.trim()));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value.trim()); });
  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => ask(c.textContent.trim())));

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (thinking) { thinking.remove(); thinking = null; }
    send.disabled = false;
    if (msg.type === "answer") {
      const div = addMsg("a", "HackOS", md(msg.answer));
      if (msg.citations && msg.citations.length) {
        const cites = document.createElement("div");
        cites.className = "cites";
        for (const c of msg.citations) {
          const b = document.createElement("button");
          b.className = "cite";
          b.innerHTML = '<span class="n">[' + c.marker + "]</span>" +
            esc(c.title + (c.section ? " › " + c.section : ""));
          b.addEventListener("click", () =>
            vscode.postMessage({ type: "openResource", resourceId: c.resourceId }));
          cites.appendChild(b);
        }
        div.querySelector(".bubble").appendChild(cites);
      }
      log.scrollTop = log.scrollHeight;
    }
    if (msg.type === "error") addMsg("a err", "HackOS", esc(msg.message));
  });
</script>
</body>
</html>`;
  }
}
