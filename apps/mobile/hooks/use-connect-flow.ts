import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { ConnectFlowStore } from '@/lib/connect-flow/store';
import {
  type ConnectDraft,
  type PreparedConnection,
} from '@/lib/connect-flow/types';
import { ensureRemoteUrl, normalizeUrlWithToken } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';

const DEFAULT_DRAFT: ConnectDraft = {
  label: 'Night Shift',
  remoteUrl: 'https://demo.free.rzr.live/?token=glass-cyan-preview',
  passwordHint: '',
  accent: 'cyan',
};

function getInitialDraft(activeSession: ReturnType<typeof useSession>['activeSession']): ConnectDraft {
  if (!activeSession) return DEFAULT_DRAFT;
  return {
    label: activeSession.label,
    remoteUrl: activeSession.url,
    passwordHint: activeSession.passwordHint ?? '',
    accent: activeSession.accent,
  };
}

export function prepareManualConnection(draft: ConnectDraft): PreparedConnection {
  const normalizedUrl = ensureRemoteUrl(draft.remoteUrl);
  return {
    ...draft,
    normalizedUrl,
    source: 'manual',
  };
}

export function parseScannedConnection(rawValue: string): PreparedConnection {
  const raw = rawValue.trim();
  if (!raw) {
    throw new Error('Scanned code was empty.');
  }

  if (raw.startsWith('rzrmobile://connect')) {
    const url = new URL(raw);
    const remoteUrl = url.searchParams.get('url');
    if (!remoteUrl) {
      throw new Error('QR code is missing a session URL.');
    }
    const label = url.searchParams.get('label') ?? 'Scanned bridge';
    const accent = (url.searchParams.get('accent') as ConnectDraft['accent'] | null) ?? 'cyan';
    const passwordHint = url.searchParams.get('passwordHint') ?? '';
    const token = url.searchParams.get('token') ?? undefined;
    const normalizedUrl = normalizeUrlWithToken(remoteUrl, token);
    return {
      label,
      remoteUrl: normalizedUrl,
      normalizedUrl,
      passwordHint,
      accent,
      token,
      source: 'qr',
    };
  }

  const normalizedUrl = ensureRemoteUrl(raw);
  const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '');
  return {
    label: hostname || 'Scanned bridge',
    remoteUrl: normalizedUrl,
    normalizedUrl,
    passwordHint: '',
    accent: 'cyan',
    source: 'qr',
  };
}

async function verifyConnection(connection: PreparedConnection) {
  const parsedUrl = new URL(connection.normalizedUrl);
  const token = connection.token ?? parsedUrl.searchParams.get('token') ?? undefined;
  const headers: Record<string, string> = {};
  if (token) headers['x-rzr-token'] = token;

  const response = await fetch(`${parsedUrl.origin}/api/session`, { headers });
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }
  await response.json();
}

export function useConnectFlow() {
  const session = useSession();
  const { activeSession, connectSession, hydrated, sessions } = session;
  const storeRef = useRef<ConnectFlowStore | null>(null);
  const readyFiredRef = useRef(false);
  const verifyingNonceRef = useRef<number | null>(null);
  const handledNonceRef = useRef<number | null>(null);
  const pendingNavigationSessionIdRef = useRef<string | null>(null);

  if (!storeRef.current) {
    storeRef.current = new ConnectFlowStore(getInitialDraft(activeSession));
  }

  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => () => store.destroy(), [store]);

  useEffect(() => {
    if (!hydrated || readyFiredRef.current) return;
    readyFiredRef.current = true;
    const timeout = setTimeout(() => {
      store.send({ type: 'APP_READY' });
    }, 850);
    return () => clearTimeout(timeout);
  }, [hydrated, store]);

  useEffect(() => {
    const pending = snapshot.context.pendingConnection;
    const nonce = snapshot.context.requestNonce;
    if (snapshot.context.connectionStatus !== 'pending' || !pending) return;
    if (verifyingNonceRef.current === nonce) return;

    verifyingNonceRef.current = nonce;
    verifyConnection(pending)
      .then(() => {
        store.send({ type: 'CONNECTION_READY', nonce });
      })
      .catch((error: unknown) => {
        store.send({
          type: 'CONNECTION_FAILED',
          nonce,
          error:
            error instanceof Error ? error.message : 'Unable to connect that session.',
        });
      });
  }, [
    snapshot.context.connectionStatus,
    snapshot.context.pendingConnection,
    snapshot.context.requestNonce,
    store,
  ]);

  useEffect(() => {
    if (snapshot.state !== 'connected') return;
    const resolved = snapshot.context.resolvedConnection;
    if (!resolved) return;
    const nonce = snapshot.context.requestNonce;
    if (handledNonceRef.current === nonce) return;

    if (
      sessions.some(
        (item) => item.label === resolved.label && item.url !== resolved.normalizedUrl,
      )
    ) {
      handledNonceRef.current = nonce;
      store.send({
        type: 'CONNECTION_FAILED',
        nonce,
        error: `A session labeled "${resolved.label}" already exists.`,
      });
      return;
    }

    handledNonceRef.current = nonce;
    const nextSession = connectSession({
      label: resolved.label,
      url: resolved.normalizedUrl,
      token: resolved.token,
      passwordHint: resolved.passwordHint,
      accent: resolved.accent,
      source: resolved.source,
    });
    pendingNavigationSessionIdRef.current = nextSession.id;
  }, [
    activeSession,
    connectSession,
    sessions,
    snapshot.context.requestNonce,
    snapshot.context.resolvedConnection,
    snapshot.state,
    store,
  ]);

  useEffect(() => {
    const pendingSessionId = pendingNavigationSessionIdRef.current;
    if (!pendingSessionId) return;
    if (activeSession?.id !== pendingSessionId) return;

    pendingNavigationSessionIdRef.current = null;
    router.replace('/(tabs)/terminal');
    setTimeout(() => {
      store.send({ type: 'RESET' });
    }, 0);
  }, [activeSession, store]);

  const actions = useMemo(
    () => ({
      send: store.send,
      updateDraft: (patch: Partial<ConnectDraft>) =>
        store.send({ type: 'UPDATE_DRAFT', patch }),
      openManual: () => store.send({ type: 'OPEN_MANUAL' }),
      openQr: () => store.send({ type: 'OPEN_QR' }),
      cancel: () => store.send({ type: 'CANCEL' }),
      submitManual: () => {
        try {
          const connection = prepareManualConnection(store.getSnapshot().context.draft);
          store.send({ type: 'SUBMIT_MANUAL', connection });
        } catch (error) {
          store.send({
            type: 'SHOW_ERROR',
            error: error instanceof Error ? error.message : 'Add a session URL first.',
          });
        }
      },
      submitScanned: (rawValue: string) => {
        try {
          const connection = parseScannedConnection(rawValue);
          store.send({ type: 'SCAN_RESULT', connection });
        } catch (error) {
          store.send({
            type: 'SHOW_ERROR',
            error:
              error instanceof Error ? error.message : 'Could not read that QR code.',
          });
        }
      },
      reset: () => store.send({ type: 'RESET' }),
    }),
    [store],
  );

  return {
    snapshot,
    actions,
  };
}
