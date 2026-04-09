import { EventEmitter } from "node:events";

import {
  capturePane as defaultCapturePane,
  getSessionInfo as defaultGetSessionInfo,
  resizeSession as defaultResizeSession,
  sendKey as defaultSendKey,
  sendText as defaultSendText,
} from "../tmux.mjs";
import { spawnTmuxControlMode } from "../tmux-control.mjs";

export function createTmuxSessionRuntime({
  target,
  socketName,
  cwd,
  controlFactory = spawnTmuxControlMode,
  capturePane = defaultCapturePane,
  getSessionInfo = defaultGetSessionInfo,
  resizeSession = defaultResizeSession,
  sendKey = defaultSendKey,
  sendText = defaultSendText,
} = {}) {
  if (!target) {
    throw new Error("target is required");
  }

  const emitter = new EventEmitter();
  let control = null;
  let unsubscribe = [];

  function wireControl(nextControl) {
    const forwardEvent = (event) => emitter.emit("event", event);
    const forwardError = (error) => emitter.emit("error", error);
    const forwardClose = (info) => {
      emitter.emit("close", info);
      control = null;
      unsubscribe = [];
    };

    nextControl.on("event", forwardEvent);
    nextControl.on("error", forwardError);
    nextControl.on("close", forwardClose);
    unsubscribe = [
      () => nextControl.off?.("event", forwardEvent),
      () => nextControl.off?.("error", forwardError),
      () => nextControl.off?.("close", forwardClose),
    ];
  }

  return {
    async connect({ cols, rows, pauseAfter } = {}) {
      if (control) {
        return control;
      }

      control = controlFactory({
        target,
        socketName,
        cwd,
      });
      wireControl(control);

      control.once?.("notification:session-changed", () => {
        if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
          control.resize(cols, rows);
        }
        if (Number.isFinite(pauseAfter) && pauseAfter > 0) {
          control.setPauseAfter(pauseAfter);
        }
      });

      return control;
    },

    async disconnect() {
      if (!control) {
        return;
      }

      const currentControl = control;
      control = null;
      for (const dispose of unsubscribe) {
        dispose();
      }
      unsubscribe = [];
      currentControl.detach?.();
    },

    isConnected() {
      return control != null;
    },

    getControl() {
      return control;
    },

    async snapshot(lines = 2000) {
      const [screen, info] = await Promise.all([
        capturePane(target, lines),
        getSessionInfo(target),
      ]);
      return { screen, info };
    },

    async write(text) {
      await sendText(target, text);
    },

    async pressKey(key) {
      await sendKey(target, key);
    },

    async resize(cols, rows) {
      if (control) {
        control.resize(cols, rows);
        return;
      }
      await resizeSession(target, cols, rows);
    },

    async setPauseAfter(seconds) {
      if (!control) {
        return;
      }
      control.setPauseAfter(seconds);
    },

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
  };
}
