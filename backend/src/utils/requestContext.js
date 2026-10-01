

import { AsyncLocalStorage } from 'node:async_hooks';
import config from '../config.js';

const storage = new AsyncLocalStorage();

export function isContextEnabled() {
  return config.isDevelopment;
}

export function createRequestContext() {
  return { cacheEvents: [] };
}

export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

/** The active context, or null outside development or when detached. */
export function getContext() {
  if (!config.isDevelopment) return null;
  return storage.getStore() ?? null;
}

/**
 * outcome is one of:
 *   HIT        fresh value served from memory
 *   MISS       nothing fresh; the caller went to the provider
 *   STALE      served from the stale-on-error window
 *   COALESCED  joined an identical request that was already in flight
 */
export function recordCacheEvent(key, outcome) {
  const context = getContext();
  if (!context) return;
  context.cacheEvents.push({ key, outcome });
}


