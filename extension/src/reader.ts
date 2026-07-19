import * as vscode from "vscode";
import type { Store } from "./store";

export const SCHEME = "hackos";

/**
 * Serves cached event content as virtual markdown documents, so resources and
 * announcements open in real editor tabs / markdown preview without touching disk.
 */
export class ContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private store: Store) {
    store.onDidChange(() => {
      // Refresh any open hackos: documents after a sync.
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme === SCHEME) this._onDidChange.fire(doc.uri);
      }
    });
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const cache = this.store.cache;
    if (!cache) return "_Not connected to a hackathon._";
    const [, kind, id] = uri.path.split("/"); // /resource/<id>.md

    if (kind === "resource") {
      const r = cache.resources.find((r) => r.id === id.replace(/\.md$/, ""));
      if (!r) return "_Resource not found — try Hackathon: Sync._";
      const parts = [`# ${r.title}\n`];
      if (r.url) parts.push(`> ${r.url}\n`);
      parts.push(r.content ?? "_No content._");
      return parts.join("\n");
    }

    if (kind === "announcement") {
      const a = cache.announcements.find((a) => a.id === id.replace(/\.md$/, ""));
      if (!a) return "_Announcement not found._";
      const flag = a.priority === "high" ? "⚡ **HIGH PRIORITY**\n\n" : "";
      return `# ${a.title}\n\n${flag}${a.body}\n\n---\n_${new Date(a.createdAt).toLocaleString()}_`;
    }

    return "_Unknown content._";
  }
}

export function resourceUri(id: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}:/resource/${id}.md`);
}

export function announcementUri(id: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}:/announcement/${id}.md`);
}

export async function openMarkdown(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand("markdown.showPreview", uri);
}
