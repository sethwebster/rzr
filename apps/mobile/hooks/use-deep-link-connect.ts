import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { getParamValue } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';
import { type SessionAccent } from '@/types/session';

export function useDeepLinkConnect(params: {
  label?: string;
  url?: string;
  token?: string;
  accent?: SessionAccent;
  passwordHint?: string;
}) {
  const { connectSession } = useSession();
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

        connectSession({
          label: label ?? 'Linked bridge',
          url,
          token,
          accent: accent ?? 'cyan',
          passwordHint,
          source: 'deep-link',
        });
        router.replace('/(tabs)/terminal');
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Unable to open the session.',
        );
      }
    }, 420);

    return () => clearTimeout(timeout);
  }, [url, label, token, accent, passwordHint, connectSession]);

  return { error };
}
