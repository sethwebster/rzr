import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { getRzrLiveHref, isRzrLiveUrl } from '@/lib/rzr-links';

export function useUniversalLink() {
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (isRzrLiveUrl(url)) {
        router.push(getRzrLiveHref(url) as never);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url && isRzrLiveUrl(url)) {
        router.push(getRzrLiveHref(url) as never);
      }
    });

    return () => subscription.remove();
  }, []);
}
