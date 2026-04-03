import * as Updates from 'expo-updates';
import { useCallback, useMemo, useState } from 'react';

export function useAppUpdates() {
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [message, setMessage] = useState('No update check yet.');

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      setMessage('Expo Updates only runs in a production-capable build.');
      return;
    }

    setIsChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      setIsAvailable(result.isAvailable);
      setMessage(
        result.isAvailable
          ? 'A fresher build is ready.'
          : 'You are already on the sharpest build.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update check failed.');
    } finally {
      setIsChecking(false);
    }
  }, []);

  const apply = useCallback(async () => {
    if (!isAvailable || __DEV__ || !Updates.isEnabled) {
      return;
    }

    setIsApplying(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update apply failed.');
      setIsApplying(false);
    }
  }, [isAvailable]);

  return useMemo(
    () => ({
      check,
      apply,
      isChecking,
      isApplying,
      isAvailable,
      message,
      runtimeVersion: Updates.runtimeVersion ?? 'dev',
      updateId: Updates.updateId ?? 'local',
    }),
    [check, apply, isChecking, isApplying, isAvailable, message],
  );
}
