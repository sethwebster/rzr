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

// Encode a JS string (UTF-16) to a UTF-8 base64 string suitable for the
// SwiftTerm native bridge's binary feed path. Going through bytes avoids any
// string-escaping roundtrip issues through JSON / RN prop marshalling that
// could silently drop or corrupt control characters (ESC 0x1b, CR 0x0d, etc).
function encodeUtf8Base64(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if ((c & 0xfc00) === 0xd800 && i + 1 < text.length) {
      // Surrogate pair
      const c2 = text.charCodeAt(i + 1);
      if ((c2 & 0xfc00) === 0xdc00) {
        i += 1;
        const code = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      } else {
        bytes.push(0xef, 0xbf, 0xbd); // replacement char
      }
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const encode = globalThis.btoa;
  if (typeof encode !== 'function') return '';
  return encode(binary);
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
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  // Latch the latest onConnectionFailed into a ref so the effect below never
  // has to re-run when the parent re-renders with a new inline callback. A
  // re-run would tear down the WebSocket and force a fresh ready+snapshot,
  // which manifests as random screen clears during normal interaction.
  const onConnectionFailedRef = useRef(onConnectionFailed);
  onConnectionFailedRef.current = onConnectionFailed;

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

        // Wait for real terminal dimensions before sending connect.
        // SwiftTerm fires onResize once it lays out, which sets
        // pendingSizeRef. If it already fired, send immediately.
        const trySendConnect = () => {
          if (cancelled || socket.readyState !== WebSocket.OPEN) return;
          const size = pendingSizeRef.current;
          if (!size) {
            setTimeout(trySendConnect, 50);
            return;
          }
          socket.send(JSON.stringify({ type: 'connect', cols: size.cols, rows: size.rows }));
        };
        trySendConnect();

        readyTimer = setTimeout(() => {
          if (cancelled || didConnectRef.current) return;
          setStatusMessage('Session unreachable.');
          socket.close();
          onConnectionFailedRef.current?.();
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
            terminalRef.current?.write(
              encodeUtf8Base64(`\u001b[0m\u001b[2J\u001b[H${screen}\u001b[0m`),
            );
            // The snapshot was captured at the server's current grid size,
            // which may differ from ours. Re-send our real dimensions so the
            // server resizes tmux and subsequent output is correct.
            const size = pendingSizeRef.current;
            if (size && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
            }
            break;
          }
          case 'output':
            if (payload.data) {
              terminalRef.current?.write(encodeUtf8Base64(String(payload.data)));
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
          onConnectionFailedRef.current?.();
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
    // terminalRef is a stable ref; onConnectionFailed is latched via the ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketUrl]);

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
      pendingSizeRef.current = { cols, rows };
      sendPayload({ type: 'resize', cols, rows });
    }
  }, [sendPayload]);

  return { statusMessage, handleData, handleResize };
}
