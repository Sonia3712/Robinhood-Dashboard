
import NodeCache from 'node-cache';
import { recordCacheEvent } from './requestContext.js';

const DEFAULT_TTL_MS = 60_000;

// Every instance, so shutdown can stop node-cache's sweep timers.
const registry = new Set();


export function createCache() {
  const cache = new NodeCache({ useClones: false, stdTTL: 0, checkperiod: 600 });
  cache.pending = new Map();
  registry.add(cache);
  return cache;
}

export async function fetchCached(cache, key, fetcher, ttlMs = DEFAULT_TTL_MS, staleMs = 0) {
  const entry = cache.get(key);

  if (!entry) {
    recordCacheEvent(key, 'MISS');
  } else if (Date.now() <= entry.expiresAt) {
    recordCacheEvent(key, 'HIT');
    return entry.value;
  } else {
    recordCacheEvent(key, 'MISS');
  }

  const inFlight = cache.pending.get(key);
  if (inFlight) {
    recordCacheEvent(key, 'COALESCED');
    return inFlight;
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      write(cache, key, value, ttlMs, staleMs);
      return value;
    } finally {
      cache.pending.delete(key);
    }
  })();

  cache.pending.set(key, promise);
  return promise;
}

/** Read past the TTL, but inside the stale grace period. Null if absent. */
export function readStale(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  recordCacheEvent(key, 'STALE');
  return entry.value;
}

/** Stop every sweep timer. Called from the shutdown path. */
export function closeAllCaches() {
  for (const cache of registry) {
    cache.pending.clear();
    cache.close();
  }
  registry.clear();
}

function write(cache, key, value, ttlMs, staleMs) {
  const lifetimeMs = ttlMs + staleMs;
  if (!(lifetimeMs > 0)) {
    // node-cache reads ttl <= 0 as "never expire", so drop the key outright
    // rather than storing something immortal by accident.
    cache.del(key);
    return value;
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs }, lifetimeMs / 1000);
  return value;
}