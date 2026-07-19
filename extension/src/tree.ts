import * as vscode from "vscode";
import type { Store } from "./store";
import type { Announcement, Resource, TimelineItem } from "./types";

type Node =
  | { kind: "section"; label: string; icon: string; count?: number; children: Node[] }
  | { kind: "resource"; resource: Resource }
  | { kind: "announcement"; announcement: Announcement; unread: boolean }
  | { kind: "timeline"; item: TimelineItem; next: boolean }
  | { kind: "person"; name: string; detail?: string }
  | { kind: "sponsor"; name: string; tier: string; tagline: string | null; url: string | null }
  | { kind: "action"; label: string; command: string; icon?: string };

const RESOURCE_ICONS: Record<Resource["type"], string> = {
  problem_statement: "target",
  doc: "book",
  link: "link-external",
  sponsor_api: "plug",
  faq: "question",
  judging_criteria: "law",
  submission_guidelines: "checklist",
};

const SECTIONS: Array<{ label: string; icon: string; types: Resource["type"][] }> = [
  { label: "Problem Statements", icon: "target", types: ["problem_statement"] },
  { label: "Docs & Resources", icon: "book", types: ["doc", "link"] },
  { label: "Sponsor APIs", icon: "plug", types: ["sponsor_api"] },
  { label: "FAQs", icon: "question", types: ["faq"] },
  { label: "Judging & Submission", icon: "law", types: ["judging_criteria", "submission_guidelines"] },
];

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diff > 0 ? `in ${span}` : `${span} ago`;
}

/** Urgency color for upcoming deadlines: red < 1h, yellow < 6h. */
function deadlineColor(iso: string): vscode.ThemeColor | undefined {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return undefined;
  if (ms < 3_600_000) return new vscode.ThemeColor("charts.red");
  if (ms < 6 * 3_600_000) return new vscode.ThemeColor("charts.yellow");
  return undefined;
}

function preview(text: string | null, max = 220): string {
  if (!text) return "";
  const plain = text.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export class EventTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private store: Store) {
    store.onDidChange(() => this._onDidChange.fire());
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "section": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        if (node.count !== undefined) item.description = String(node.count);
        return item;
      }
      case "resource": {
        const r = node.resource;
        const item = new vscode.TreeItem(r.title);
        item.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[r.type] ?? "file");
        const body = preview(r.content) || r.url || "";
        if (body) {
          const tip = new vscode.MarkdownString();
          tip.appendMarkdown(`**${r.title}**\n\n${body}`);
          item.tooltip = tip;
        }
        item.command = { command: "hackathon.openResource", title: "Open", arguments: [r.id] };
        return item;
      }
      case "announcement": {
        const a = node.announcement;
        const item = new vscode.TreeItem(a.title);
        if (node.unread) {
          item.iconPath = new vscode.ThemeIcon(
            a.priority === "high" ? "warning" : "circle-large-filled",
            new vscode.ThemeColor(a.priority === "high" ? "charts.yellow" : "charts.purple"),
          );
          item.description = `● ${relativeTime(a.createdAt)}`;
        } else {
          item.iconPath = new vscode.ThemeIcon(a.priority === "high" ? "warning" : "megaphone");
          item.description = relativeTime(a.createdAt);
        }
        const tip = new vscode.MarkdownString();
        tip.appendMarkdown(`**${a.title}**\n\n${preview(a.body, 400)}`);
        item.tooltip = tip;
        item.command = { command: "hackathon.openAnnouncement", title: "Open", arguments: [a.id] };
        return item;
      }
      case "timeline": {
        const t = node.item;
        const item = new vscode.TreeItem(t.title);
        const past = new Date(t.startsAt).getTime() < Date.now();
        item.iconPath = past
          ? new vscode.ThemeIcon("check", new vscode.ThemeColor("disabledForeground"))
          : new vscode.ThemeIcon(node.next ? "record" : "clock", deadlineColor(t.startsAt));
        item.description = relativeTime(t.startsAt);
        item.tooltip = new Date(t.startsAt).toLocaleString();
        return item;
      }
      case "person": {
        const item = new vscode.TreeItem(node.name);
        item.iconPath = new vscode.ThemeIcon("account");
        if (node.detail) item.description = node.detail;
        return item;
      }
      case "sponsor": {
        const item = new vscode.TreeItem(node.name);
        const tierIcon: Record<string, string> = {
          platinum: "star-full",
          gold: "star-half",
          silver: "star-empty",
          partner: "heart",
        };
        item.iconPath = new vscode.ThemeIcon(tierIcon[node.tier] ?? "organization");
        item.description = node.tier;
        if (node.tagline) item.tooltip = node.tagline;
        if (node.url) {
          item.command = {
            command: "vscode.open",
            title: "Open sponsor site",
            arguments: [vscode.Uri.parse(node.url)],
          };
        }
        return item;
      }
      case "action": {
        const item = new vscode.TreeItem(node.label);
        if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
        if (node.command) item.command = { command: node.command, title: node.label };
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (node) return node.kind === "section" ? node.children : [];

    const cache = this.store.cache;
    // Empty root triggers the viewsWelcome content (sign in / join buttons).
    if (!cache) return [];

    const sections: Node[] = [];

    // Announcements first — the thing people must not miss. Unread float up top.
    const read = new Set(cache.readAnnouncements ?? []);
    const announcements = [...cache.announcements].sort((a, b) => {
      const ua = read.has(a.id) ? 1 : 0;
      const ub = read.has(b.id) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    sections.push({
      kind: "section",
      label: "Announcements",
      icon: "megaphone",
      count: announcements.length,
      children: announcements.map((a) => ({
        kind: "announcement" as const,
        announcement: a,
        unread: !read.has(a.id),
      })),
    });

    // Timeline: next upcoming item highlighted.
    const upcoming = [...cache.timeline].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    const nextIdx = upcoming.findIndex((t) => new Date(t.startsAt).getTime() > Date.now());
    sections.push({
      kind: "section",
      label: "Timeline",
      icon: "calendar",
      count: upcoming.length,
      children: upcoming.map((t, i) => ({
        kind: "timeline" as const,
        item: t,
        next: i === nextIdx,
      })),
    });

    // Content sections: only show ones that have content — no "empty" noise.
    for (const s of SECTIONS) {
      const resources = cache.resources.filter((r) => s.types.includes(r.type));
      if (!resources.length) continue;
      sections.push({
        kind: "section",
        label: s.label,
        icon: s.icon,
        count: resources.length,
        children: resources.map((r) => ({ kind: "resource" as const, resource: r })),
      });
    }

    // Team
    const myTeam = cache.teams?.find((t) => t.isMine);
    const teamChildren: Node[] = [];
    if (myTeam) {
      for (const m of myTeam.members) teamChildren.push({ kind: "person", name: m.name });
      teamChildren.push(
        cache.mySubmission
          ? {
              kind: "action",
              label: "Submitted — update submission",
              command: "hackathon.submitProject",
              icon: "check",
            }
          : {
              kind: "action",
              label: "Submit project",
              command: "hackathon.submitProject",
              icon: "rocket",
            },
      );
    } else {
      teamChildren.push(
        { kind: "action", label: "Create a team", command: "hackathon.createTeam", icon: "add" },
        { kind: "action", label: "Join a team", command: "hackathon.joinTeam", icon: "organization" },
      );
    }
    sections.push({
      kind: "section",
      label: myTeam ? `Team · ${myTeam.name}` : "Team",
      icon: "organization",
      count: myTeam?.members.length,
      children: teamChildren,
    });

    if (cache.sponsors?.length) {
      sections.push({
        kind: "section",
        label: "Sponsors",
        icon: "star",
        count: cache.sponsors.length,
        children: cache.sponsors.map((s) => ({
          kind: "sponsor" as const,
          name: s.name,
          tier: s.tier,
          tagline: s.tagline,
          url: s.url,
        })),
      });
    }

    if (cache.mentors?.length) {
      sections.push({
        kind: "section",
        label: "Mentors",
        icon: "mortar-board",
        count: cache.mentors.length,
        children: cache.mentors.map((m) => ({
          kind: "person" as const,
          name: m.name,
          detail: "mentor",
        })),
      });
    }

    return sections;
  }
}
