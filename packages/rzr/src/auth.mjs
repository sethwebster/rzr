import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const RZR_DIR = join(homedir(), ".rzr");
const AUTH_FILE = join(RZR_DIR, "auth.json");
const CONFIG_FILE = join(RZR_DIR, "config.json");
const CONFIG_TMP_FILE = join(RZR_DIR, "config.json.tmp");
export const CLI_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

async function readGatewayJson(response) {
  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "invalid response" };
  }

  if (!response.ok) {
    throw new Error(payload.error || `gateway request failed (${response.status})`);
  }

  return payload;
}

export function getAuthFilePath() {
  return AUTH_FILE;
}

export function loadSavedAuth() {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2) + "\n", "utf8");
}

export function clearAuth() {
  rmSync(AUTH_FILE, { force: true });
}

export function getSavedAccessToken() {
  return String(loadSavedAuth()?.accessToken || "").trim();
}

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(patch) {
  const current = loadConfig();
  const merged = { ...current, ...patch };
  mkdirSync(RZR_DIR, { recursive: true });
  writeFileSync(CONFIG_TMP_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");
  renameSync(CONFIG_TMP_FILE, CONFIG_FILE);
}

export function openUrl(url) {
  const candidates = process.platform === "darwin"
    ? [["open", [url]]]
    : process.platform === "win32"
      ? [["cmd", ["/c", "start", "", url]]]
      : [["xdg-open", [url]]];

  for (const [command, args] of candidates) {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    } catch {
      // try next opener
    }
  }

  return false;
}

export async function fetchViewer({ baseUrl, accessToken }) {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return readGatewayJson(response);
}

export async function logoutViewer({ baseUrl, accessToken }) {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return readGatewayJson(response);
}

export async function requestCliMagicLink({ baseUrl, email }) {
  const response = await fetch(`${baseUrl}/api/auth/request-link`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      flow: "cli",
    }),
  });

  return readGatewayJson(response);
}

export async function pollCliLogin({ baseUrl, pollToken }) {
  const response = await fetch(`${baseUrl}/api/auth/cli/poll`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pollToken }),
  });

  return readGatewayJson(response);
}
