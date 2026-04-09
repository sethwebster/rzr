import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

export function unescapeTmuxControlString(value = "") {
  return String(value).replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

export function parseControlModeLine(line = "") {
  const text = String(line).replace(/\r$/, "");

  if (!text.startsWith("%")) {
    return { type: "text", text };
  }

  const blockMatch = text.match(/^%(begin|end|error)\s+(\d+)\s+(\d+)\s+(\d+)$/);
  if (blockMatch) {
    return {
      type: "block",
      name: blockMatch[1],
      time: Number(blockMatch[2]),
      commandNumber: Number(blockMatch[3]),
      flags: Number(blockMatch[4]),
      raw: text,
    };
  }

  const extendedOutputMatch = text.match(/^%extended-output\s+(\S+)\s+(\d+)\s+:\s?(.*)$/);
  if (extendedOutputMatch) {
    return {
      type: "notification",
      name: "extended-output",
      paneId: extendedOutputMatch[1],
      lagMs: Number(extendedOutputMatch[2]),
      data: unescapeTmuxControlString(extendedOutputMatch[3]),
      raw: text,
    };
  }

  const outputMatch = text.match(/^%output\s+(\S+)\s?(.*)$/);
  if (outputMatch) {
    return {
      type: "notification",
      name: "output",
      paneId: outputMatch[1],
      data: unescapeTmuxControlString(outputMatch[2]),
      raw: text,
    };
  }

  const exitMatch = text.match(/^%exit(?:\s+(.*))?$/);
  if (exitMatch) {
    return {
      type: "notification",
      name: "exit",
      reason: exitMatch[1] ? unescapeTmuxControlString(exitMatch[1]) : "",
      raw: text,
    };
  }

  const firstSpace = text.indexOf(" ");
  const name = firstSpace === -1 ? text.slice(1) : text.slice(1, firstSpace);
  const argsText = firstSpace === -1 ? "" : text.slice(firstSpace + 1);

  return {
    type: "notification",
    name,
    argsText,
    args: argsText.length > 0 ? argsText.split(" ") : [],
    raw: text,
  };
}

export function createControlModeLineBuffer(onLine) {
  let pending = "";

  return {
    push(chunk) {
      pending += String(chunk);

      while (true) {
        const newlineIndex = pending.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }
        const line = pending.slice(0, newlineIndex);
        pending = pending.slice(newlineIndex + 1);
        onLine(line);
      }
    },
    finish() {
      if (pending.length > 0) {
        onLine(pending);
        pending = "";
      }
    },
  };
}

export function createControlModeEventParser(onEvent) {
  let activeBlock = null;
  const lineBuffer = createControlModeLineBuffer((line) => {
    const event = parseControlModeLine(line);

    if (activeBlock && !(event.type === "block" && (event.name === "end" || event.name === "error"))) {
      onEvent({
        type: "block-output",
        block: activeBlock,
        text: line,
        raw: line,
      });
      return;
    }

    onEvent(event);

    if (event.type === "block" && event.name === "begin") {
      activeBlock = event;
    } else if (event.type === "block" && (event.name === "end" || event.name === "error")) {
      activeBlock = null;
    }
  });

  return {
    push(chunk) {
      lineBuffer.push(chunk);
    },
    finish() {
      lineBuffer.finish();
    },
  };
}

export function spawnTmuxControlMode({
  target,
  socketName,
  cwd,
  tmuxPath = "tmux",
  controlMode = "-C",
} = {}) {
  if (!target) {
    throw new Error("target is required");
  }

  const args = [];
  if (socketName) {
    args.push("-L", socketName);
  }
  args.push(controlMode, "attach-session", "-t", target);

  const env = { ...process.env };
  delete env.TMUX;
  if (!env.TERM || env.TERM === "dumb") {
    env.TERM = "xterm-256color";
  }

  const child = spawn(tmuxPath, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const emitter = new EventEmitter();
  const stdoutBuffer = createControlModeEventParser((event) => {
    emitter.emit("event", event);
    emitter.emit(event.type, event);
    if (event.type === "notification") {
      emitter.emit(`notification:${event.name}`, event);
    }
    if (event.type === "block") {
      emitter.emit(`block:${event.name}`, event);
    }
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => stdoutBuffer.push(chunk));
  child.stdout.on("end", () => stdoutBuffer.finish());

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    emitter.emit("stderr", String(chunk));
  });

  child.on("error", (error) => {
    emitter.emit("error", error);
  });

  child.on("close", (code, signal) => {
    stdoutBuffer.finish();
    emitter.emit("close", { code, signal });
  });

  function sendCommand(command) {
    if (child.stdin.destroyed) {
      throw new Error("control mode stdin is closed");
    }
    child.stdin.write(String(command).replace(/\n+$/, "") + "\n");
  }

  function resize(cols, rows) {
    sendCommand(`refresh-client -C ${Number(cols)},${Number(rows)}`);
  }

  function setPauseAfter(seconds) {
    sendCommand(`refresh-client -f pause-after=${Number(seconds)}`);
  }

  function detach() {
    sendCommand("detach-client");
  }

  return {
    child,
    sendCommand,
    resize,
    setPauseAfter,
    detach,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
  };
}
