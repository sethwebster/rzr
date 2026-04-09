import type { TerminalSession } from '@/types/session';

export function syncRzrHomeWidget(_activeSession: TerminalSession | null, _sessions: TerminalSession[]) {
  // Widgets are iOS-only.
}

export function syncRzrActiveSessionsWidget(_sessions: TerminalSession[]) {
  // Widgets are iOS-only.
}

export async function endAllRzrSessionLiveActivities() {
  // Live Activities are iOS-only.
}

export async function syncRzrSessionLiveActivity(_hasSessions: boolean) {
  // Live Activities are iOS-only.
}
