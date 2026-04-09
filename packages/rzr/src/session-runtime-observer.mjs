import { randomBytes } from "node:crypto";

export const SESSION_RUNTIME_OBSERVER_EVENT_TYPES = Object.freeze([
  "prompt-ready",
  "command-start",
  "command-finish",
  "input-requested",
  "output-seen",
  "alt-screen-enter",
  "alt-screen-exit",
  "runtime-close",
]);

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

function normalizePromptText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCommandName(event = {}) {
  const value = event.command ?? event.commandName ?? event.currentCommand ?? null;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEventType(event = {}) {
  if (!event || typeof event !== "object") {
    return null;
  }

  if (event.type === "notification") {
    if (event.name === "output" || event.name === "extended-output") {
      return "output-seen";
    }

    if (SESSION_RUNTIME_OBSERVER_EVENT_TYPES.includes(event.name)) {
      return event.name;
    }
  }

  if (event.type === "close") {
    return "runtime-close";
  }

  if (SESSION_RUNTIME_OBSERVER_EVENT_TYPES.includes(event.type)) {
    return event.type;
  }

  if (typeof event.name === "string" && SESSION_RUNTIME_OBSERVER_EVENT_TYPES.includes(event.name)) {
    return event.name;
  }

  return null;
}

function createBaseState(epoch, observedAtIso) {
  return {
    epoch,
    seq: 0,
    observedAt: observedAtIso,
    lastEventAt: null,
    lastEventType: null,
    activity: {
      state: "unknown",
      promptText: null,
      lastInputAt: null,
      lastOutputAt: null,
      lastEventAt: null,
    },
    command: {
      active: false,
      name: null,
      startedAt: null,
      finishedAt: null,
      exitStatus: null,
    },
    altScreen: {
      active: false,
      enteredAt: null,
      exitedAt: null,
    },
    runtime: {
      closedAt: null,
    },
    lastEvent: null,
  };
}

function cloneState(state) {
  return {
    ...state,
    activity: { ...state.activity },
    command: { ...state.command },
    altScreen: { ...state.altScreen },
    runtime: { ...state.runtime },
    lastEvent: state.lastEvent ? { ...state.lastEvent } : null,
  };
}

function buildStateSignature(state) {
  return JSON.stringify({
    lastEventType: state.lastEventType,
    activity: state.activity,
    command: state.command,
    altScreen: state.altScreen,
    runtime: state.runtime,
  });
}

export function createSessionRuntimeObserverEpoch(prefix = "observer") {
  return `${prefix}:${Date.now()}:${randomBytes(4).toString("hex")}`;
}

export function normalizeSessionRuntimeObserverEvent(event = {}) {
  const type = normalizeEventType(event);
  if (!type) {
    return null;
  }

  return {
    type,
    observedAt:
      normalizeIso(event.observedAt)
      ?? normalizeIso(event.timestamp)
      ?? normalizeIso(event.at)
      ?? null,
    promptText: normalizePromptText(event.promptText ?? event.prompt ?? event.text),
    command: normalizeCommandName(event),
    exitStatus: typeof event.exitStatus === "number" ? event.exitStatus : null,
  };
}

export function createSessionRuntimeObserverState({
  epoch = createSessionRuntimeObserverEpoch(),
  observedAt = Date.now(),
} = {}) {
  const observedAtIso = toIso(observedAt) ?? new Date().toISOString();
  return createBaseState(epoch, observedAtIso);
}

export function observeSessionRuntimeEvent(
  previousState,
  event,
  {
    epoch = previousState?.epoch || createSessionRuntimeObserverEpoch(),
    observedAt = Date.now(),
  } = {},
) {
  const normalizedEvent = normalizeSessionRuntimeObserverEvent(event);
  const observedAtIso = normalizedEvent?.observedAt ?? toIso(observedAt) ?? new Date().toISOString();
  const nextState = previousState?.epoch === epoch
    ? cloneState(previousState)
    : createBaseState(epoch, observedAtIso);

  nextState.epoch = epoch;
  nextState.observedAt = observedAtIso;

  if (!normalizedEvent) {
    return nextState;
  }

  nextState.lastEventAt = observedAtIso;
  nextState.lastEventType = normalizedEvent.type;
  nextState.activity.lastEventAt = observedAtIso;
  nextState.lastEvent = {
    type: normalizedEvent.type,
    observedAt: observedAtIso,
    promptText: normalizedEvent.promptText,
    command: normalizedEvent.command,
    exitStatus: normalizedEvent.exitStatus,
  };

  switch (normalizedEvent.type) {
    case "prompt-ready":
      nextState.command.active = false;
      nextState.command.finishedAt ||= observedAtIso;
      nextState.altScreen.active = false;
      nextState.altScreen.exitedAt = observedAtIso;
      nextState.activity.state = "at_prompt";
      nextState.activity.promptText = normalizedEvent.promptText;
      nextState.activity.lastInputAt = observedAtIso;
      break;
    case "input-requested":
      nextState.activity.state = "awaiting_input";
      nextState.activity.promptText = normalizedEvent.promptText;
      nextState.activity.lastInputAt = observedAtIso;
      break;
    case "command-start":
      nextState.command.active = true;
      nextState.command.name = normalizedEvent.command;
      nextState.command.startedAt = observedAtIso;
      nextState.command.finishedAt = null;
      nextState.command.exitStatus = null;
      nextState.activity.state = nextState.altScreen.active ? "interactive_program" : "running_foreground";
      nextState.activity.promptText = null;
      break;
    case "command-finish":
      nextState.command.active = false;
      if (normalizedEvent.command) {
        nextState.command.name = normalizedEvent.command;
      }
      nextState.command.finishedAt = observedAtIso;
      nextState.command.exitStatus = normalizedEvent.exitStatus;
      if (normalizedEvent.promptText) {
        nextState.activity.state = "at_prompt";
        nextState.activity.promptText = normalizedEvent.promptText;
        nextState.activity.lastInputAt = observedAtIso;
      } else {
        nextState.activity.state = nextState.altScreen.active ? "interactive_program" : "unknown";
        nextState.activity.promptText = null;
      }
      break;
    case "output-seen":
      nextState.activity.lastOutputAt = observedAtIso;
      if (nextState.altScreen.active) {
        nextState.activity.state = "interactive_program";
        nextState.activity.promptText = null;
      } else if (nextState.command.active) {
        nextState.activity.state = "running_foreground";
        nextState.activity.promptText = null;
      }
      break;
    case "alt-screen-enter":
      nextState.altScreen.active = true;
      nextState.altScreen.enteredAt = observedAtIso;
      nextState.activity.state = "interactive_program";
      nextState.activity.promptText = null;
      break;
    case "alt-screen-exit":
      nextState.altScreen.active = false;
      nextState.altScreen.exitedAt = observedAtIso;
      nextState.activity.state = nextState.command.active ? "running_foreground" : "unknown";
      nextState.activity.promptText = null;
      break;
    case "runtime-close":
      nextState.runtime.closedAt = observedAtIso;
      nextState.command.active = false;
      if (normalizedEvent.exitStatus != null) {
        nextState.command.exitStatus = normalizedEvent.exitStatus;
      }
      nextState.altScreen.active = false;
      nextState.activity.state = "unknown";
      nextState.activity.promptText = null;
      break;
    default:
      break;
  }

  const previousSignature = previousState?.epoch === epoch
    ? buildStateSignature(previousState)
    : null;
  const nextSignature = buildStateSignature(nextState);
  if (previousSignature && previousSignature === nextSignature) {
    nextState.seq = previousState.seq;
  } else if (previousState?.epoch === epoch) {
    nextState.seq = previousState.seq + 1;
  } else {
    nextState.seq = 1;
  }

  return nextState;
}
