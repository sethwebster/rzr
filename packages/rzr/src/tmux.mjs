import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function run(command, args, { input, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0 && !allowFailure) {
        const error = new Error(stderr.trim() || `${command} exited with code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ code, stdout, stderr });
    });

    if (typeof input === "string" && input.length > 0) {
      child.stdin.write(input);
    }

    child.stdin.end();
  });
}

function normalizeCapturedPane(output) {
  return output
    .replace(/\r/g, "")
    .replace(/(?:\n[\t ]*)+$/g, "");
}

export async function ensureTmux() {
  await run("tmux", ["-V"]);
}

export async function hasSession(target) {
  const result = await run("tmux", ["has-session", "-t", target], { allowFailure: true });
  return result.code === 0;
}

export async function listSessions() {
  const result = await run(
    "tmux",
    ["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_created_string}"],
    { allowFailure: true },
  );

  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }

  return parseSessionsOutput(result.stdout);
}

export function parseSessionsOutput(output) {
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, windows, created = ""] = line.split("\t");
      return { name, windows: Number(windows), created };
    });
}

export function describeLaunchFailure({ exists, info, paneOutput }) {
  if (!exists) {
    return "wrapped command exited during launch before the tmux session became available";
  }

  if (info?.dead) {
    const exitSuffix =
      typeof info.exitStatus === "number" ? ` (exit status ${info.exitStatus})` : "";
    const lines = String(paneOutput || "")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const tail = lines.slice(-3).join("\n");
    return [
      `wrapped command exited during launch${exitSuffix}`,
      tail ? `Last output:\n\n${tail}\n\n` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

async function verifySessionLaunch(
  name,
  {
    timeoutMs = 2200,
    pollIntervalMs = 75,
    stableDurationMs = 1200,
    killOnFailure = false,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastExists = false;
  let lastInfo = null;
  let lastPaneOutput = "";
  let stableSince = null;

  while (Date.now() < deadline) {
    lastExists = await hasSession(name);
    if (lastExists) {
      lastInfo = await getSessionInfo(name);
      if (lastInfo.dead) {
        try {
          lastPaneOutput = await capturePane(name, 80);
        } catch {
          // ignore capture failures during launch checks
        }

        const failure = describeLaunchFailure({
          exists: lastExists,
          info: lastInfo,
          paneOutput: lastPaneOutput,
        });

        if (killOnFailure) {
          await killSession(name);
        }
        throw new Error(failure || "wrapped command exited during launch");
      }

      if (stableSince == null) {
        stableSince = Date.now();
      }

      if (Date.now() - stableSince >= stableDurationMs) {
        return;
      }
    } else {
      stableSince = null;
    }

    await sleep(pollIntervalMs);
  }

  const failure = describeLaunchFailure({
    exists: lastExists,
    info: lastInfo,
    paneOutput: lastPaneOutput,
  });

  if (!failure) {
    return;
  }

  if (killOnFailure) {
    await killSession(name);
  }
  throw new Error(failure);
}

export async function createSession({ name, cwd, command, cols = 120, rows = 40 }) {
  const args = [
    "new-session",
    "-d",
    "-s",
    name,
    "-x",
    String(cols),
    "-y",
    String(rows),
  ];

  if (cwd) {
    args.push("-c", cwd);
  }

  args.push(...command);

  await run("tmux", args);
  await run("tmux", ["set-option", "-t", name, "history-limit", "50000"]);
  await run("tmux", ["set-option", "-t", name, "remain-on-exit", "on"]);
  await verifySessionLaunch(name, { killOnFailure: true });
}

function rewordLaunchFailureForRestart(message) {
  return String(message || "wrapped command exited after restart")
    .replace(
      "during launch before the tmux session became available",
      "after restart before the tmux session became available",
    )
    .replace("during launch", "after restart");
}

export async function capturePane(target, lines = 2000) {
  const { stdout } = await run("tmux", [
    "capture-pane",
    "-e",
    "-p",
    "-J",
    "-S",
    `-${lines}`,
    "-t",
    target,
  ]);

  return normalizeCapturedPane(stdout);
}

export async function getSessionInfo(target) {
  const { stdout } = await run("tmux", [
    "display-message",
    "-p",
    "-t",
    target,
    [
      "#{session_name}",
      "#{pane_dead}",
      "#{pane_current_command}",
      "#{pane_dead_status}",
      "#{window_width}",
      "#{window_height}",
      "#{pane_title}",
    ].join("\t"),
  ]);

  const [name, dead, currentCommand, exitStatus, width, height, title] = stdout.trimEnd().split("\t");

  return {
    name,
    dead: dead === "1",
    currentCommand,
    exitStatus: exitStatus === "" ? null : Number(exitStatus),
    width: Number(width),
    height: Number(height),
    title,
  };
}

export async function sendText(target, text) {
  if (!text) {
    return;
  }

  await run("tmux", ["load-buffer", "-"], { input: text });
  await run("tmux", ["paste-buffer", "-d", "-t", target]);
}

export async function sendKey(target, key) {
  await run("tmux", ["send-keys", "-t", target, key]);
}

export async function attachSession(target) {
  const env = { ...process.env };
  delete env.TMUX;
  if (!env.TERM || env.TERM === "dumb") {
    env.TERM = "xterm-256color";
  }

  return new Promise((resolve, reject) => {
    const child = spawn("tmux", ["attach-session", "-t", target], {
      stdio: ["inherit", "inherit", "pipe"],
      env,
    });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ code, signal });
        return;
      }

      const error = new Error(
        stderr.trim()
          || (signal
            ? `tmux attach-session terminated with signal ${signal}`
            : `tmux attach-session exited with code ${code}`),
      );
      error.code = code;
      error.signal = signal;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function resizeSession(target, cols, rows) {
  await run("tmux", ["resize-window", "-t", target, "-x", String(cols), "-y", String(rows)]);
}

export async function respawnSession(target, { killExisting = false } = {}) {
  const args = ["respawn-pane"];
  if (killExisting) {
    args.push("-k");
  }
  args.push("-t", target);

  await run("tmux", args);

  try {
    await verifySessionLaunch(target);
  } catch (error) {
    throw new Error(rewordLaunchFailureForRestart(error?.message));
  }
}

export async function killSession(target) {
  await run("tmux", ["kill-session", "-t", target], { allowFailure: true });
}
