import { useEffect } from 'react';

import {
  endAllRzrSessionLiveActivities,
  syncRzrActiveSessionsWidget,
  syncRzrHomeWidget,
  syncRzrSessionLiveActivity,
} from '@/lib/widgets/rzr-widget-bridge';
import { type TerminalSession } from '@/types/session';

function reportSyncError(scope: string, error: unknown) {
  if (!__DEV__) return;
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[rzr-live-activity] ${scope}: ${reason}`);
}

export function useRzrHomeWidgetSync(
  hydrated: boolean,
  activeSession: TerminalSession | null,
  sessions: TerminalSession[],
) {
  useEffect(() => {
    if (!hydrated) return;
    syncRzrHomeWidget(activeSession, sessions);
  }, [hydrated, activeSession, sessions]);
}

export function useRzrActiveSessionsWidgetSync(
  hydrated: boolean,
  sessions: TerminalSession[],
) {
  useEffect(() => {
    if (!hydrated) return;
    syncRzrActiveSessionsWidget(sessions);
  }, [hydrated, sessions]);
}

export function useRzrLiveActivitySync(
  hydrated: boolean,
  sessions: TerminalSession[],
  liveActivityEnabled: boolean,
) {
  useEffect(() => {
    if (!hydrated) return;
    if (!liveActivityEnabled) {
      endAllRzrSessionLiveActivities().catch((error) => {
        reportSyncError('live activity cleanup failed', error);
      });
      return;
    }
    syncRzrSessionLiveActivity(sessions.length > 0).catch((error) => {
      reportSyncError('live activity sync failed', error);
    });
  }, [hydrated, sessions.length > 0, liveActivityEnabled]);
}
