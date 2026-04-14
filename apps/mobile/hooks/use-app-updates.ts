import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { toast } from '@/lib/toast';

/**
 * Expo's recommended useUpdates() pattern.
 *
 * With checkAutomatically: 'ON_LOAD', the native layer checks on cold start.
 * This hook observes the lifecycle and shows a toast when an update downloads.
 *
 * We skip reloadAsync() because it triggers ErrorRecovery.crash() on iOS 26
 * beta — the update applies on next cold start instead.
 */
export function useAppUpdates() {
  const {
    currentlyRunning,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
  } = Updates.useUpdates();

  const toastFiredRef = useRef(false);

  // When the native layer finds an available update, download it
  useEffect(() => {
    if (isUpdateAvailable && !isUpdatePending && !isDownloading) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdateAvailable, isUpdatePending, isDownloading]);

  // When update is downloaded, notify user
  useEffect(() => {
    if (isUpdatePending && !toastFiredRef.current) {
      toastFiredRef.current = true;
      toast.success('Update downloaded — restart to apply', { duration: Infinity });
    }
  }, [isUpdatePending]);

  const message = isDownloading
    ? 'Downloading update…'
    : isUpdatePending
      ? 'Restart to apply update.'
      : isChecking
        ? 'Checking for updates…'
        : isUpdateAvailable
          ? 'Update available.'
          : 'You are on the latest build.';

  return {
    isChecking: isChecking || isDownloading,
    isUpdatePending,
    message,
    runtimeVersion: currentlyRunning.runtimeVersion ?? 'dev',
    updateId: currentlyRunning.updateId ?? 'local',
    check: async () => {
      if (__DEV__ || !Updates.isEnabled) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {}
    },
  };
}

/** Re-checks on each app foreground for updates published while backgrounded. */
export function useAutoCheckUpdates() {
  const { check } = useAppUpdates();
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') checkRef.current();
    });
    return () => sub.remove();
  }, []);
}
