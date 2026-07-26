import { useSyncExternalStore } from "react";

export interface PersistedStore<T extends object> {
  get: () => T;
  set: (patch: Partial<T>) => void;
  setKey: <K extends keyof T>(key: K, value: T[K]) => void;
  replace: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
  useStore: () => T;
  useKey: <K extends keyof T>(key: K) => T[K];
}

export interface StoreOptions<T extends object> {
  key: string;
  defaults: T;
  hydrate?: (raw: unknown, defaults: T) => T;
}

export function createStore<T extends object>({ key, defaults, hydrate }: StoreOptions<T>): PersistedStore<T> {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw) as unknown;
      return hydrate ? hydrate(parsed, defaults) : { ...defaults, ...(parsed as T) };
    } catch {
      return { ...defaults };
    }
  };

  let state = read();
  const listeners = new Set<() => void>();

  const commit = (next: T) => {
    state = next;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode); in-memory state still applies.
    }
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const get = () => state;

  return {
    get,
    subscribe,
    set: (patch) => commit({ ...state, ...patch }),
    setKey: (k, value) => {
      if (Object.is(state[k], value)) return;
      commit({ ...state, [k]: value });
    },
    replace: (next) => commit(next),
    useStore: () => useSyncExternalStore(subscribe, get, () => defaults),
    useKey: <K extends keyof T>(k: K) => useSyncExternalStore(subscribe, () => state[k], () => defaults[k]),
  };
}
