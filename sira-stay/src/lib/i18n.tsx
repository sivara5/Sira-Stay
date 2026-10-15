import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError } from './api';
import { en, ta, type StringKey } from './strings';
import type { Language } from './types';

const STORAGE_KEY = 'sira.language';
const dictionaries: Record<Language, Record<StringKey, string>> = { en, ta };

type Vars = Record<string, string | number>;
type I18n = {
  lang: Language;
  ready: boolean;
  setLang: (lang: Language) => void;
  t: (key: StringKey, vars?: Vars) => string;
  /** User-facing text for any thrown error, translated when the server code is known. */
  errorText: (err: unknown) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'en' || stored === 'ta') setLangState(stored);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Vars) => {
      const template = dictionaries[lang][key] ?? en[key] ?? key;
      return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : template;
    },
    [lang],
  );

  const errorText = useCallback(
    (err: unknown) => {
      if (!(err instanceof ApiError)) return t('common.error');
      if (err.code === 'NETWORK') return t('common.networkError');
      const key = `err.${err.code}` as StringKey;
      // English users get the server's precise message (it can include dates/photo numbers).
      if (lang === 'ta' && key in ta) return ta[key];
      return err.message || t('common.error');
    },
    [lang, t],
  );

  const value = useMemo(() => ({ lang, ready, setLang, t, errorText }), [lang, ready, setLang, t, errorText]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
