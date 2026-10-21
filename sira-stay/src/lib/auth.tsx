import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, api, setAuthToken } from './api';
import { useI18n } from './i18n';
import { clearOfflineCache, setCacheOwner } from './offline-cache';
import { clearPendingPayments } from './pending-payments';
import type { Language, Me } from './types';

const TOKEN_KEY = 'sira.token';
const ME_KEY = 'sira.me';

type Auth = {
  ready: boolean;
  user: Me | null;
  signIn: (token: string, user: Me) => Promise<void>;
  setUser: (user: Me) => void;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Changes the app language locally and, when signed in, on the profile. */
  changeLanguage: (lang: Language) => void;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<Me | null>(null);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
      if (!token) {
        setReady(true);
        return;
      }
      setAuthToken(token);
      // Start from the saved account right away, so the app opens (and works offline) without waiting.
      const saved = await AsyncStorage.getItem(ME_KEY)
        .then((raw) => (raw ? (JSON.parse(raw) as Me) : null))
        .catch(() => null);
      if (saved) {
        setCacheOwner(saved.id);
        setUserState(saved);
        setReady(true);
      }
      try {
        const { user: me } = await api<{ user: Me }>('/me', saved ? { retries: 0 } : {});
        setCacheOwner(me.id);
        setUserState(me);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The session really ended — sign out on this phone.
          setAuthToken(null);
          await AsyncStorage.multiRemove([TOKEN_KEY, ME_KEY]).catch(() => {});
          setUserState(null);
        }
        // Network errors: keep the saved account (offline mode).
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Keep a copy of the signed-in account for offline starts, and separate saved data per account.
  useEffect(() => {
    if (!user) return;
    setCacheOwner(user.id);
    AsyncStorage.setItem(ME_KEY, JSON.stringify(user)).catch(() => {});
  }, [user]);

  const signIn = useCallback(async (token: string, me: Me) => {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setCacheOwner(me.id); // before screens mount and read their saved data
    setUserState(me);
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: me } = await api<{ user: Me }>('/me');
    setUserState(me);
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, ME_KEY]).catch(() => {});
    await Promise.all([clearOfflineCache(), clearPendingPayments()]);
    setCacheOwner(null);
    setUserState(null);
  }, []);

  const changeLanguage = useCallback(
    (lang: Language) => {
      setLang(lang);
      if (user) {
        api<{ user: Me }>('/me', { method: 'PATCH', body: { language: lang } })
          .then(({ user: me }) => setUserState(me))
          .catch(() => {});
      }
    },
    [setLang, user],
  );

  const value = useMemo(
    () => ({ ready, user, signIn, setUser: setUserState, refreshUser, signOut, changeLanguage }),
    [ready, user, signIn, refreshUser, signOut, changeLanguage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const stepRoute = {
  role: '/onboarding/role',
  phone: '/onboarding/phone',
  kyc: '/onboarding/kyc',
  done: '/',
} as const;
