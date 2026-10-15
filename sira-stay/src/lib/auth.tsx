import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, api, setAuthToken } from './api';
import { useI18n } from './i18n';
import type { Language, Me } from './types';

const TOKEN_KEY = 'sira.token';

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
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (token) {
          setAuthToken(token);
          const { user: me } = await api<{ user: Me }>('/me');
          setUserState(me);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuthToken(null);
          await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        }
        // Network errors: stay signed out for now; the user can retry from onboarding.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (token: string, me: Me) => {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUserState(me);
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: me } = await api<{ user: Me }>('/me');
    setUserState(me);
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
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
