import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpoSwiftTermRef } from '@sethwebster/expo-swift-term';

function buildTerminalSocketUrl(sessionUrl: string, authToken?: string) {
  try {
    const parsed = new URL(sessionUrl);
    const base = parsed.origin;
    const token = parsed.searchParams.get('token') ?? undefined;
    const auth = authToken ?? parsed.searchParams.get('auth') ?? undefined;
    const url = new URL(`${base}/api/terminal/ws`);
    if (token) url.searchParams.set('token', token);
    if (auth) url.searchParams.set('auth', auth);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return sessionUrl;
  }
}

function decodeBase64(base64: string) {
  const decode = globalThis.atob;
  if (typeof decode !== 'function') return '';
  const raw = decode(base64);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function translateInputPayload(text: string) {
  switch (text) {
    case '\r':
      return { kind: 'key' as const, value: 'Enter' };
    case '\t':
      return { kind: 'key' as const, value: 'Tab' };
    case '\u001b':
      return { kind: 'key' as const, value: 'Escape' };
    case '\u007f':
      return { kind: 'key' as const, value: 'Backspace' };
    case '\u0003':
      return { kind: 'key' as const, value: 'C-c' };
    case '\u0004':
      return { kind: 'key' as const, value: 'C-d' };
    case '\u001b[A':
      return { kind: 'key' as const, value: 'Up' };
    case '\u001b[B':
      return { kind: 'key' as const, value: 'Down' };
    case '\u001b[C':
      return { kind: 'key' as const, value: 'Right' };
    case '\u001b[D':
      return { kind: 'key' as const, value: 'Left' };
    default:
      return { kind: 'text' as const, value: text };
  }
}

export function useSwiftTermSocket(
  sessionUrl: string,
  authToken: string | undefined,
  terminalRef: React.RefObject<ExpoSwiftTermRef | null>,
  onConnectionFailed?: () => void,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketUrl = useMemo(() => buildTerminalSocketUrl(sessionUrl, authToken), [authToken, sessionUrl]);
  const [statusMessage, setStatusMessage] = useState('Connecting native terminal…');
  const failCountRef = useRef(0);
  const didConnectRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    failCountRef.current = 0;
    didConnectRef.current = false;

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const clearReadyTimer = () => {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
    };

    const connect = () => {
      clearReconnect();
      clearReadyTimer();
      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (cancelled) return;
        failCountRef.current = 0;
        setStatusMessage('Connecting native terminal…');
        socket.send(JSON.stringify({ type: 'connect', cols: 80, rows: 24 }));

        // If we don't get 'ready' within 8s of open, treat as unreachable
        readyTimer = setTimeout(() => {
          if (cancelled || didConnectRef.current) return;
          setStatusMessage('Session unreachable.');
          socket.close();
          onConnectionFailed?.();
        }, 8000);
      });

      socket.addEventListener('message', (event) => {
        if (cancelled) return;
        const payload = JSON.parse(String(event.data));

        switch (payload?.type) {
          case 'ready':
            clearReadyTimer();
            didConnectRef.current = true;
            failCountRef.current = 0;
            setStatusMessage('Native terminal live.');
            break;
          case 'snapshot': {
            clearReadyTimer();
            didConnectRef.current = true;
            const screen = String(payload?.snapshot?.screen || '');
            const lines = screen.split(/\r?\n/);
            const positioned = lines
              .map((line: string, i: number) => `\u001b[${i + 1};1H\u001b[2K${line}`)
              .join('');
            terminalRef.current?.writeText(positioned);
            break;
          }
          case 'output':
            if (payload.data) {
              terminalRef.current?.writeText(String(payload.data));
            }
            break;
          case 'runtime-close':
            setStatusMessage('Terminal reconnecting…');
            break;
          case 'error':
            setStatusMessage(String(payload.error || 'Native terminal transport error.'));
            break;
          default:
            break;
        }
      });

      socket.addEventListener('close', () => {
        if (cancelled) return;
        clearReadyTimer();
        socketRef.current = null;
        failCountRef.current += 1;
        if (!didConnectRef.current && failCountRef.current >= 3) {
          setStatusMessage('Session unreachable.');
          onConnectionFailed?.();
          return;
        }
        clearReconnect();
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 1000);
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearReadyTimer();
      clearReconnect();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [socketUrl, terminalRef, onConnectionFailed]);

  const sendPayload = useCallback((payload: object) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }, []);

  const handleData = useCallback((base64: string) => {
    const decoded = decodeBase64(base64);
    if (!decoded) return;
    const payload = translateInputPayload(decoded);
    if (payload.kind === 'key') {
      sendPayload({ type: 'key', key: payload.value });
    } else {
      sendPayload({ type: 'input', text: payload.value });
    }
  }, [sendPayload]);

  const handleResize = useCallback((cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      sendPayload({ type: 'resize', cols, rows });
    }
  }, [sendPayload]);

  return { statusMessage, handleData, handleResize };
}
