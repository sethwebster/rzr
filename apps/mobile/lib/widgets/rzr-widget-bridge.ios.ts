import RzrActiveSessionsWidget from '@/widgets/rzr-active-sessions-widget';
import RzrHomeWidget from '@/widgets/rzr-home-widget';
import RzrSessionActivity from '@/widgets/rzr-session-live-activity';
import {
  buildRzrActiveSessionsWidgetProps,
  buildRzrHomeWidgetProps,
  type RzrSessionLiveActivityProps,
} from '@/widgets/rzr-widget-contract';
import type { TerminalSession } from '@/types/session';
import type { LiveActivity } from 'expo-widgets';

let currentActivity: LiveActivity<RzrSessionLiveActivityProps> | null = null;
let syncInFlight = false;

const DESTINATION_URL = 'rzrmobile://sessions';

export function syncRzrHomeWidget(activeSession: TerminalSession | null, sessions: TerminalSession[]) {
  RzrHomeWidget.updateSnapshot(buildRzrHomeWidgetProps(activeSession, sessions));
}

export function syncRzrActiveSessionsWidget(sessions: TerminalSession[]) {
  RzrActiveSessionsWidget.updateSnapshot(buildRzrActiveSessionsWidgetProps(sessions));
}

export async function endAllRzrSessionLiveActivities() {
  const existingActivities = RzrSessionActivity.getInstances();
  await Promise.all(
    existingActivities.map((a) => a.end('immediate').catch(() => null)),
  );
  currentActivity = null;
}

export async function syncRzrSessionLiveActivity(hasSessions: boolean) {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    if (!hasSessions) {
      if (currentActivity) {
        await currentActivity.end('immediate').catch(() => null);
        currentActivity = null;
      }
      return;
    }

    // Already running — nothing to update in stripped mode
    if (currentActivity) return;

    // Clean stale activities from previous builds
    const stale = RzrSessionActivity.getInstances();
    if (stale.length > 0) {
      await Promise.all(stale.map((a) => a.end('immediate').catch(() => null)));
    }

    const props: RzrSessionLiveActivityProps = { destinationUrl: DESTINATION_URL };
    console.log(`[rzr-la] starting live activity (logo-only)`);
    currentActivity = RzrSessionActivity.start(props, DESTINATION_URL);
    console.log(`[rzr-la] live activity started`);
  } catch (error) {
    console.error(`[rzr-la] start failed`, error);
    currentActivity = null;
  } finally {
    syncInFlight = false;
  }
}
