import { useLocalSearchParams } from 'expo-router';

import { readNumberParam, SessionDetailScreen } from './_shared';

export default function SessionDetailRoute() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    originX?: string | string[];
    originY?: string | string[];
    originSize?: string | string[];
  }>();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!rawId) {
    return null;
  }

  return (
    <SessionDetailScreen
      sessionId={rawId}
      revealOrigin={{
        originX: readNumberParam(params.originX),
        originY: readNumberParam(params.originY),
        originSize: readNumberParam(params.originSize),
      }}
    />
  );
}
