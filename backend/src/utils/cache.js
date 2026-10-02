import NodeCache from 'node-cache';

const DEFAULT_TTL_MS = 60_000;

const registry = new Set();

let currentContext = null;

export function setRequestContext(context) {
  currentContext = context;
}

function recordCacheEvent(key, outcome) {
  if (!currentContext) return;
  currentContext.cacheEvents.push({ key, outcome });
}

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

export function readStale(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  recordCacheEvent(key, 'STALE');
  return entry.value;
}

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

    cache.del(key);
    return value;
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs }, lifetimeMs / 1000);
  return value;
}
