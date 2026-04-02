import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const NGROK_URL_RE = /url=(https:\/\/[^\s]+)/i;
const GENERIC_HTTPS_URL_RE = /https:\/\/[^\s"'`]+/i;
const CLOUDFLARE_READY_RE = /(registered tunnel connection|connection .+ registered|starting metrics server|initial protocol)/i;

function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function makeTunnelProcess({ provider, command, args, parsePublicUrl, startupTimeoutMs = 20000 }) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let publicUrl = null;
  let closed = false;
  let startupError = null;
  let startupSettled = false;
  let combinedLogs = "";

  const ready = new Promise((resolve, reject) => {
    const startupTimer = setTimeout(() => {
      if (startupSettled) {
        return;
      }

      startupSettled = true;
      reject(new Error(`${provider} tunnel timed out waiting for a public URL`));
    }, startupTimeoutMs);

    function finishWithError(error) {
      if (startupSettled) {
        return;
      }

      startupSettled = true;
      clearTimeout(startupTimer);
      reject(error);
    }

    function finishWithUrl(url) {
      if (startupSettled) {
        return;
      }

      startupSettled = true;
      publicUrl = url;
      clearTimeout(startupTimer);
      resolve(url);
    }

    function handleChunk(chunk) {
      combinedLogs += chunk;

      const maybeUrl = parsePublicUrl(chunk, combinedLogs);
      if (maybeUrl) {
        finishWithUrl(maybeUrl);
      }
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", (error) => {
      startupError = error;
      finishWithError(error);
    });

    child.on("close", (code, signal) => {
      closed = true;

      if (startupSettled) {
        return;
      }

      const reason = startupError?.message
        || combinedLogs.trim()
        || `${provider} exited before tunnel startup (${signal || code})`;
      finishWithError(new Error(reason));
    });
  });

  async function close() {
    if (closed) {
      return;
    }

    await new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 3000);

      child.once("close", () => {
        clearTimeout(killTimer);
        closed = true;
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  return {
    provider,
    ready,
    get publicUrl() {
      return publicUrl;
    },
    close,
  };
}

function sanitizeTunnelName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function looksLikeHostname(value) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(value).trim());
}

function hasCloudflareOriginCert() {
  return existsSync(join(homedir(), ".cloudflared", "cert.pem"));
}

function startCloudflaredNamedTunnel(localUrl, hostname) {
  const stableTunnelName = sanitizeTunnelName(hostname);

  return makeTunnelProcess({
    provider: "cloudflared",
    command: "cloudflared",
    args: [
      "tunnel",
      "--no-autoupdate",
      "--url",
      localUrl,
      "--name",
      stableTunnelName,
      "--hostname",
      hostname,
    ],
    parsePublicUrl: (chunk, logs) => {
      if (CLOUDFLARE_READY_RE.test(chunk) || CLOUDFLARE_READY_RE.test(logs)) {
        return `https://${hostname}`;
      }

      return null;
    },
    startupTimeoutMs: 30000,
  });
}

function startCloudflaredQuickTunnel(localUrl, tunnelName) {
  const args = ["tunnel", "--no-autoupdate", "--url", localUrl];
  if (tunnelName) {
    args.push("--label", `rzr-name=${tunnelName}`);
  }

  return makeTunnelProcess({
    provider: "cloudflared",
    command: "cloudflared",
    args,
    parsePublicUrl: (chunk) => chunk.match(CLOUDFLARE_URL_RE)?.[0] || null,
  });
}

function startNgrokTunnel(localUrl, tunnelName) {
  const args = ["http", localUrl, "--log", "stdout", "--log-format", "logfmt"];
  if (tunnelName) {
    args.push("--name", tunnelName);
  }

  return makeTunnelProcess({
    provider: "ngrok",
    command: "ngrok",
    args,
    parsePublicUrl: (chunk, logs) => {
      const urlFromLogfmt = chunk.match(NGROK_URL_RE)?.[1];
      if (urlFromLogfmt) {
        return urlFromLogfmt;
      }

      const anyHttps = logs.match(GENERIC_HTTPS_URL_RE)?.[0] || null;
      return anyHttps && anyHttps.includes("ngrok") ? anyHttps : null;
    },
  });
}

function startLocaltunnel(port, tunnelName) {
  const args = ["--yes", "localtunnel", "--port", String(port)];
  const subdomain = tunnelName ? sanitizeTunnelName(tunnelName) : "";
  if (subdomain) {
    args.push("--subdomain", subdomain);
  }

  return makeTunnelProcess({
    provider: "localtunnel",
    command: "npx",
    args,
    startupTimeoutMs: 30000,
    parsePublicUrl: (chunk, logs) => {
      const anyHttps = chunk.match(GENERIC_HTTPS_URL_RE)?.[0]
        || logs.match(GENERIC_HTTPS_URL_RE)?.[0]
        || null;
      return anyHttps;
    },
  });
}

export async function startBestTunnel({ localUrl, port, tunnelName = "" }) {
  const candidates = [];

  if (await commandExists("cloudflared")) {
    if (tunnelName && looksLikeHostname(tunnelName) && hasCloudflareOriginCert()) {
      candidates.push(() => startCloudflaredNamedTunnel(localUrl, tunnelName));
    }

    candidates.push(() => startCloudflaredQuickTunnel(localUrl, tunnelName));
  }

  if (await commandExists("ngrok")) {
    candidates.push(() => startNgrokTunnel(localUrl, tunnelName));
  }

  candidates.push(() => startLocaltunnel(port, tunnelName));

  const errors = [];

  for (const candidate of candidates) {
    const tunnel = candidate();

    try {
      await tunnel.ready;
      return tunnel;
    } catch (error) {
      errors.push(`${tunnel.provider}: ${error.message}`);
      await tunnel.close().catch(() => {});
    }
  }

  throw new Error(`unable to establish a public tunnel\n${errors.join("\n")}`);
}
