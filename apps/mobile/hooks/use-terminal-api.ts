import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';

import {
  buildRemoteSessionSummary,
  type RemoteSessionSummary,
  type SessionApiPayload,
} from '@/lib/session-snapshot';

export type { RemoteSessionSummary };

function extractTokens(url: string) {
  try {
    const u = new URL(url);
    return {
      base: u.origin,
      token: u.searchParams.get('token') ?? undefined,
      auth: u.searchParams.get('auth') ?? undefined,
    };
  } catch {
    return { base: url, token: undefined, auth: undefined };
  }
}

function buildHeaders(token?: string, auth?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['x-rzr-token'] = token;
  if (auth) h['x-rzr-auth'] = auth;
  return h;
}

async function readApiPayload(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function getApiErrorMessage(response: Response, payload: Record<string, unknown> | null) {
  const error = typeof payload?.error === 'string' ? payload.error : null;
  if (error === 'invalid token') {
    return 'Invalid session token.';
  }
  if (error === 'password required') {
    return 'Password required.';
  }
  if (error === 'invalid password') {
    return 'Invalid password.';
  }
  return error || `Server returned ${response.status}`;
}

export async function fetchRemoteSessionSummary(
  sessionUrl: string,
  authOverride?: string,
): Promise<RemoteSessionSummary> {
  const { base, token, auth } = extractTokens(sessionUrl);
  const headers = buildHeaders(token, authOverride ?? auth);
  const lastStatusAt = new Date().toISOString();

  try {
    const response = await fetch(`${base}/api/session`, { headers });
    const payload = (await readApiPayload(response)) as SessionApiPayload;

    if (response.status === 401) {
      return {
        liveState: payload?.error === 'password required' ? 'locked' : 'unknown',
        awaitingInput: false,
        lastStatusAt,
        previewScreen: '',
        previewLines: [],
      };
    }

    if (response.status === 410) {
      return buildRemoteSessionSummary(payload, lastStatusAt);
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Server returned ${response.status}`);
    }

    return buildRemoteSessionSummary(payload, lastStatusAt);
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unable to reach session.');
  }
}

export type SessionSignalsPayload = {
  idle: {
    isIdle: boolean;
    idleForMs: number;
    thresholdMs: number;
  };
  input: {
    waiting: boolean;
    prompt: string | null;
  };
};

const DEFAULT_SESSION_SIGNALS: SessionSignalsPayload = {
  idle: {
    isIdle: false,
    idleForMs: 0,
    thresholdMs: 60_000,
  },
  input: {
    waiting: false,
    prompt: null,
  },
};

export async function fetchSessionSignals(
  sessionUrl: string,
  authOverride?: string,
): Promise<SessionSignalsPayload> {
  const { base, token, auth } = extractTokens(sessionUrl);
  const headers = buildHeaders(token, authOverride ?? auth);

  const response = await fetch(`${base}/api/session`, { headers });
  if (!response.ok) {
    const payload = await readApiPayload(response);
    throw new Error(getApiErrorMessage(response, payload));
  }
  const payload = (await response.json()) as {
    snapshot?: { signals?: SessionSignalsPayload };
  };
  return payload?.snapshot?.signals ?? DEFAULT_SESSION_SIGNALS;
}

export { DEFAULT_SESSION_SIGNALS };

function stripDataUriPrefix(dataBase64: string) {
  const matches = dataBase64.match(/^data:(.+?);base64,(.+)$/);
  return {
    mimeTypeFromDataUri: matches?.[1] ?? null,
    rawBase64: matches?.[2] ?? dataBase64,
  };
}

function getBase64ByteLength(base64Value: string) {
  const normalized = base64Value.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function chunkBase64(base64Value: string, chunkSizeChars: number) {
  const normalizedChunkSize = chunkSizeChars - (chunkSizeChars % 4);
  const chunks: string[] = [];

  for (let index = 0; index < base64Value.length; index += normalizedChunkSize) {
    chunks.push(base64Value.slice(index, index + normalizedChunkSize));
  }

  return chunks;
}

export function useTerminalApi(sessionUrl: string, token?: string, auth?: string) {
  const { base, token: urlToken, auth: urlAuth } = useMemo(
    () => extractTokens(sessionUrl),
    [sessionUrl],
  );

  const headers = useMemo(
    () => buildHeaders(token ?? urlToken, auth ?? urlAuth),
    [token, urlToken, auth, urlAuth],
  );

  const sendInput = useCallback(
    async (text: string, pressEnter: boolean) => {
      if (!text.trim()) return;
      try {
        const response = await fetch(`${base}/api/input`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text }),
        });
        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, await readApiPayload(response)));
        }
        if (pressEnter) {
          const keyResponse = await fetch(`${base}/api/key`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key: 'Enter' }),
          });
          if (!keyResponse.ok) {
            throw new Error(getApiErrorMessage(keyResponse, await readApiPayload(keyResponse)));
          }
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        return true;
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
        return false;
      }
    },
    [base, headers],
  );

  const uploadImage = useCallback(
    async ({
      dataBase64,
      filename,
      mimeType,
      onProgress,
    }: {
      dataBase64: string;
      filename?: string;
      mimeType?: string;
      onProgress?: (progress: number) => void;
    }) => {
      if (!dataBase64) {
        throw new Error('Image data was empty.');
      }

      try {
        const { mimeTypeFromDataUri, rawBase64 } = stripDataUriPrefix(dataBase64);
        const resolvedMimeType = mimeType ?? mimeTypeFromDataUri ?? 'image/jpeg';
        const totalBytes = getBase64ByteLength(rawBase64);
        const chunks = chunkBase64(rawBase64, 256 * 1024);

        if (!chunks.length) {
          throw new Error('Image data was empty.');
        }

        onProgress?.(0);

        const startResponse = await fetch(`${base}/api/upload-image/start`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filename,
            mimeType: resolvedMimeType,
            totalBytes,
            chunkCount: chunks.length,
          }),
        });

        if (!startResponse.ok) {
          throw new Error(getApiErrorMessage(startResponse, await readApiPayload(startResponse)));
        }

        const startPayload = (await startResponse.json()) as { uploadId?: string };
        if (!startPayload.uploadId) {
          throw new Error('Upload could not be initialized.');
        }

        let uploadedBytes = 0;
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index];
          const chunkResponse = await fetch(`${base}/api/upload-image/chunk`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              uploadId: startPayload.uploadId,
              chunkIndex: index,
              dataBase64: chunk,
            }),
          });

          if (!chunkResponse.ok) {
            throw new Error(getApiErrorMessage(chunkResponse, await readApiPayload(chunkResponse)));
          }

          uploadedBytes += getBase64ByteLength(chunk);
          onProgress?.(Math.min(1, uploadedBytes / Math.max(totalBytes, 1)));
        }

        const completeResponse = await fetch(`${base}/api/upload-image/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ uploadId: startPayload.uploadId }),
        });

        if (!completeResponse.ok) {
          throw new Error(getApiErrorMessage(completeResponse, await readApiPayload(completeResponse)));
        }

        const payload = (await completeResponse.json()) as { path?: string };
        if (!payload.path) {
          throw new Error('Upload completed, but no file path was returned.');
        }
        onProgress?.(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        return payload.path;
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
        throw error instanceof Error ? error : new Error('Image upload failed.');
      }
    },
    [base, headers],
  );

  const pressKey = useCallback(
    async (key: string) => {
      try {
        const response = await fetch(`${base}/api/key`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ key }),
        });
        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, await readApiPayload(response)));
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => null);
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      }
    },
    [base, headers],
  );

  const restartSession = useCallback(async () => {
    try {
      const response = await fetch(`${base}/api/session/restart`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const payload = (await readApiPayload(response)) as SessionApiPayload;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      return buildRemoteSessionSummary(payload);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      throw error instanceof Error ? error : new Error('Unable to restart session.');
    }
  }, [base, headers, sessionUrl]);

  const validateSession = useCallback(async () => {
    const res = await fetch(`${base}/api/session`, { headers });
    if (!res.ok) {
      throw new Error(getApiErrorMessage(res, await readApiPayload(res)));
    }
    return res.json();
  }, [base, headers]);

  const authenticateSession = useCallback(
    async (password: string) => {
      const trimmed = password.trim();
      if (!trimmed) {
        throw new Error('Enter the session password.');
      }

      const response = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ password: trimmed }),
      });
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload));
      }

      const authToken =
        typeof payload?.authToken === 'string' ? payload.authToken : null;
      if (!authToken) {
        throw new Error('Server did not return an auth token.');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      return authToken;
    },
    [base, headers],
  );

  return {
    sendInput,
    pressKey,
    restartSession,
    validateSession,
    authenticateSession,
    uploadImage,
  };
}
