import { fetch } from "@tauri-apps/plugin-http";
import { refreshAccessToken, type CmdopTokens } from "./cmdopAuth";

const API_BASE = "https://api.cmdop.com";

export interface CmdopMachine {
  id: string;
  name: string;
  hostname?: string;
  status?: string;
  workspace?: string;
  active_terminal_session?: {
    session_id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface MachinesResponse {
  results: CmdopMachine[];
  count: number;
}

/**
 * List machines via Tauri fetch (bypasses CORS).
 * Uses Bearer token (from OAuth JWT).
 *
 * IMPORTANT: onTokenRefreshed is ONLY called after a successful API request
 * with the refreshed token. This prevents infinite re-render loops when
 * refresh returns a bad token.
 */
export async function listMachines(opts: {
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  onTokenRefreshed?: (accessToken: string, refreshToken: string, expiresAt: number) => void;
}): Promise<CmdopMachine[]> {
  let currentToken = opts.token;
  let refreshResult: CmdopTokens | null = null;

  // If token is expired (by expiresAt), try refreshing BEFORE the request
  if (opts.expiresAt && opts.expiresAt < Date.now() + 60_000 && opts.refreshToken) {
    console.log("[CMDOP] Token expired by expiresAt, refreshing proactively...");
    try {
      refreshResult = await refreshAccessToken(opts.refreshToken);
      currentToken = refreshResult.access_token;
      console.log(`[CMDOP] Proactive refresh OK, new token: ${currentToken.slice(0, 12)}...`);
    } catch (err) {
      console.error("[CMDOP] Proactive refresh failed:", err);
      // Continue with old token — server will reject and we'll try again
    }
  }

  if (!currentToken) {
    throw new Error("No valid token available. Please connect to CMDOP in Settings.");
  }

  console.log(`[CMDOP] listMachines with token: ${currentToken.slice(0, 12)}...`);

  const resp = await fetch(`${API_BASE}/api/machines/machines/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${currentToken}`,
    },
  });

  console.log(`[CMDOP] listMachines → ${resp.status}`);

  if (resp.ok) {
    const data = (await resp.json()) as MachinesResponse;
    console.log(`[CMDOP] listMachines OK, count=${data.count}, results=${data.results?.length}`);
    // Token works! Safe to update store with refreshed tokens
    if (refreshResult) {
      opts.onTokenRefreshed?.(
        refreshResult.access_token,
        refreshResult.refresh_token,
        Date.now() + refreshResult.expires_in * 1000,
      );
    }
    return data.results || [];
  }

  const body = await resp.text().catch(() => "");
  console.log(`[CMDOP] listMachines error body: ${body.slice(0, 300)}`);

  // If 401 token_not_valid and we haven't refreshed yet, try refresh + retry ONCE
  if (resp.status === 401 && opts.refreshToken && !refreshResult && body.includes("token_not_valid")) {
    console.log("[CMDOP] Token invalid, forcing refresh...");
    try {
      refreshResult = await refreshAccessToken(opts.refreshToken);
      console.log(`[CMDOP] Forced refresh OK, new token: ${refreshResult.access_token.slice(0, 12)}...`);

      const resp2 = await fetch(`${API_BASE}/api/machines/machines/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${refreshResult.access_token}`,
        },
      });

      console.log(`[CMDOP] listMachines (after refresh) → ${resp2.status}`);

      if (resp2.ok) {
        const data = (await resp2.json()) as MachinesResponse;
        // Success! Now safe to save refreshed tokens to store
        opts.onTokenRefreshed?.(
          refreshResult.access_token,
          refreshResult.refresh_token,
          Date.now() + refreshResult.expires_in * 1000,
        );
        return data.results || [];
      }

      // Refresh returned a token but it's also rejected — session is broken
      throw new Error("Session expired. Please disconnect and reconnect to CMDOP in Settings.");
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) throw err;
      throw new Error("Token refresh failed. Please disconnect and reconnect to CMDOP in Settings.");
    }
  }

  // Already tried refresh but still got 401 — don't retry
  if (resp.status === 401 && refreshResult) {
    throw new Error("Session expired. Please disconnect and reconnect to CMDOP in Settings.");
  }

  throw new Error(`Failed to list machines: ${resp.status} — ${body.slice(0, 100)}`);
}

/**
 * Get Centrifugo connection token via REST API.
 */
export async function getConnectionToken(token: string): Promise<string | null> {
  const endpoints = [
    "/api/system/centrifugo/connection-token/",
    "/api/system/ws/token/",
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });
      console.log(`[CMDOP] getConnectionToken ${endpoint} → ${resp.status}`);
      if (resp.ok) {
        const data = (await resp.json()) as { token: string };
        return data.token;
      }
    } catch {
      // endpoint might not exist
    }
  }

  return null;
}
