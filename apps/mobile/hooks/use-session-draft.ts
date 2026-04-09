import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@rzr/mobile/session-drafts/v1';
const drafts = new Map<string, string>();
let hydrated = false;

async function hydrateOnce() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.trim()) {
          drafts.set(key, value);
        }
      }
    }
  } catch {
    // ignore
  }
}

function persist() {
  const obj: Record<string, string> = {};
  for (const [key, value] of drafts) {
    if (value.trim()) obj[key] = value;
  }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj)).catch(() => null);
}

export function useSessionDraft(sessionId: string | null) {
  const [text, setTextState] = useState(() => (sessionId ? drafts.get(sessionId) ?? '' : ''));

  useEffect(() => {
    hydrateOnce().then(() => {
      if (sessionId) {
        setTextState(drafts.get(sessionId) ?? '');
      }
    });
  }, [sessionId]);

  const setText = useCallback((next: string | ((prev: string) => string)) => {
    setTextState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (sessionId) {
        if (value.trim()) {
          drafts.set(sessionId, value);
        } else {
          drafts.delete(sessionId);
        }
        persist();
      }
      return value;
    });
  }, [sessionId]);

  const clearDraft = useCallback(() => {
    if (sessionId) {
      drafts.delete(sessionId);
      persist();
    }
    setTextState('');
  }, [sessionId]);

  return { text, setText, clearDraft };
}
