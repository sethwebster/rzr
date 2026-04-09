import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { createSessionId, getParamValue, normalizeUrlWithToken } from '@/lib/utils';
import { useSessionActions, useSessionList } from '@/hooks/use-session-data';
import { type SessionAccent } from '@/types/session';

export function useDeepLinkConnect(params: {
  label?: string;
  url?: string;
  token?: string;
  accent?: SessionAccent;
  passwordHint?: string;
}) {
  const { connectSession, activateSession } = useSessionActions();
  const { sessions } = useSessionList();
  const [error, setError] = useState<string | null>(null);

  const url = getParamValue(params.url);
  const label = getParamValue(params.label);
  const token = getParamValue(params.token);
  const accent = getParamValue(params.accent) as SessionAccent | undefined;
  const passwordHint = getParamValue(params.passwordHint);

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        if (!url) {
          throw new Error('Missing `url` in the incoming deep link.');
        }

        const candidateUrl = normalizeUrlWithToken(url, token);
        const candidateId = createSessionId(candidateUrl);
        const existing = sessions.find((s) => s.id === candidateId);

        const nextSessionId = existing
          ? existing.id
          : connectSession({
              label: label ?? 'Linked bridge',
              url,
              token,
              accent: accent ?? 'cyan',
              passwordHint,
              source: 'deep-link',
            }).id;

        if (existing) {
          activateSession(existing.id);
        }
        router.replace({
          pathname: '/(tabs)/sessions/[id]',
          params: { id: nextSessionId },
        });
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to open the session.',
        );
      }
    }, 420);

    return () => clearTimeout(timeout);
  }, [url, label, token, accent, passwordHint, connectSession, sessions, activateSession]);

  return { error };
}
