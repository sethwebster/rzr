import { type RefObject, useCallback } from 'react';
import { useRef } from 'react';
import { type WebViewMessageEvent } from 'react-native-webview';

import { type RadialMenuHandle } from '@/components/radial-menu';

export function useRadialBridge(
  radialMenuRef: RefObject<RadialMenuHandle | null>,
  radialEnabled: boolean,
) {
  const activeInteractionIdRef = useRef<number | null>(null);
  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: {
        __rzrRadial?: boolean;
        id?: number;
        type?: string;
        x?: number;
        y?: number;
      } | null = null;

      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (!payload?.__rzrRadial || !radialEnabled) return;

      const interactionId = typeof payload.id === 'number' ? payload.id : -1;
      const x = typeof payload.x === 'number' ? payload.x : 0;
      const y = typeof payload.y === 'number' ? payload.y : 0;

      switch (payload.type) {
        case 'hold-start':
          activeInteractionIdRef.current = interactionId;
          radialMenuRef.current?.beginHold(x, y);
          break;
        case 'hold-move':
        case 'move':
          if (activeInteractionIdRef.current !== interactionId) return;
          radialMenuRef.current?.movePointer(x, y);
          break;
        case 'activate':
          if (activeInteractionIdRef.current !== interactionId) return;
          radialMenuRef.current?.activateMenu(x, y);
          break;
        case 'release':
          if (activeInteractionIdRef.current !== interactionId) return;
          activeInteractionIdRef.current = null;
          radialMenuRef.current?.releasePointer();
          break;
        case 'cancel':
          if (
            activeInteractionIdRef.current !== interactionId &&
            activeInteractionIdRef.current !== null
          ) {
            return;
          }
          activeInteractionIdRef.current = null;
          radialMenuRef.current?.cancel();
          break;
        default:
          break;
      }
    },
    [radialEnabled, radialMenuRef],
  );

  return handleWebMessage;
}
