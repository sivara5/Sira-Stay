import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

import { API_URL } from './config';

/**
 * Connection state = the phone's network link (NetInfo) + whether our server actually answers.
 * "Server unreachable" is learnt from real requests, so slow/blocked networks are detected too.
 */
type State = { connected: boolean; serverReachable: boolean };
export type NetworkStatus = { online: boolean; reason: 'no_internet' | 'server' | null };

let state: State = { connected: true, serverReachable: true };
let snapshot: NetworkStatus = { online: true, reason: null };
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();
const retryListeners = new Set<() => void>();
let probeTimer: ReturnType<typeof setInterval> | null = null;

function update(next: Partial<State>) {
  const wasOnline = snapshot.online;
  state = { ...state, ...next };
  const online = state.connected && state.serverReachable;
  snapshot = { online, reason: online ? null : !state.connected ? 'no_internet' : 'server' };
  listeners.forEach((l) => l());
  if (!wasOnline && online) reconnectListeners.forEach((l) => l());
  // While offline, quietly check every 10 s whether the server is back.
  if (!online && !probeTimer) probeTimer = setInterval(probe, 10_000);
  if (online && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

/** Called by the API client after every request. */
export function reportServerReachable(ok: boolean) {
  if (state.serverReachable !== ok) update({ serverReachable: ok });
}

async function probe() {
  if (!state.connected) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
    reportServerReachable(res.ok);
  } catch {
    reportServerReachable(false);
  } finally {
    clearTimeout(timer);
  }
}

NetInfo.addEventListener((s) => {
  const connected = s.isConnected !== false;
  // When the link comes back, assume the server is reachable; the next request will tell.
  if (connected !== state.connected) update({ connected, ...(connected && { serverReachable: true }) });
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const useNetwork = () => useSyncExternalStore(subscribe, () => snapshot);

export const isOnline = () => snapshot.online;

/** Runs `cb` whenever the connection comes back. */
export function onReconnect(cb: () => void) {
  reconnectListeners.add(cb);
  return () => {
    reconnectListeners.delete(cb);
  };
}

/** Runs `cb` when the user taps Retry. */
export function onRetry(cb: () => void) {
  retryListeners.add(cb);
  return () => {
    retryListeners.delete(cb);
  };
}

/** Retry button: re-check the connection and ask every visible screen to reload. */
export function retryNow() {
  NetInfo.refresh().catch(() => {});
  probe();
  retryListeners.forEach((l) => l());
}
