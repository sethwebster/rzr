import { spawn as spawnChild } from "node:child_process";

function splitVersion(version) {
  const normalized = String(version || "")
    .trim()
    .replace(/^v/i, "");
  const [core = "0", prerelease = ""] = normalized.split("-", 2);

  return {
    parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    prerelease,
  };
}

export function compareVersions(left, right) {
  const a = splitVersion(left);
  const b = splitVersion(right);
  const length = Math.max(a.parts.length, b.parts.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = a.parts[index] ?? 0;
    const bPart = b.parts[index] ?? 0;

    if (aPart !== bPart) {
      return aPart > bPart ? 1 : -1;
    }
  }

  if (a.prerelease && !b.prerelease) {
    return -1;
  }

  if (!a.prerelease && b.prerelease) {
    return 1;
  }

  if (a.prerelease === b.prerelease) {
    return 0;
  }

  return a.prerelease > b.prerelease ? 1 : -1;
}

export function isUpdateCheckEnabled(env = process.env) {
  const raw = String(env.RZR_NO_UPDATE_CHECK || "").trim().toLowerCase();
  return !["1", "0", "false", "no", "off"].includes(raw);
}

export function buildUpdateCommand(packageName, method = "global") {
  if (method === "npx") {
    return `npx ${packageName}@latest --version`;
  }
  return `npm install -g ${packageName}@latest`;
}

export function detectLaunchMethod(argv = process.argv) {
  const bin = String(argv[1] || "");
  if (bin.includes(".npx") || bin.includes("/_npx/") || bin.includes("\\_npx\\")) {
    return "npx";
  }
  return "global";
}

export async function fetchLatestVersion({
  packageName,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1500,
} = {}) {
  if (!packageName || typeof fetchImpl !== "function") {
    return null;
  }

  try {
    const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const latest = payload?.["dist-tags"]?.latest;
    return typeof latest === "string" && latest ? latest : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate({
  packageName,
  currentVersion,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1500,
} = {}) {
  const latestVersion = await fetchLatestVersion({
    packageName,
    fetchImpl,
    timeoutMs,
  });

  if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
    return null;
  }

  return {
    currentVersion,
    latestVersion,
    command: buildUpdateCommand(packageName),
  };
}

export function performUpdate({ packageName, method = "global" }) {
  const command = method === "npx"
    ? "npx"
    : "npm";
  const args = method === "npx"
    ? [`${packageName}@latest`, "--version"]
    : ["install", "-g", `${packageName}@latest`];

  return new Promise((resolve) => {
    let stderr = "";

    const child = spawnChild(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 2000) {
        stderr = stderr.slice(-2000);
      }
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message, stderr });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `${command} exited with code ${code}`,
          stderr: stderr.trim().slice(-500),
        });
      }
    });
  });
}
