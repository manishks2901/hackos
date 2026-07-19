import * as vscode from "vscode";
import type { Store } from "./store";

/** Tier ranking + presentation, richest first. Anything unknown sorts last as a "partner". */
const TIER_ORDER = ["platinum", "gold", "silver", "bronze", "partner"];

function tierRank(tier: string): number {
  const i = TIER_ORDER.indexOf(tier.toLowerCase());
  return i === -1 ? TIER_ORDER.length : i;
}

/**
 * The Sponsor Showcase webview. A webview (not a tree) is the right surface here:
 * only webviews can load remote logo images under a CSP, and only they can do the
 * crossfading "Sponsor Spotlight" ad. Renders entirely from `store.cache.sponsors`
 * (offline-first) and refreshes on `store.onDidChange` — never blocks on the network.
 */
export class SponsorsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "hackos.sponsors";
  private view: vscode.WebviewView | undefined;

  constructor(private store: Store) {
    // Live-refresh the cards whenever a sync lands new sponsor data.
    store.onDidChange(() => this.post());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg: { type: string; [k: string]: unknown }) => {
      if (msg.type === "ready") this.post();
      if (msg.type === "visit" && typeof msg.url === "string") {
        // Route through the shared command so opening a sponsor is auditable/testable.
        void vscode.commands.executeCommand("hackathon.openSponsor", msg.url);
      }
    });
  }

  /** Push the current cache to the view. Text/URLs stay raw here — the webview escapes them. */
  private post(): void {
    if (!this.view) return;
    const sponsors = [...(this.store.cache?.sponsors ?? [])].sort((a, b) => {
      const r = tierRank(a.tier) - tierRank(b.tier);
      return r !== 0 ? r : a.name.localeCompare(b.name);
    });
    this.view.webview.postMessage({ type: "sponsors", sponsors });
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    // Strict CSP: no default sources; logos only from https/data; styles+scripts by nonce.
    const csp = [
      "default-src 'none'",
      "img-src https: data:",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
  :root {
    --accent: #7c6cff;
    --accent-soft: rgba(124, 108, 255, 0.12);
    --accent-border: rgba(124, 108, 255, 0.28);
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    /* tier accents — mirror the landing palette (amber = gold), tasteful metallics */
    --t-platinum: #d6d8e0;
    --t-gold: #f5b944;
    --t-silver: #b7bcc7;
    --t-bronze: #cd8a56;
    --t-partner: #7c6cff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    font-size: 13px;
    padding: 12px 12px 16px;
  }

  /* ---- Sponsor Spotlight ad ---- */
  #spot {
    position: relative;
    height: 96px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--accent-border);
    background:
      radial-gradient(340px 140px at 20% -10%, var(--accent-soft), transparent 70%),
      var(--vscode-input-background, rgba(255,255,255,0.03));
    margin-bottom: 16px;
  }
  #spot.empty { display: none; }
  .spot-label {
    position: absolute; top: 8px; left: 12px;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--accent); opacity: 0.85;
    display: flex; align-items: center; gap: 5px;
  }
  .spot-label .pip {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 6px var(--accent);
    animation: blink 2.4s ease-in-out infinite;
  }
  @keyframes blink { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
  .slide {
    position: absolute; inset: 0;
    display: flex; align-items: center; gap: 12px;
    padding: 0 14px; padding-top: 12px;
    opacity: 0;
    transition: opacity 620ms var(--ease-out);
    pointer-events: none;
  }
  .slide.on { opacity: 1; pointer-events: auto; }
  .slide .logo { width: 46px; height: 46px; flex: none; }
  .slide .txt { min-width: 0; }
  .slide .nm { font-weight: 650; font-size: 14px; letter-spacing: -0.01em; }
  .slide .tg {
    font-size: 11.5px; color: var(--vscode-descriptionForeground);
    line-height: 1.4; margin-top: 2px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* ---- section headers per tier ---- */
  .tier-head {
    display: flex; align-items: center; gap: 8px;
    margin: 14px 2px 8px;
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .tier-head:first-of-type { margin-top: 2px; }
  .tier-head .rule { flex: 1; height: 1px; background: var(--vscode-widget-border, rgba(128,128,128,0.18)); }
  .tier-head .cnt { color: var(--vscode-descriptionForeground); font-weight: 600; letter-spacing: 0; }

  /* ---- sponsor cards ---- */
  .card {
    display: flex; align-items: center; gap: 11px;
    padding: 11px;
    border-radius: 12px;
    background: var(--vscode-input-background, rgba(255,255,255,0.03));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.16));
    margin-bottom: 8px;
    opacity: 0; transform: translateY(6px);
    animation: rise 300ms var(--ease-out) forwards;
    transition: border-color 160ms ease, transform 160ms var(--ease-out);
  }
  .card:hover { border-color: var(--accent-border); transform: translateY(-1px); }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }

  .logo {
    width: 44px; height: 44px; flex: none;
    border-radius: 11px;
    object-fit: cover;
    background: rgba(255,255,255,0.04);
    display: grid; place-items: center;
    font-weight: 800; font-size: 15px; color: #fff;
    letter-spacing: -0.02em;
    overflow: hidden;
  }
  .body { flex: 1; min-width: 0; }
  .row1 { display: flex; align-items: center; gap: 7px; }
  .name { font-weight: 600; font-size: 13.5px; letter-spacing: -0.01em; }
  .tier-badge {
    font-size: 9px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 999px; flex: none;
    border: 1px solid currentColor;
  }
  .tagline {
    font-size: 11.5px; color: var(--vscode-descriptionForeground);
    line-height: 1.45; margin-top: 2px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .visit {
    flex: none;
    background: linear-gradient(180deg, #8f7bff, #6d59f5);
    color: #fff; border: none; border-radius: 8px;
    padding: 6px 12px; cursor: pointer; font-weight: 600; font-size: 12px;
    font-family: inherit;
    transition: transform 140ms var(--ease-out), filter 150ms ease;
  }
  .visit:hover { filter: brightness(1.08); }
  .visit:active { transform: scale(0.95); }
  .visit:disabled { opacity: 0.4; cursor: default; }

  .empty {
    opacity: 0.6; line-height: 1.6; padding: 20px 6px; text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; opacity: 1; transform: none; }
    .slide { transition: none; }
    .spot-label .pip { animation: none; opacity: 0.8; }
  }
</style>
</head>
<body>
  <div id="spot" class="empty">
    <div class="spot-label"><span class="pip"></span> Sponsor Spotlight</div>
  </div>
  <div id="list"><div class="empty">No sponsors yet — they'll appear here once your event is set up.</div></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const spot = document.getElementById("spot");
  const list = document.getElementById("list");

  const TIERS = {
    platinum: { label: "Platinum", color: "var(--t-platinum)" },
    gold:     { label: "Gold",     color: "var(--t-gold)" },
    silver:   { label: "Silver",   color: "var(--t-silver)" },
    bronze:   { label: "Bronze",   color: "var(--t-bronze)" },
    partner:  { label: "Partner",  color: "var(--t-partner)" },
  };
  function tierMeta(tier) {
    return TIERS[(tier || "").toLowerCase()] || { label: tier || "Partner", color: "var(--t-partner)" };
  }

  function esc(s) { const d = document.createElement("span"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function initials(name) {
    const parts = (name || "?").trim().split(/\\s+/);
    return (parts.map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();
  }
  // Only https/data image URLs are ever placed in <img src> — blocks javascript: etc.
  function safeLogo(url) {
    return typeof url === "string" && /^(https:\\/\\/|data:image\\/)/i.test(url) ? url : null;
  }

  /** Build a logo node: real <img> if a safe logoUrl exists, else a brand-colored initials tile. */
  function makeLogo(s, cls) {
    const url = safeLogo(s.logoUrl);
    if (url) {
      const img = document.createElement("img");
      img.className = cls;
      img.src = url;
      img.alt = esc(s.name);
      // Graceful fallback if the remote logo fails to load.
      img.addEventListener("error", () => { img.replaceWith(fallbackTile(s, cls)); });
      return img;
    }
    return fallbackTile(s, cls);
  }
  function fallbackTile(s, cls) {
    const tile = document.createElement("div");
    tile.className = cls;
    tile.textContent = initials(s.name);
    // Brand color drives the gradient; validated as a CSS color by the browser.
    const c = typeof s.brandColor === "string" ? s.brandColor : "#7c6cff";
    tile.style.background = "linear-gradient(135deg, " + c + ", " + c + "cc)";
    return tile;
  }

  // ---- Sponsor Spotlight: crossfade timer, pausable on hover ----
  let slides = [], spotIdx = 0, spotTimer = null;
  function buildSpotlight(sponsors) {
    spot.querySelectorAll(".slide").forEach((n) => n.remove());
    slides = [];
    if (spotTimer) { clearInterval(spotTimer); spotTimer = null; }
    if (!sponsors.length) { spot.classList.add("empty"); return; }
    spot.classList.remove("empty");

    for (const s of sponsors) {
      const slide = document.createElement("div");
      slide.className = "slide";
      slide.appendChild(makeLogo(s, "logo"));
      const txt = document.createElement("div");
      txt.className = "txt";
      txt.innerHTML = '<div class="nm">' + esc(s.name) + "</div>" +
        (s.tagline ? '<div class="tg">' + esc(s.tagline) + "</div>" : "");
      slide.appendChild(txt);
      if (safeLogo0(s.url)) {
        slide.style.cursor = "pointer";
        slide.addEventListener("click", () => vscode.postMessage({ type: "visit", url: s.url }));
      }
      spot.appendChild(slide);
      slides.push(slide);
    }
    spotIdx = 0;
    slides[0].classList.add("on");
    startSpot();
  }
  function safeLogo0(url) { return typeof url === "string" && /^https?:\\/\\//i.test(url); }
  function advance() {
    if (slides.length < 2) return;
    slides[spotIdx].classList.remove("on");
    spotIdx = (spotIdx + 1) % slides.length;
    slides[spotIdx].classList.add("on");
  }
  function startSpot() {
    if (spotTimer || slides.length < 2) return;
    spotTimer = setInterval(advance, 4200);
  }
  function stopSpot() { if (spotTimer) { clearInterval(spotTimer); spotTimer = null; } }
  spot.addEventListener("mouseenter", stopSpot);
  spot.addEventListener("mouseleave", startSpot);

  // ---- Cards, grouped by tier ----
  function render(sponsors) {
    buildSpotlight(sponsors);
    list.innerHTML = "";
    if (!sponsors.length) {
      list.innerHTML = '<div class="empty">No sponsors yet — they\\'ll appear here once your event is set up.</div>';
      return;
    }
    let currentTier = null, i = 0;
    for (const s of sponsors) {
      const key = (s.tier || "").toLowerCase();
      if (key !== currentTier) {
        currentTier = key;
        const meta = tierMeta(s.tier);
        const count = sponsors.filter((x) => (x.tier || "").toLowerCase() === key).length;
        const head = document.createElement("div");
        head.className = "tier-head";
        head.style.color = meta.color;
        head.innerHTML = "<span>" + esc(meta.label) + '</span><span class="rule"></span>' +
          '<span class="cnt">' + count + "</span>";
        list.appendChild(head);
      }

      const meta = tierMeta(s.tier);
      const card = document.createElement("div");
      card.className = "card";
      card.style.animationDelay = Math.min(i * 40, 320) + "ms";
      card.appendChild(makeLogo(s, "logo"));

      const body = document.createElement("div");
      body.className = "body";
      const badge = '<span class="tier-badge" style="color:' + meta.color + '">' + esc(meta.label) + "</span>";
      body.innerHTML =
        '<div class="row1"><span class="name">' + esc(s.name) + "</span>" + badge + "</div>" +
        (s.tagline ? '<div class="tagline">' + esc(s.tagline) + "</div>" : "");
      card.appendChild(body);

      const btn = document.createElement("button");
      btn.className = "visit";
      btn.textContent = "Visit";
      if (safeLogo0(s.url)) {
        btn.addEventListener("click", () => vscode.postMessage({ type: "visit", url: s.url }));
      } else {
        btn.disabled = true;
        btn.title = "No link provided";
      }
      card.appendChild(btn);

      list.appendChild(card);
      i++;
    }
  }

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "sponsors") render(e.data.sponsors || []);
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
