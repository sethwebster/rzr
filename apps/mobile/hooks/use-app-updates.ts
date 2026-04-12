import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { toast } from '@/lib/toast';

const DISABLED = __DEV__ || !Updates.isEnabled;

const FALLBACK = {
  isChecking: false,
  isUpdatePending: false,
  message: 'Expo Updates only runs in a production-capable build.',
  runtimeVersion: Updates.runtimeVersion ?? 'dev',
  updateId: Updates.updateId ?? 'local',
  check: async () => {},
};

export function useAppUpdates() {
  if (DISABLED) return FALLBACK;
  return useAppUpdatesImpl();
}

function useAppUpdatesImpl() {
  const {
    currentlyRunning,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
  } = Updates.useUpdates();

  const toastFiredRef = useRef(false);
  const fetchTriggeredRef = useRef(false);

  useEffect(() => {
    if (isUpdateAvailable && !isUpdatePending && !isDownloading && !fetchTriggeredRef.current) {
      fetchTriggeredRef.current = true;
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdateAvailable, isUpdatePending, isDownloading]);

  useEffect(() => {
    if (isUpdatePending && !toastFiredRef.current) {
      toastFiredRef.current = true;
      toast.success('Update downloaded — restart to apply', {
        duration: Infinity,
      });
    }
  }, [isUpdatePending]);

  const check = useCallback(async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
    } catch {}
  }, []);

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
    check,
  };
}

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
