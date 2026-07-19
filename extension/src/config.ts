import * as vscode from "vscode";

const cfg = () => vscode.workspace.getConfiguration("hackos");

export const apiUrl = () => cfg().get<string>("apiUrl") || "http://localhost:4010";
export const aiUrl = () => cfg().get<string>("aiUrl") || "http://localhost:4011";
export const gatewayUrl = () => cfg().get<string>("gatewayUrl") || "ws://localhost:4012";
