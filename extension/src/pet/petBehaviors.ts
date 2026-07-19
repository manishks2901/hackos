import * as vscode from "vscode";
import type { PetViewProvider } from "./petView";

/**
 * Wire the pet's smart IDE reactions to real editor signals. Each listener is
 * lightweight and only posts a reaction key to the webview — the pet never
 * blocks, reads buffers, or touches the editor.
 */
export function registerPetBehaviors(pet: PetViewProvider, ctx: vscode.ExtensionContext): void {
  // ---- typing speed → "You're on fire!" ----
  let keystrokes = 0;
  let lastFastAt = 0;
  const typingWindow = setInterval(() => {
    if (keystrokes > 14 && Date.now() - lastFastAt > 30_000) {
      pet.react("typingFast");
      lastFastAt = Date.now();
    }
    keystrokes = 0;
  }, 2_000);

  // ---- inactivity → sleep, resume → wake ----
  let lastActivityAt = Date.now();
  let asleep = false;
  const idleWatch = setInterval(() => {
    if (!asleep && Date.now() - lastActivityAt > 5 * 60_000) {
      asleep = true;
      pet.react("inactive");
    }
  }, 30_000);
  const bump = () => {
    if (asleep) {
      asleep = false;
      pet.react("active");
    }
    lastActivityAt = Date.now();
  };

  ctx.subscriptions.push(
    { dispose: () => clearInterval(typingWindow) },
    { dispose: () => clearInterval(idleWatch) },

    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme !== "file") return;
      keystrokes += e.contentChanges.reduce((n, c) => n + Math.max(1, c.text.length), 0);
      bump();
    }),

    vscode.debug.onDidStartDebugSession(() => pet.react("debugStart")),
    vscode.debug.onDidTerminateDebugSession(() => pet.react("debugEnd")),

    vscode.tasks.onDidEndTaskProcess((e) => {
      const name = `${e.execution.task.name} ${e.execution.task.source}`.toLowerCase();
      const isTest = /\btest|spec|jest|vitest|pytest\b/.test(name);
      const ok = e.exitCode === 0;
      if (isTest) pet.react(ok ? "testOk" : "testFail");
      else pet.react(ok ? "buildOk" : "buildFail");
    }),
  );

  // ---- git commits: watch .git/logs/HEAD per workspace folder ----
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, ".git/logs/HEAD"),
    );
    const onCommit = () => pet.react("commit");
    watcher.onDidChange(onCommit);
    watcher.onDidCreate(onCommit);
    ctx.subscriptions.push(watcher);
  }
}
