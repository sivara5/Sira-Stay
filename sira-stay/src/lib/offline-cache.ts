import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Last-seen copies of screens so they still show offline: property lists, viewed property details
 * (with the owner contact a tenant paid for), Favorites, My Bookings and booking details.
 * Stored per user and cleared on sign-out.
 */
const PREFIX = 'sira.cache.v1:';
const INDEX_KEY = 'sira.cache.v1.index';
const MAX_ENTRIES = 60;
const MAX_AGE_MS = 30 * 24 * 3_600_000;

const CACHEABLE = [
  /^\/properties\?/,
  /^\/properties\/[^/?]+$/,
  /^\/properties\/[^/?]+\/unlocked$/,
  /^\/my\/favorites$/,
  /^\/my\/bookings$/,
  /^\/bookings\/[^/?]+$/,
];
export const isCacheable = (path: string) => CACHEABLE.some((pattern) => pattern.test(path));

let owner = 'guest';
/** Keeps one user's saved data separate from another's on a shared phone. */
export const setCacheOwner = (userId: string | null) => {
  owner = userId ?? 'guest';
};

const keyFor = (path: string) => `${PREFIX}${owner}:${path}`;
type Entry<T> = { data: T; savedAt: number };
type IndexItem = { key: string; at: number };

export async function readCache<T>(path: string): Promise<Entry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(path));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return Date.now() - entry.savedAt > MAX_AGE_MS ? null : entry;
  } catch {
    return null;
  }
}

// Writes are chained so the index isn't clobbered by two saves at once.
let writes: Promise<void> = Promise.resolve();

export function writeCache<T>(path: string, data: T) {
  const key = keyFor(path);
  writes = writes
    .then(async () => {
      const savedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify({ data, savedAt }));
      const index: IndexItem[] = JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) ?? '[]');
      const next = [{ key, at: savedAt }, ...index.filter((i) => i.key !== key)];
      const keep = next.filter((i, n) => n < MAX_ENTRIES && savedAt - i.at < MAX_AGE_MS);
      const drop = next.filter((i) => !keep.includes(i)).map((i) => i.key);
      if (drop.length) await AsyncStorage.multiRemove(drop);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(keep));
    })
    .catch(() => {});
  return writes;
}

/** Removes every saved screen (sign-out). */
export async function clearOfflineCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) || k === INDEX_KEY);
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore — nothing to clear
  }
}
