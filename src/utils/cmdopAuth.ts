import { fetch } from "@tauri-apps/plugin-http";

const API_BASE = "https://api.cmdop.com";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface CmdopTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  // Official @cmdop/core DeviceCodeRequestRequestSchema:
  // { client_name, client_version, client_hostname, client_platform }
  // NOT client_id — that causes cmdop_ tokens instead of clit_ JWT
  const resp = await fetch(`${API_BASE}/api/system/oauth/device/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "ccam",
      client_version: "0.1.0",
      client_hostname: "desktop",
      client_platform: navigator.platform,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Device code request failed: ${resp.status}`);
  }

  return resp.json();
}

export async function exchangeDeviceCode(
  deviceCode: string,
): Promise<CmdopTokens | "pending" | "expired"> {
  const resp = await fetch(`${API_BASE}/api/system/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Official @cmdop/core TokenRequestRequestSchema:
    // { grant_type, device_code } — NO client_id
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
    }),
  });

  if (resp.ok) {
    return resp.json();
  }

  const body = await resp.json().catch(() => ({}));
  const error = body.error;

  if (error === "authorization_pending") return "pending";
  if (error === "expired_token" || error === "access_denied") return "expired";

  throw new Error(`Token exchange failed: ${error || resp.status}`);
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<CmdopTokens> {
  const resp = await fetch(`${API_BASE}/api/system/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Official @cmdop/core TokenRequestRequestSchema:
    // { grant_type, refresh_token } — NO client_id
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status}`);
  }

  return resp.json();
}
