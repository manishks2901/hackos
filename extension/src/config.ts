import * as vscode from "vscode";

const cfg = () => vscode.workspace.getConfiguration("hackos");

export const apiUrl = () =>
  cfg().get<string>("apiUrl") || "https://api-production-c174.up.railway.app";
export const aiUrl = () =>
  cfg().get<string>("aiUrl") || "https://ai-production-b78a.up.railway.app";
export const gatewayUrl = () =>
  cfg().get<string>("gatewayUrl") || "wss://gateway-production-0fe6.up.railway.app";
