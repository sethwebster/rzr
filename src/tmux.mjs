import { spawn } from "node:child_process";

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
}

export async function capturePane(target, lines = 2000) {
  const { stdout } = await run("tmux", [
    "capture-pane",
    "-p",
    "-J",
    "-S",
    `-${lines}`,
    "-t",
    target,
  ]);

  return stdout.replace(/\r/g, "");
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

export async function resizeSession(target, cols, rows) {
  await run("tmux", ["resize-window", "-t", target, "-x", String(cols), "-y", String(rows)]);
}

export async function killSession(target) {
  await run("tmux", ["kill-session", "-t", target], { allowFailure: true });
}
