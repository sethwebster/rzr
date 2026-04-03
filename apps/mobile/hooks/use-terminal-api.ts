import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';

function extractTokens(url: string) {
  try {
    const u = new URL(url);
    return {
      base: u.origin,
      token: u.searchParams.get('token') ?? undefined,
      auth: u.searchParams.get('auth') ?? undefined,
    };
  } catch {
    return { base: url, token: undefined, auth: undefined };
  }
}

function buildHeaders(token?: string, auth?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['x-rzr-token'] = token;
  if (auth) h['x-rzr-auth'] = auth;
  return h;
}

export function useTerminalApi(sessionUrl: string, token?: string, auth?: string) {
  const { base, token: urlToken, auth: urlAuth } = useMemo(
    () => extractTokens(sessionUrl),
    [sessionUrl],
  );

  const headers = useMemo(
    () => buildHeaders(token ?? urlToken, auth ?? urlAuth),
    [token, urlToken, auth, urlAuth],
  );

  const sendInput = useCallback(
    async (text: string, pressEnter: boolean) => {
      if (!text.trim()) return;
      try {
        await fetch(`${base}/api/input`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text }),
        });
        if (pressEnter) {
          await fetch(`${base}/api/key`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key: 'Enter' }),
          });
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        return true;
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
        return false;
      }
    },
    [base, headers],
  );

  const pressKey = useCallback(
    async (key: string) => {
      try {
        await fetch(`${base}/api/key`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ key }),
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => null);
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      }
    },
    [base, headers],
  );

  const validateSession = useCallback(async () => {
    const res = await fetch(`${base}/api/session`, { headers });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  }, [base, headers]);

  return { sendInput, pressKey, validateSession };
}
