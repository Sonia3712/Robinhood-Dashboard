import { geckoTerminalClient } from '../services/geckoTerminal.js';
import { dexScreenerClient } from '../services/dexScreener.js';
import { NETWORK } from '../utils/normalize.js';
import { createCache, fetchCached } from '../utils/cache.js';
import { withTimeout } from '../utils/rateLimiter.js';
import {
  getPage,
  savePage,
  getPoolsByPage,
  getPoolsByDex,
  isPageFresh,
  getPageCount,
  updatePoolFromWebSocket,
} from '../db/poolStore.js';
import { logThrottled } from '../utils/logger.js';

const providerCache = createCache();
const PROVIDER_TIMEOUT_MS = 15_000;

const CATEGORY_KEYS = {
  new: 'new-pools',
  trending: 'trending',
  highVolume: 'high-volume',
};

function categoryToKey(category) {
  return CATEGORY_KEYS[category] || category;
}

function makeCacheKey(category, page) {
  return `provider:${NETWORK}:${categoryToKey(category)}:${page}`;
}

async function fetchFromProvider(category, page) {
  const fetcher = getProviderFetcher(category);
  if (!fetcher) {
    throw new Error(`Unknown category: ${category}`);
  }

  return withTimeout(() => fetcher(page), PROVIDER_TIMEOUT_MS, `GeckoTerminal ${category}`);
}

function getProviderFetcher(category) {
  switch (category) {
    case 'new':
      return geckoTerminalClient.getNewPools.bind(geckoTerminalClient);
    case 'trending':
      return geckoTerminalClient.getTrendingPools.bind(geckoTerminalClient);
    case 'highVolume':
      return geckoTerminalClient.getTopPoolsByVolume.bind(geckoTerminalClient);
    default:
      return null;
  }
}

function isRateLimitError(error) {
  return error?.status === 429 || error?.rateLimited === true;
}

export async function getNewPools(page = 1) {
  return getPoolsWithPersistence('new', page);
}

export async function getTrendingPools(page = 1) {
  return getPoolsWithPersistence('trending', page);
}

export async function getTopPoolsByVolume(page = 1) {
  return getPoolsWithPersistence('highVolume', page);
}

async function getPoolsWithPersistence(category, page) {
  const cacheKey = makeCacheKey(category, page);

  // 1. Try memory cache first (fastest)
  const cached = providerCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    logThrottled('POOLS', `${category}:cache_hit`, `${category} page ${page} served from memory cache`);
    return cached.value;
  }

  // 2. Try MongoDB (persistent layer)
  try {
    const pageData = await getPage(NETWORK, category, page);

    if (pageData && pageData.pools.length > 0) {
      // Check freshness
      if (pageData.isFresh) {
        logThrottled('POOLS', `${category}:mongo_hit_fresh`, `${category} page ${page} served from MongoDB (fresh)`);
        // Populate memory cache
        providerCache.set(cacheKey, { value: pageData.pools, expiresAt: Date.now() + 60_000 });
        return pageData.pools;
      }

      // Stale data - serve it but trigger background refresh
      logThrottled('POOLS', `${category}:mongo_hit_stale`, `${category} page ${page} served from MongoDB (stale, age: ${pageData.ageMs}ms)`);
      providerCache.set(cacheKey, { value: pageData.pools, expiresAt: Date.now() + 60_000 });

      // Trigger background refresh (fire and forget)
      triggerBackgroundRefresh(category, page);

      return pageData.pools;
    }
  } catch (error) {
    logThrottled('POOLS', `${category}:mongo_error`, `MongoDB read error: ${error.message}`);
  }

  // 3. Cache miss + MongoDB miss/stale -> fetch from provider
  try {
    logThrottled('POOLS', `${category}:provider_fetch`, `${category} page ${page} fetching from GeckoTerminal`);
    const pools = await fetchCached(providerCache, cacheKey, async () => {
      const result = await fetchFromProvider(category, page);
      const hasMore = Array.isArray(result) && result.length >= 20;
      await savePage(NETWORK, category, page, result, hasMore);
      return result;
    }, 60_000); // 1 minute cache TTL

    return pools;
  } catch (error) {
    // If provider fails but we have stale MongoDB data, return that
    try {
      const pageData = await getPage(NETWORK, category, page);
      if (pageData && pageData.pools.length > 0) {
        logThrottled('POOLS', `${category}:provider_failed_fallback`, `${category} page ${page} provider failed, serving stale MongoDB data`);
        return pageData.pools;
      }
    } catch (fallbackError) {
      logThrottled('POOLS', `${category}:fallback_error`, `Fallback also failed: ${fallbackError.message}`);
    }

    // Re-throw with rate limit info preserved
    if (isRateLimitError(error)) {
      error.rateLimited = true;
    }
    throw error;
  }
}

function triggerBackgroundRefresh(category, page) {
  // Fire and forget - don't await
  setImmediate(async () => {
    try {
      logThrottled('POOLS', `${category}:bg_refresh`, `Background refresh for ${category} page ${page}`);
      const pools = await fetchFromProvider(category, page);
      const hasMore = Array.isArray(pools) && pools.length >= 20;
      await savePage(NETWORK, category, page, pools, hasMore);

      // Update memory cache with fresh data
      const cacheKey = makeCacheKey(category, page);
      providerCache.set(cacheKey, { value: pools, expiresAt: Date.now() + 60_000 });

      logThrottled('POOLS', `${category}:bg_refresh_done`, `Background refresh complete for ${category} page ${page}`);
    } catch (error) {
      logThrottled('POOLS', `${category}:bg_refresh_failed`, `Background refresh failed: ${error.message}`);
    }
  });
}

export async function getPoolByAddress(poolAddress) {
  // Try provider cache first
  const cacheKey = `pool:detail:${NETWORK}:${poolAddress.toLowerCase()}`;
  const cached = providerCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.value;
  }

  try {
    const pool = await geckoTerminalClient.getPool(poolAddress);
    if (pool) {
      providerCache.set(cacheKey, { value: pool, expiresAt: Date.now() + 60_000 });
      return pool;
    }
  } catch (error) {
    logThrottled('POOLS', `detail:gecko_error`, `GeckoTerminal pool detail failed: ${error.message}`);
  }

  // Fallback to DEX Screener
  try {
    const pool = await dexScreenerClient.getPair(NETWORK, poolAddress);
    if (pool) {
      providerCache.set(cacheKey, { value: pool, expiresAt: Date.now() + 60_000 });
    }
    return pool;
  } catch (error) {
    logThrottled('POOLS', `detail:dex_error`, `DEX Screener pool detail failed: ${error.message}`);
    return null;
  }
}

export async function getPoolsByDexForCategory(category, dexId, maxPages = 4) {
  // This is used for DEX filtering - fetches from MongoDB only
  const allPools = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const pools = await getPoolsByDex(NETWORK, category, page, dexId);
      allPools.push(...pools);
    } catch (error) {
      logThrottled('POOLS', `${category}:dex_filter_error`, `Error fetching pools for DEX ${dexId}: ${error.message}`);
    }
  }
  return allPools;
}

export async function getCategoryPageCount(category) {
  return getPageCount(NETWORK, category);
}

export async function isCategoryPageFresh(category, page) {
  return isPageFresh(NETWORK, category, page);
}

export { updatePoolFromWebSocket } from '../db/poolStore.js';