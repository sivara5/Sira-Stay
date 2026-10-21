import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { api } from './api';
import { onReconnect, onRetry } from './network';
import { isCacheable, readCache, writeCache } from './offline-cache';

/**
 * Fetches `path` whenever the screen gains focus (and optionally polls), so bookings, payments
 * and unlock status always reflect the backend — the source of truth.
 *
 * On slow/offline networks: saved data (lists, details, favorites, bookings) is shown at once and
 * replaced when fresh data arrives; if the request fails the saved copy stays (`savedAt` tells when
 * it was saved). Focused screens reload automatically when the connection returns or Retry is tapped.
 */
export function useQuery<T>(path: string | null, { pollMs }: { pollMs?: number } = {}) {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const cacheShownFor = useRef<string | null>(null);

  const load = useCallback(
    async (mode: 'refresh' | 'silent' = 'silent') => {
      if (!path) return;
      if (mode === 'refresh') setRefreshing(true);
      const cacheable = isCacheable(path);
      if (cacheable && cacheShownFor.current !== path) {
        cacheShownFor.current = path;
        const saved = await readCache<T>(path);
        if (saved) {
          setDataState(saved.data);
          setSavedAt(saved.savedAt);
          setLoading(false);
        }
      }
      try {
        const result = await api<T>(path);
        setDataState(result);
        setSavedAt(null);
        setError(null);
        if (cacheable) writeCache(path, result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  /** Local update after an action (e.g. unlock); also refreshes the saved copy. */
  const setData = useCallback(
    (value: T) => {
      setDataState(value);
      setSavedAt(null);
      if (path && isCacheable(path)) writeCache(path, value);
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const stopReconnect = onReconnect(() => load('silent'));
      const stopRetry = onRetry(() => load('silent'));
      const timer = pollMs ? setInterval(() => load('silent'), pollMs) : null;
      return () => {
        stopReconnect();
        stopRetry();
        if (timer) clearInterval(timer);
      };
    }, [load, pollMs]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => load('refresh'),
    reload: () => load('silent'),
    setData,
    /** When the data on screen was saved, if it is a saved (offline) copy; null when fresh. */
    savedAt,
  };
}
