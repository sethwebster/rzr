import { spawn } from "node:child_process";

const CLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const NGROK_URL_RE = /url=(https:\/\/[^\s]+)/i;
const GENERIC_HTTPS_URL_RE = /https:\/\/[^\s"'`]+/i;

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

function startCloudflaredTunnel(localUrl) {
  return makeTunnelProcess({
    provider: "cloudflared",
    command: "cloudflared",
    args: ["tunnel", "--no-autoupdate", "--url", localUrl],
    parsePublicUrl: (chunk) => chunk.match(CLOUDFLARE_URL_RE)?.[0] || null,
  });
}

function startNgrokTunnel(localUrl) {
  return makeTunnelProcess({
    provider: "ngrok",
    command: "ngrok",
    args: ["http", localUrl, "--log", "stdout", "--log-format", "logfmt"],
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

function startLocaltunnel(port) {
  return makeTunnelProcess({
    provider: "localtunnel",
    command: "npx",
    args: ["--yes", "localtunnel", "--port", String(port)],
    startupTimeoutMs: 30000,
    parsePublicUrl: (chunk, logs) => {
      const anyHttps = chunk.match(GENERIC_HTTPS_URL_RE)?.[0]
        || logs.match(GENERIC_HTTPS_URL_RE)?.[0]
        || null;
      return anyHttps;
    },
  });
}

export async function startBestTunnel({ localUrl, port }) {
  const candidates = [];

  if (await commandExists("cloudflared")) {
    candidates.push(() => startCloudflaredTunnel(localUrl));
  }

  if (await commandExists("ngrok")) {
    candidates.push(() => startNgrokTunnel(localUrl));
  }

  candidates.push(() => startLocaltunnel(port));

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
