import * as vscode from "vscode";
import { apiUrl } from "./config";

interface RequestOpts {
  method?: string;
  body?: unknown;
}

export class ApiClient {
  constructor(private secrets: vscode.SecretStorage) {}

  async isSignedIn(): Promise<boolean> {
    return !!(await this.secrets.get("hackos.accessToken"));
  }

  async signIn(email: string, password: string): Promise<void> {
    const res = await this.raw<{ accessToken: string; refreshToken: string }>(
      "/v1/auth/signin",
      { method: "POST", body: { email, password } },
    );
    await this.secrets.store("hackos.accessToken", res.accessToken);
    await this.secrets.store("hackos.refreshToken", res.refreshToken);
  }

  async signOut(): Promise<void> {
    await this.secrets.delete("hackos.accessToken");
    await this.secrets.delete("hackos.refreshToken");
  }

  /** Authenticated request; on 401 refreshes once and retries. */
  async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const token = await this.secrets.get("hackos.accessToken");
    try {
      return await this.raw<T>(path, opts, token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && (await this.tryRefresh())) {
        const fresh = await this.secrets.get("hackos.accessToken");
        return this.raw<T>(path, opts, fresh);
      }
      throw err;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = await this.secrets.get("hackos.refreshToken");
    if (!refreshToken) return false;
    try {
      const res = await this.raw<{ accessToken: string; refreshToken: string }>(
        "/v1/auth/refresh",
        { method: "POST", body: { refreshToken } },
      );
      await this.secrets.store("hackos.accessToken", res.accessToken);
      await this.secrets.store("hackos.refreshToken", res.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  private async raw<T>(path: string, opts: RequestOpts, token?: string): Promise<T> {
    const res = await fetch(`${apiUrl()}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message =
        typeof data.error === "string" ? data.error : `request failed (${res.status})`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
