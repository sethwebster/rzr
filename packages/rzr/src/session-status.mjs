import { randomBytes } from "node:crypto";

export const DEFAULT_SIGNAL_IDLE_THRESHOLD_MS = 60 * 1000;
export const DEFAULT_STATUS_STALE_AFTER_MS = 30 * 1000;

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const INPUT_REQUEST_PATTERNS = [
  /\[[yYnN](?:\/[yYnN])?\]\s*$/i,
  /\((?:y|n|yes|no)(?:\/(?:y|n|yes|no))+\)\s*$/i,
  /(?:password|passphrase|otp|token|code|pin|username|email|input|selection|choice)\s*:\s*$/i,
  /(?:continue|proceed|overwrite|replace|delete|remove|confirm)\?\s*$/i,
  /press any key/i,
];

function stripAnsi(text = "") {
  return String(text).replace(OSC_PATTERN, "").replace(ANSI_PATTERN, "");
}

function getLastNonEmptyLine(text = "") {
  const normalized = stripAnsi(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  return normalized.length > 0 ? normalized[normalized.length - 1] : "";
}

function toIso(timestamp) {
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : null;
}

function normalizeIso(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function buildStatusSignature(status) {
  return JSON.stringify({
    confidence: status.confidence,
    transport: {
      state: status.transport.state,
      source: status.transport.source,
      missedHeartbeats: status.transport.missedHeartbeats,
    },
    runtime: status.runtime,
    activity: status.activity,
    evidence: status.evidence,
  });
}

function deriveRuntimeStatus(snapshot, { readonly = false } = {}) {
  const info = snapshot?.info || {};

  if (info.missing) {
    return {
      state: "missing",
      exitStatus: typeof info.exitStatus === "number" ? info.exitStatus : null,
      paneAlive: false,
    };
  }

  if (info.dead) {
    return {
      state: "exited",
      exitStatus: typeof info.exitStatus === "number" ? info.exitStatus : null,
      paneAlive: false,
    };
  }

  if (readonly) {
    return {
      state: "readonly",
      exitStatus: typeof info.exitStatus === "number" ? info.exitStatus : null,
      paneAlive: true,
    };
  }

  return {
    state: "present",
    exitStatus: typeof info.exitStatus === "number" ? info.exitStatus : null,
    paneAlive: true,
  };
}

function getObserverActivityState(observer) {
  const state = observer?.activity?.state ?? observer?.state ?? null;
  return typeof state === "string" ? state : null;
}

function getObserverPromptText(observer) {
  const value = observer?.activity?.promptText ?? observer?.promptText ?? null;
  return typeof value === "string" && value.trim() ? value : null;
}

function getObserverTimestamp(observer, ...candidates) {
  for (const candidate of candidates) {
    const timestamp = normalizeIso(candidate);
    if (timestamp) {
      return timestamp;
    }
  }

  return null;
}

function hasAuthoritativeObserverActivity(observer) {
  const activityState = getObserverActivityState(observer);
  return Boolean(
    observer?.altScreen?.active
    || observer?.command?.active
    || (activityState && activityState !== "unknown"),
  );
}

function deriveActivityStatus(snapshot) {
  const info = snapshot?.info || {};
  const idle = Boolean(snapshot?.signals?.idle?.isIdle);
  const awaitingInput = Boolean(snapshot?.signals?.input?.waiting);
  const promptText = snapshot?.signals?.input?.prompt ?? null;
  const observer = snapshot?.observer || null;
  const observerActivityState = getObserverActivityState(observer);

  if (info.missing || info.dead) {
    return {
      state: "unknown",
      promptText: null,
    };
  }

  if (observer?.altScreen?.active || observerActivityState === "interactive_program") {
    return {
      state: "interactive_program",
      promptText: null,
    };
  }

  if (observerActivityState === "awaiting_input") {
    return {
      state: "awaiting_input",
      promptText: getObserverPromptText(observer),
    };
  }

  if (observerActivityState === "at_prompt") {
    return {
      state: "at_prompt",
      promptText: getObserverPromptText(observer),
    };
  }

  if (observer?.command?.active || observerActivityState === "running_foreground") {
    return {
      state: "running_foreground",
      promptText: null,
    };
  }

  if (observerActivityState === "idle") {
    return {
      state: "idle",
      promptText: null,
    };
  }

  if (awaitingInput) {
    return {
      state: "awaiting_input",
      promptText,
    };
  }

  if (!info.currentCommand || info.currentCommand === "loading") {
    return {
      state: "unknown",
      promptText: null,
    };
  }

  if (idle) {
    return {
      state: "idle",
      promptText: null,
    };
  }

  return {
    state: "running_foreground",
    promptText: null,
  };
}

function deriveConfidence({ runtime, activity, evidence }) {
  if (runtime.state === "missing" || runtime.state === "exited" || runtime.state === "readonly") {
    return "high";
  }

  if (activity.state === "awaiting_input") {
    if (evidence.promptHook) return "high";
    if (evidence.screenHeuristic) return "low";
    return "medium";
  }

  if (activity.state === "at_prompt") {
    if (evidence.promptHook) return "high";
    return evidence.processState ? "medium" : "low";
  }

  if (activity.state === "interactive_program") {
    return evidence.processState ? "medium" : "low";
  }

  if (activity.state === "unknown") {
    return "low";
  }

  if (activity.state === "idle" || activity.state === "running_foreground") {
    return evidence.processState ? "medium" : "low";
  }

  return "medium";
}

export function createSessionStatusEpoch(prefix = "session") {
  return `${prefix}:${Date.now()}:${randomBytes(4).toString("hex")}`;
}

export function detectWaitingForInput(screen = "") {
  const lastLine = getLastNonEmptyLine(screen);
  if (!lastLine) {
    return { waiting: false, prompt: null };
  }

  const waiting =
    INPUT_REQUEST_PATTERNS.some((pattern) => pattern.test(lastLine))
    || (/[:?]\s*$/.test(lastLine) && !/[#$%>] $/.test(lastLine))
    || /(enter|type|paste).*(below|now|value)?\s*$/i.test(lastLine);

  return {
    waiting,
    prompt: waiting ? lastLine : null,
  };
}

export function buildSessionSignals({
  screen,
  lastInteractionAt,
  lastScreenChangeAt,
  idleThresholdMs = DEFAULT_SIGNAL_IDLE_THRESHOLD_MS,
}) {
  const now = Date.now();
  const lastActiveAt = Math.max(lastInteractionAt, lastScreenChangeAt);
  const idleForMs = Math.max(0, now - lastActiveAt);
  const input = detectWaitingForInput(screen);

  return {
    idle: {
      isIdle: idleForMs >= idleThresholdMs,
      idleForMs,
      thresholdMs: idleThresholdMs,
      lastInteractionAt,
      lastScreenChangeAt,
    },
    input,
  };
}

export function observeSessionStatus(
  previousStatus,
  snapshot,
  {
    readonly = false,
    epoch = previousStatus?.epoch || createSessionStatusEpoch(),
    observedAt = Date.now(),
    staleAfterMs = DEFAULT_STATUS_STALE_AFTER_MS,
    evidence = {},
  } = {},
) {
  const observedAtIso = toIso(observedAt) ?? new Date().toISOString();
  const runtime = deriveRuntimeStatus(snapshot, { readonly });
  const activity = deriveActivityStatus(snapshot);
  const signalState = snapshot?.signals?.idle ?? null;
  const info = snapshot?.info || {};
  const observer = snapshot?.observer || null;
  const observerActivityState = getObserverActivityState(observer);
  const observerPromptHook = observerActivityState === "awaiting_input" || observerActivityState === "at_prompt";
  const observerProcessState = Boolean(
    observer?.command?.active
    || observerActivityState === "running_foreground"
    || observerActivityState === "interactive_program",
  );
  const mergedEvidence = {
    promptHook: Boolean(evidence.promptHook || observerPromptHook),
    processState:
      evidence.processState ?? observerProcessState ?? Boolean(
        runtime.state !== "present"
        || (info.currentCommand && info.currentCommand !== "loading"),
      ),
    screenHeuristic:
      evidence.screenHeuristic
      ?? (hasAuthoritativeObserverActivity(observer)
        ? false
        : Boolean(snapshot?.signals?.input?.waiting)),
    transportHeartbeat: Boolean(evidence.transportHeartbeat),
  };

  const status = {
    epoch,
    seq: 1,
    observedAt: observedAtIso,
    staleAfter: new Date(observedAt + staleAfterMs).toISOString(),
    confidence: "medium",
    transport: {
      state: "online",
      source: "direct",
      lastHeartbeatAt: observedAtIso,
      missedHeartbeats: 0,
    },
    runtime,
    activity: {
      state: activity.state,
      promptText: activity.promptText,
      lastInputAt: getObserverTimestamp(
        observer,
        observer?.activity?.lastInputAt,
        observer?.lastInputAt,
        observer?.lastPromptAt,
        toIso(signalState?.lastInteractionAt),
      ),
      lastOutputAt: getObserverTimestamp(
        observer,
        observer?.activity?.lastOutputAt,
        observer?.lastOutputAt,
        toIso(signalState?.lastScreenChangeAt),
      ),
      lastScreenChangeAt: getObserverTimestamp(
        observer,
        observer?.activity?.lastOutputAt,
        observer?.lastOutputAt,
        toIso(signalState?.lastScreenChangeAt),
      ),
    },
    evidence: mergedEvidence,
  };

  status.confidence = deriveConfidence({
    runtime,
    activity: status.activity,
    evidence: mergedEvidence,
  });

  if (previousStatus?.epoch === epoch) {
    const previousSignature = buildStatusSignature(previousStatus);
    const nextSignature = buildStatusSignature(status);
    status.seq = previousSignature === nextSignature
      ? previousStatus.seq
      : previousStatus.seq + 1;
  }

  return status;
}

export function buildLegacySessionSummary(status, snapshot, { readonly = false } = {}) {
  const info = snapshot?.info || {};

  let state = "connecting";
  if (status?.runtime?.state === "missing") {
    state = "missing";
  } else if (status?.runtime?.state === "exited") {
    state = "exited";
  } else if (readonly || status?.runtime?.state === "readonly") {
    state = "readonly";
  } else if (!info.currentCommand || info.currentCommand === "loading") {
    state = "connecting";
  } else if (status?.activity?.state === "idle") {
    state = "idle";
  } else {
    state = "live";
  }

  return {
    state,
    awaitingInput: status?.activity?.state === "awaiting_input",
    prompt: status?.activity?.promptText ?? null,
    idle: snapshot?.signals?.idle ?? null,
    revision: typeof snapshot?.revision === "number" ? snapshot.revision : 0,
  };
}

export function buildHeuristicSessionStatus(snapshot, { readonly = false } = {}) {
  return observeSessionStatus(null, {
    ...snapshot,
    observer: null,
  }, {
    readonly,
    observedAt: Date.now(),
    evidence: {
      promptHook: false,
      processState: Boolean(snapshot?.info?.currentCommand && snapshot.info.currentCommand !== "loading"),
      screenHeuristic: Boolean(snapshot?.signals?.input?.waiting),
      transportHeartbeat: false,
    },
  });
}

export function buildStatusComparison(status, snapshot, { readonly = false } = {}) {
  const heuristicStatus = buildHeuristicSessionStatus(snapshot, { readonly });
  const authoritativeSummary = buildLegacySessionSummary(status, snapshot, { readonly });
  const heuristicSummary = buildLegacySessionSummary(heuristicStatus, snapshot, { readonly });

  return {
    heuristicStatus,
    heuristicSummary,
    mismatch: {
      any:
        authoritativeSummary.state !== heuristicSummary.state
        || authoritativeSummary.awaitingInput !== heuristicSummary.awaitingInput
        || status?.activity?.state !== heuristicStatus.activity.state
        || status?.confidence !== heuristicStatus.confidence,
      summaryState: authoritativeSummary.state !== heuristicSummary.state,
      awaitingInput: authoritativeSummary.awaitingInput !== heuristicSummary.awaitingInput,
      activityState: status?.activity?.state !== heuristicStatus.activity.state,
      confidence: status?.confidence !== heuristicStatus.confidence,
    },
  };
}
