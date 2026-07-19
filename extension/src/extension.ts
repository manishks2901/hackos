import * as vscode from "vscode";
import { ApiClient } from "./api";
import { Store } from "./store";
import { SyncEngine } from "./sync";
import { EventTreeProvider } from "./tree";
import { ContentProvider, SCHEME, resourceUri, announcementUri, openMarkdown } from "./reader";
import { StatusBar } from "./status";
import { ChatViewProvider } from "./chat";
import { RealtimeClient } from "./realtime";
import { TeamChatViewProvider, type ChatMessage } from "./teamchat";
import { SponsorsViewProvider } from "./sponsors";
import { PetViewProvider } from "./pet/petView";
import { PetHistory } from "./pet/petHistory";
import { registerPetBehaviors } from "./pet/petBehaviors";
import { PetStatusBar } from "./pet/petStatusBar";
import { setPet } from "./notify";
import { aiUrl } from "./config";

export function activate(context: vscode.ExtensionContext) {
  const api = new ApiClient(context.secrets);
  const store = new Store(context.globalState);
  const sync = new SyncEngine(api, store);
  const tree = new EventTreeProvider(store);
  const content = new ContentProvider(store);
  const status = new StatusBar(store);

  // The pet: a webview sprite companion (bottom panel) that doubles as the
  // organizer's messenger. Animation lives in the webview; the host bridges
  // notifications + IDE events in and persists history.
  const petHistory = new PetHistory(context.globalState);
  const pet = new PetViewProvider(context, petHistory);
  // Always-visible global layer: the status-bar pet mirrors announcements and
  // badges unread even when the panel is closed (a webview only lives while its
  // panel is open; the status bar is the only globally-present surface).
  const petStatus = new PetStatusBar(
    petHistory,
    () => vscode.workspace.getConfiguration("hackos.pet").get<string>("type", "fox"),
  );
  pet.onDidNotify((n) => petStatus.flash(n));
  setPet((n) => pet.notify(n));
  registerPetBehaviors(pet, context);

  const realtime = new RealtimeClient(context.secrets, store, sync);
  const teamChat = new TeamChatViewProvider(api, store);
  realtime.onChatMessage((m) => teamChat.deliver(m as ChatMessage));

  // Deadline watch: warn when a timeline item is < 60 minutes away.
  const warnedDeadlines = new Set<string>();
  const deadlineWatch = setInterval(() => {
    const cache = store.cache;
    if (!cache) return;
    for (const t of cache.timeline) {
      const ms = new Date(t.startsAt).getTime() - Date.now();
      if (ms > 0 && ms < 60 * 60 * 1000 && !warnedDeadlines.has(t.id)) {
        warnedDeadlines.add(t.id);
        const mins = Math.max(1, Math.round(ms / 60000));
        // The pet delivers it — critical under 30 min (frantic run + live
        // countdown + red pulse), important otherwise.
        pet.notify({
          id: `deadline:${t.id}`,
          title: t.title,
          body: `Deadline in ${mins} minute${mins === 1 ? "" : "s"}. Wrap up what you're doing.`,
          priority: mins <= 30 ? "critical" : "important",
          category: "deadline",
          timestamp: Date.now(),
          deadlineAt: Date.now() + ms,
        });
      }
    }
  }, 60_000);

  sync.onDidSync(({ ok }) => status.setOnline(ok));
  realtime.onDidChangeState((connected) => {
    if (connected) status.setOnline(true);
  });

  // Resume: if we were connected last session, refresh in the background.
  if (store.cache) {
    void sync.sync({ silent: true });
    sync.startPolling();
    realtime.start();
  }

  const treeView = vscode.window.createTreeView("hackos.event", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  const updateBadge = () => {
    const unread = store.unreadAnnouncements;
    treeView.badge = unread
      ? { value: unread, tooltip: `${unread} unread announcement${unread === 1 ? "" : "s"}` }
      : undefined;
  };
  store.onDidChange(updateBadge);
  updateBadge();

  context.subscriptions.push(
    realtime,
    treeView,
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      new ChatViewProvider(context, api, store),
    ),
    vscode.window.registerWebviewViewProvider(TeamChatViewProvider.viewType, teamChat),
    vscode.window.registerWebviewViewProvider(
      SponsorsViewProvider.viewType,
      new SponsorsViewProvider(store),
    ),
    vscode.window.registerWebviewViewProvider(PetViewProvider.viewType, pet, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    petStatus,
    { dispose: () => clearInterval(deadlineWatch) },

    vscode.workspace.registerTextDocumentContentProvider(SCHEME, content),
    status,
    sync,

    vscode.commands.registerCommand("hackos.pet.history", () => pet.showHistory()),
    vscode.commands.registerCommand("hackos.pet.parade", () => pet.parade()),

    // Deep link: `vscode://hackos.hackos/notify?priority=critical` delivers a
    // pseudo notification to the pet (handy for demos and external triggers).
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path !== "/notify") return;
        const q = new URLSearchParams(uri.query);
        const raw = q.get("priority") ?? "normal";
        const priority = (["normal", "important", "critical", "winner"].includes(raw)
          ? raw
          : "normal") as "normal" | "important" | "critical" | "winner";
        const now = Date.now();
        const defaults = {
          normal: { title: "Lunch is served 🍕", body: "Pizza & drinks in the atrium. Grab a break!", category: "food" },
          important: { title: "Venue change", body: "Judging moved to Hall B, 2nd floor. Update your calendars.", category: "venue" },
          critical: { title: "Submission deadline", body: "Only 30 minutes remaining. Upload your final build now!", category: "deadline" },
          winner: { title: "1st place: Team Nullpointers! 🎉", body: "Congratulations! Come to the main stage for your prize.", category: "winner" },
        }[priority];
        pet.notify({
          id: `uri-${priority}-${now}`,
          title: q.get("title") ?? defaults.title,
          body: q.get("body") ?? defaults.body,
          priority,
          category: defaults.category,
          timestamp: now,
          deadlineAt: priority === "critical" ? now + 30 * 60_000 : undefined,
        });
      },
    }),

    vscode.commands.registerCommand("hackos.pet.test", async () => {
      const now = Date.now();
      const samples = {
        normal: {
          id: `test-normal-${now}`,
          title: "Lunch is served 🍕",
          body: "Pizza and drinks are in the atrium. Grab a break and refuel!",
          priority: "normal" as const,
          category: "food",
          timestamp: now,
        },
        important: {
          id: `test-important-${now}`,
          title: "Venue change",
          body: "Judging has moved to Hall B, 2nd floor. Please update your calendars.",
          priority: "important" as const,
          category: "venue",
          timestamp: now,
        },
        critical: {
          id: `test-critical-${now}`,
          title: "Submission deadline",
          body: "Only 30 minutes remaining before submissions close. Upload your final build now!",
          priority: "critical" as const,
          category: "deadline",
          timestamp: now,
          deadlineAt: now + 30 * 60_000,
        },
        winner: {
          id: `test-winner-${now}`,
          title: "1st place: Team Nullpointers! 🎉",
          body: "Congratulations! Come to the main stage to collect your prize.",
          priority: "winner" as const,
          category: "winner",
          timestamp: now,
        },
      };
      const picked = await vscode.window.showQuickPick(
        [
          { label: "$(bell) Normal", description: "Friendly wave · food announcement", key: "normal" },
          { label: "$(zap) Important", description: "Excited · venue change", key: "important" },
          { label: "$(alert) Critical", description: "Red pulse + shake + 30:00 countdown", key: "critical" },
          { label: "$(megaphone) Winner", description: "Confetti + celebration", key: "winner" },
          { label: "$(list-ordered) One of each", description: "Queue all four — tests the priority queue", key: "all" },
        ],
        { placeHolder: "Send a pseudo notification to the pet" },
      );
      if (!picked) return;
      if (picked.key === "all") {
        for (const n of Object.values(samples)) pet.notify(n);
      } else {
        pet.notify(samples[picked.key as keyof typeof samples]);
      }
    }),

    vscode.commands.registerCommand("hackathon.signIn", async () => {
      const email = await vscode.window.showInputBox({
        prompt: "HackOS email",
        ignoreFocusOut: true,
      });
      if (!email) return;
      const password = await vscode.window.showInputBox({
        prompt: "Password",
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) return;
      try {
        await api.signIn(email, password);
        vscode.window.showInformationMessage("HackOS: signed in.");
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS sign-in failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),

    vscode.commands.registerCommand("hackathon.join", async () => {
      if (!(await api.isSignedIn())) {
        vscode.window.showWarningMessage("HackOS: sign in first (Hackathon: Sign In).");
        return;
      }
      const code = await vscode.window.showInputBox({
        prompt: "Invite code (e.g. HACK-XXXX-XXXX)",
        ignoreFocusOut: true,
      });
      if (!code) return;
      try {
        const event = await api.request<{ id: string; name: string }>("/v1/invites/redeem", {
          method: "POST",
          body: { code },
        });
        await store.setEvent({ id: event.id, name: event.name });
        await sync.sync({ silent: false });
        sync.startPolling();
        realtime.start();
        vscode.window.showInformationMessage(`HackOS: joined "${event.name}".`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS join failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),

    vscode.commands.registerCommand("hackathon.sync", async () => {
      const ok = await sync.sync({ silent: false });
      if (ok) vscode.window.setStatusBarMessage("HackOS: synced", 2000);
    }),

    vscode.commands.registerCommand("hackathon.leave", async () => {
      sync.stopPolling();
      realtime.stop();
      await store.clear();
      vscode.window.showInformationMessage("HackOS: left the event (cache cleared).");
    }),

    vscode.commands.registerCommand("hackathon.signOut", async () => {
      sync.stopPolling();
      realtime.stop();
      await api.signOut();
      await store.clear();
      vscode.window.showInformationMessage("HackOS: signed out.");
    }),

    vscode.commands.registerCommand("hackathon.openResource", async (id: string) => {
      const r = store.cache?.resources.find((r) => r.id === id);
      if (!r) return;
      // Pure links open in the browser; anything with content opens as markdown.
      if (r.url && !r.content) {
        await vscode.env.openExternal(vscode.Uri.parse(r.url));
        return;
      }
      await openMarkdown(resourceUri(id));
    }),

    vscode.commands.registerCommand("hackathon.openSponsor", async (url: string) => {
      // Only http(s) links leave the IDE — guards against odd schemes from the API.
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),

    vscode.commands.registerCommand("hackathon.openAnnouncement", async (id: string) => {
      await store.markAnnouncementRead(id);
      await openMarkdown(announcementUri(id));
    }),

    vscode.commands.registerCommand("hackathon.createTeam", async () => {
      const event = store.event;
      if (!event) return;
      const name = await vscode.window.showInputBox({
        prompt: "Team name",
        placeHolder: "nullpointers",
        ignoreFocusOut: true,
      });
      if (!name) return;
      try {
        await api.request(`/v1/hackathons/${event.id}/teams`, { method: "POST", body: { name } });
        await sync.sync({ silent: true });
        vscode.window.showInformationMessage(`HackOS: team "${name}" created.`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),

    vscode.commands.registerCommand("hackathon.joinTeam", async () => {
      const event = store.event;
      if (!event) return;
      try {
        const teams = await api.request<
          Array<{ id: string; name: string; members: Array<{ name: string }> }>
        >(`/v1/hackathons/${event.id}/teams`);
        if (!teams.length) {
          vscode.window.showInformationMessage("HackOS: no teams yet — create one!");
          return;
        }
        const picked = await vscode.window.showQuickPick(
          teams.map((t) => ({
            label: t.name,
            description: t.members.map((m) => m.name).join(", "),
            teamId: t.id,
          })),
          { placeHolder: "Pick a team to join" },
        );
        if (!picked) return;
        await api.request(`/v1/hackathons/${event.id}/teams/${picked.teamId}/join`, {
          method: "POST",
          body: {},
        });
        await sync.sync({ silent: true });
        vscode.window.showInformationMessage(`HackOS: joined team "${picked.label}".`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),

    vscode.commands.registerCommand("hackathon.submitProject", async () => {
      const event = store.event;
      if (!event) return;
      const repoUrl = await vscode.window.showInputBox({
        prompt: "Repository URL",
        placeHolder: "https://github.com/you/project",
        value: store.cache?.mySubmission?.repoUrl,
        ignoreFocusOut: true,
        validateInput: (v) => (/^https?:\/\/.+/.test(v) ? undefined : "Enter a valid URL"),
      });
      if (!repoUrl) return;
      const description = await vscode.window.showInputBox({
        prompt: "Short project description (optional)",
        ignoreFocusOut: true,
      });
      if (description === undefined) return;
      const demoUrl = await vscode.window.showInputBox({
        prompt: "Demo URL (optional)",
        ignoreFocusOut: true,
        validateInput: (v) => (!v || /^https?:\/\/.+/.test(v) ? undefined : "Enter a valid URL"),
      });
      if (demoUrl === undefined) return;
      try {
        await api.request(`/v1/hackathons/${event.id}/submissions`, {
          method: "POST",
          body: {
            repoUrl,
            ...(description ? { description } : {}),
            ...(demoUrl ? { demoUrl } : {}),
          },
        });
        await sync.sync({ silent: true });
        vscode.window.showInformationMessage("🚀 HackOS: project submitted!");
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS submission failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),

    vscode.commands.registerCommand("hackathon.summarize", async () => {
      const event = store.event;
      if (!event) {
        vscode.window.showWarningMessage("HackOS: join a hackathon first.");
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Summarizing announcements…" },
        async () => {
          try {
            const token = await context.secrets.get("hackos.accessToken");
            const res = await fetch(`${aiUrl()}/v1/summarize`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({ hackathonId: event.id }),
            });
            const data = (await res.json()) as { summary?: string; error?: string };
            if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
            const doc = await vscode.workspace.openTextDocument({
              content: `# Announcements — last 24h\n\n${data.summary}`,
              language: "markdown",
            });
            await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
          } catch (err) {
            vscode.window.showErrorMessage(
              `HackOS summarize failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        },
      );
    }),

    vscode.commands.registerCommand("hackathon.search", async () => {
      const event = store.event;
      if (!event) {
        vscode.window.showWarningMessage("HackOS: join a hackathon first.");
        return;
      }
      const query = await vscode.window.showInputBox({
        prompt: "Search event resources (semantic)",
        placeHolder: "prize for best use of the payments API",
        ignoreFocusOut: true,
      });
      if (!query) return;
      try {
        const token = await context.secrets.get("hackos.accessToken");
        const res = await fetch(`${aiUrl()}/v1/search`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ hackathonId: event.id, question: query }),
        });
        const results = (await res.json()) as Array<{
          resourceId: string;
          title: string;
          section: string | null;
          snippet: string;
        }>;
        if (!res.ok || !Array.isArray(results)) throw new Error("search failed");
        if (results.length === 0) {
          vscode.window.showInformationMessage("HackOS: no matches in event resources.");
          return;
        }
        const picked = await vscode.window.showQuickPick(
          results.map((r) => ({
            label: r.title,
            description: r.section ?? "",
            detail: r.snippet,
            resourceId: r.resourceId,
          })),
          { placeHolder: "Matching event resources" },
        );
        if (picked) {
          await vscode.commands.executeCommand("hackathon.openResource", picked.resourceId);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `HackOS search failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),
  );

  // Reveal the pet panel on startup so it's visible without hunting for it.
  void vscode.commands.executeCommand("hackos.pet.focus");
}

export function deactivate() {}
