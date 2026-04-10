import { useLocalSearchParams } from 'expo-router';

import { SessionDetailScreen } from '@/lib/session-screens';

export default function SessionDetailRoute() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!rawId) {
    return null;
  }

  return <SessionDetailScreen sessionId={rawId} />;
}
