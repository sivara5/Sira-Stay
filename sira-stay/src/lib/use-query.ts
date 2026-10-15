import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api } from './api';

/**
 * Fetches `path` whenever the screen gains focus (and optionally polls), so bookings, payments
 * and unlock status always reflect the backend — the source of truth.
 */
export function useQuery<T>(path: string | null, { pollMs }: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!path) return;
      if (mode === 'refresh') setRefreshing(true);
      try {
        setData(await api<T>(path));
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      load('silent');
      if (!pollMs) return undefined;
      const timer = setInterval(() => load('silent'), pollMs);
      return () => clearInterval(timer);
    }, [load, pollMs]),
  );

  return { data, error, loading, refreshing, refresh: () => load('refresh'), reload: () => load('silent'), setData };
}
