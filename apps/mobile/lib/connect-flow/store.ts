import { connectFlowInitialState, connectFlowScript } from '@/lib/connect-flow/script';
import {
  type ConnectDraft,
  type ConnectFlowContext,
  type ConnectFlowEvent,
  type ConnectFlowSnapshot,
  type ConnectFlowStateId,
} from '@/lib/connect-flow/types';

function cloneContext(context: ConnectFlowContext): ConnectFlowContext {
  return {
    ...context,
    draft: { ...context.draft },
    pendingConnection: context.pendingConnection
      ? { ...context.pendingConnection }
      : null,
    resolvedConnection: context.resolvedConnection
      ? { ...context.resolvedConnection }
      : null,
  };
}

export class ConnectFlowStore {
  private listeners = new Set<() => void>();
  private state: ConnectFlowStateId = connectFlowInitialState;
  private context: ConnectFlowContext;
  private snapshot: ConnectFlowSnapshot;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(initialDraft: ConnectDraft) {
    this.context = {
      ready: false,
      error: null,
      draft: initialDraft,
      pendingConnection: null,
      resolvedConnection: null,
      connectionStatus: 'idle',
      requestNonce: 0,
      phaseStartedAt: Date.now(),
    };
    this.applyEnter(this.state);
    this.snapshot = this.buildSnapshot();
    this.scheduleAfter();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConnectFlowSnapshot => this.snapshot;

  send = (event: ConnectFlowEvent) => {
    if (event.type === 'RESET') {
      this.transition('chooser', {
        error: null,
        pendingConnection: null,
        resolvedConnection: null,
        connectionStatus: 'idle',
        phaseStartedAt: Date.now(),
      });
      return;
    }

    const current = connectFlowScript[this.state];
    const transition = current.on?.[event.type];
    if (!transition) return;

    const partial = transition.reduce?.(this.context, event) ?? {};
    this.transition(transition.target, partial);
  };

  destroy() {
    this.clearTimer();
    this.listeners.clear();
  }

  private transition(target: ConnectFlowStateId, partial: Partial<ConnectFlowContext> = {}) {
    this.clearTimer();
    this.state = target;
    this.context = {
      ...this.context,
      ...partial,
      draft: partial.draft ? partial.draft : this.context.draft,
      pendingConnection:
        partial.pendingConnection !== undefined
          ? partial.pendingConnection
          : this.context.pendingConnection,
      resolvedConnection:
        partial.resolvedConnection !== undefined
          ? partial.resolvedConnection
          : this.context.resolvedConnection,
    };
    this.applyEnter(target);
    this.snapshot = this.buildSnapshot();
    this.emit();
    this.scheduleAfter();
  }

  private applyEnter(state: ConnectFlowStateId) {
    const next = connectFlowScript[state].onEnter?.(this.context);
    if (!next) return;
    this.context = {
      ...this.context,
      ...next,
      draft: next.draft ? next.draft : this.context.draft,
      pendingConnection:
        next.pendingConnection !== undefined
          ? next.pendingConnection
          : this.context.pendingConnection,
      resolvedConnection:
        next.resolvedConnection !== undefined
          ? next.resolvedConnection
          : this.context.resolvedConnection,
    };
  }

  private scheduleAfter() {
    const after = connectFlowScript[this.state].after;
    if (!after) return;

    this.timer = setTimeout(() => {
      const snapshot = this.getSnapshot();
      const target =
        typeof after.target === 'function' ? after.target(snapshot) : after.target;
      if (!target) return;
      this.transition(target);
    }, after.delayMs);
  }

  private buildSnapshot(): ConnectFlowSnapshot {
    return {
      state: this.state,
      context: cloneContext(this.context),
      visual: connectFlowScript[this.state].visual,
    };
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
