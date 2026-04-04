import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { buildConnectHref } from '@/lib/utils';

const RZR_LIVE_PATTERN = /\.rzr\.live$/i;

function isRzrLiveUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return RZR_LIVE_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

function routeRzrLiveUrl(url: string) {
  const parsed = new URL(url);
  const subdomain = parsed.hostname.split('.')[0] ?? 'Live bridge';
  const href = buildConnectHref({
    label: subdomain,
    url,
    accent: 'cyan',
    passwordHint: '',
  });
  router.push(href as never);
}

export function useUniversalLink() {
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (isRzrLiveUrl(url)) {
        routeRzrLiveUrl(url);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url && isRzrLiveUrl(url)) {
        routeRzrLiveUrl(url);
      }
    });

    return () => subscription.remove();
  }, []);
}
