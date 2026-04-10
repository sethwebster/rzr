import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { verifyConnection } from '@/lib/connect-flow/connection';
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
  const { connectSession } = useSessionActions();
  const { sessions } = useSessionList();
  const [error, setError] = useState<string | null>(null);

  const url = getParamValue(params.url);
  const label = getParamValue(params.label);
  const token = getParamValue(params.token);
  const accent = getParamValue(params.accent) as SessionAccent | undefined;
  const passwordHint = getParamValue(params.passwordHint);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void (async () => {
      try {
        if (!url) {
          throw new Error('Missing `url` in the incoming deep link.');
        }

        const candidateUrl = normalizeUrlWithToken(url, token);
        const candidateId = createSessionId(candidateUrl);
        const existing = sessions.find((s) => s.id === candidateId);
        const verification = await verifyConnection({
          label: label ?? existing?.label ?? 'Linked bridge',
          remoteUrl: candidateUrl,
          normalizedUrl: candidateUrl,
          token,
          accent: accent ?? existing?.accent ?? 'cyan',
          passwordHint: passwordHint ?? existing?.passwordHint ?? '',
          source: 'qr',
        });
        const authoritativeLabel = verification.label ?? existing?.label ?? label ?? 'Linked bridge';

        const nextSessionId = connectSession({
          label: authoritativeLabel,
          url,
          token,
          authToken: existing?.authToken,
          accent: accent ?? existing?.accent ?? 'cyan',
          passwordHint: passwordHint ?? existing?.passwordHint,
          liveState: existing?.liveState,
          source: 'deep-link',
        }).id;
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
      })();
    }, 420);

    return () => clearTimeout(timeout);
  }, [url, label, token, accent, passwordHint, connectSession, sessions]);

  return { error };
}
