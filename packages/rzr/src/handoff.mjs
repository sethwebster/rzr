// PORT HANDOFF STRATEGY: SO_REUSEPORT
//
// We use SO_REUSEPORT (Node's reusePort option) so the new process can bind
// the same port while the old process is still listening. This creates a
// ~100ms window where in-flight requests may fail and SSE/WS connections drop.
//
// macOS caveat: SO_REUSEPORT behavior differs from Linux. If reusePort fails
// (EADDRINUSE), we fall back to a retry loop (5 attempts, 200ms apart) to
// wait for the old process to release the port.
//
// Why not fd passing: adds ~80 LOC of platform-specific code for marginal
// benefit. Mobile app and web UI already handle reconnects gracefully.
//
// Revisit if: we need guaranteed zero-downtime for long-running streams.

import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HANDOFF_PREFIX = "rzr-handoff-";
const SENTINEL_PREFIX = "rzr-handoff-ready-";
const HMAC_SEPARATOR = "\n---HMAC---\n";
const STALE_THRESHOLD_MS = 60 * 1000;

function hmac(content, secret) {
  return createHmac("sha256", secret).update(content).digest("hex");
}

export function serializeHandoff(state, secret) {
  const content = JSON.stringify(state, null, 2);
  const signature = hmac(content, secret);
  const filePath = join(tmpdir(), `${HANDOFF_PREFIX}${process.pid}.json`);
  writeFileSync(filePath, content + HMAC_SEPARATOR + signature, { mode: 0o600 });
  return filePath;
}

export function consumeHandoff(filePath, secret) {
  const raw = readFileSync(filePath, "utf8");
  const separatorIndex = raw.lastIndexOf(HMAC_SEPARATOR);

  if (separatorIndex === -1) {
    unlinkSync(filePath);
    throw new Error("handoff file missing HMAC signature");
  }

  const content = raw.slice(0, separatorIndex);
  const signature = raw.slice(separatorIndex + HMAC_SEPARATOR.length).trim();
  const expected = hmac(content, secret);

  if (signature !== expected) {
    unlinkSync(filePath);
    throw new Error("handoff file HMAC verification failed");
  }

  unlinkSync(filePath);
  return JSON.parse(content);
}

export function writeHandoffSentinel(pid) {
  const filePath = join(tmpdir(), `${SENTINEL_PREFIX}${pid}`);
  writeFileSync(filePath, String(Date.now()), { mode: 0o600 });
  return filePath;
}

export function waitForHandoffSentinel(pid, timeoutMs = 5000) {
  const filePath = join(tmpdir(), `${SENTINEL_PREFIX}${pid}`);

  return new Promise((resolve) => {
    const start = Date.now();

    const interval = setInterval(() => {
      try {
        statSync(filePath);
        clearInterval(interval);
        try { unlinkSync(filePath); } catch {}
        resolve(true);
      } catch {
        if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }
    }, 200);
  });
}

export function cleanupStaleHandoff() {
  const dir = tmpdir();
  const now = Date.now();

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(HANDOFF_PREFIX) && !entry.startsWith(SENTINEL_PREFIX)) {
      continue;
    }

    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (now - stat.mtimeMs > STALE_THRESHOLD_MS) {
        unlinkSync(fullPath);
      }
    } catch {}
  }
}

const LOCK_FILE = join(tmpdir(), "rzr-update.lock");

export function acquireUpdateLock() {
  try {
    const stat = statSync(LOCK_FILE);
    if (Date.now() - stat.mtimeMs > STALE_THRESHOLD_MS) {
      unlinkSync(LOCK_FILE);
    } else {
      return false;
    }
  } catch {}

  try {
    writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function releaseUpdateLock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {}
}
