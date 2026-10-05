import { geckoTerminalRateLimiter } from '../utils/rateLimiter.js';
import { createCache, fetchCached, readStale } from '../utils/cache.js';
import { logThrottled } from '../utils/logger.js';
import { requestJson } from './httpClient.js';
import {
  NETWORK,
  makePool,
  int,
  toLowerCaseAddress,
  sortPoolsByVolumeDesc,
  sortPoolsByAgeAsc,
  deduplicatePools,
} from '../utils/normalize.js';
import config from '../config.js';

const poolCache = createCache();
const tokenCache = createCache();

const API_BASE = config.geckoTerminalBaseUrl;
const NETWORK_BASE = `${API_BASE}/networks/${NETWORK}`;

const INCLUDE_POOL_RELATIONS = 'base_token,quote_token,dex';

const TTL_NEW = 45_000;
const TTL_TRENDING = 120_000;
const TTL_VOLUME = 60_000;
const TTL_DETAIL = 60_000;
const TTL_SEARCH = 300_000;

const STALE_GRACE = 15 * 60_000;

const MIN_COOLDOWN_MS = 1_000;
const DEFAULT_COOLDOWN_MS = 10_000;
const MAX_COOLDOWN_MS = 90_000;

// Once a provider answers 429, every endpoint of that provider is paused until
// the cooldown expires, so a user scrolling back to the same page cannot turn
// one rate limit response into a burst of further requests. Repeated 429s grow
// the cooldown; the first success clears it.
const cooldowns = new Map();
const strikes = new Map();

function cooldownRemaining(feature) {
  const entry = cooldowns.get(feature);
  if (!entry) return 0;
  const remaining = entry.until - Date.now();
  if (remaining <= 0) {
    cooldowns.delete(feature);
    return 0;
  }
  return remaining;
}

function clearCooldown(feature) {
  cooldowns.delete(feature);
  strikes.delete(feature);
}

function startCooldown(feature, error) {
  const retryAfterMs = Number(error?.retryAfterMs);
  const count = (strikes.get(feature) ?? 0) + 1;
  strikes.set(feature, count);

  const escalated = DEFAULT_COOLDOWN_MS * 2 ** Math.min(count - 1, 4);
  const waitMs = Math.min(
    MAX_COOLDOWN_MS,
    Math.max(
      MIN_COOLDOWN_MS,
      Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : escalated,
    ),
  );

  cooldowns.set(feature, { until: Date.now() + waitMs });
  geckoTerminalRateLimiter.pause(waitMs);

  logThrottled(
    'GECKO',
    `${feature}:cooldown`,
    `${feature} rate limited by GeckoTerminal, pausing requests for `
    + `${Math.round(waitMs / 1000)}s (strike ${count})`,
  );

  return waitMs;
}

function rateLimitError(feature, remainingMs) {
  const error = new Error(`GeckoTerminal is rate limiting ${feature}`);
  error.status = 429;
  error.rateLimited = true;
  error.cooldown = true;
  error.retryAfterMs = Math.max(MIN_COOLDOWN_MS, remainingMs);
  return error;
}

class GeckoTerminalClient {
  async request(url, { signal, endpoint, page } = {}) {
    const data = await geckoTerminalRateLimiter.execute(
      (rateLimitSignal) => requestJson(url, {
        signal: signal ?? rateLimitSignal,
        headers: { Accept: 'application/json' },
        label: 'GeckoTerminal',
      }),
      { endpoint, page },
    );

    if (endpoint) clearCooldown(endpoint);
    return data;
  }

  #url(base, endpoint, params = {}) {
    const url = new URL(`${base}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async getNewPools(page = 1) {
    return this.#list('new', this.#url(NETWORK_BASE, '/new_pools', {
      page,
      include: INCLUDE_POOL_RELATIONS,
    }), page, TTL_NEW, sortPoolsByAgeAsc);
  }

  async getTrendingPools(page = 1) {
    return this.#list('trending', this.#url(NETWORK_BASE, '/trending_pools', {
      page,
      include: INCLUDE_POOL_RELATIONS,
    }), page, TTL_TRENDING);
  }

  async getTopPoolsByVolume(page = 1) {
    return this.#list('high-volume', this.#url(NETWORK_BASE, '/pools', {
      page,
      sort: 'h24_volume_usd_desc',
      include: INCLUDE_POOL_RELATIONS,
    }), page, TTL_VOLUME);
  }

  async #list(feature, url, page, ttlMs, sort = (pools) => pools) {
    const key = `${feature}:${NETWORK}:${url}`;

    const pausedFor = cooldownRemaining(feature);
    if (pausedFor > 0) {
      const stale = readStale(poolCache, key);
      if (stale !== null) return stale;
      throw rateLimitError(feature, pausedFor);
    }

    try {
      const value = await fetchCached(poolCache, key, async () => {
        const data = await this.request(url, { endpoint: feature, page });
        return sort(this.#toPools(data));
      }, ttlMs, STALE_GRACE);

      poolCache.set(key, { value, expiresAt: Date.now() + ttlMs }, (ttlMs + STALE_GRACE) / 1000);
      return value;
    } catch (error) {
      if (error?.status === 429 && !error.cooldown) startCooldown(feature, error);

      const stale = readStale(poolCache, key);
      if (stale !== null) return stale;
      throw error;
    }
  }

  async getPool(poolAddress) {
    const address = toLowerCaseAddress(poolAddress);
    if (!address) return null;

    const feature = 'pool-detail';
    const key = `pool:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/pools/${address}`, {
      include: INCLUDE_POOL_RELATIONS,
    });

    const pausedFor = cooldownRemaining(feature);
    if (pausedFor > 0) throw rateLimitError(feature, pausedFor);

    try {
      return await fetchCached(poolCache, key, async () => {
        const data = await this.request(url, { endpoint: feature });
        const [pool] = this.#toPools(data);
        return pool ?? null;
      }, TTL_DETAIL);
    } catch (error) {
      if (error?.status === 429 && !error.cooldown) startCooldown(feature, error);
      if (error?.status === 404) return null;
      const stale = readStale(poolCache, key);
      if (stale !== null) return stale;
      throw error;
    }
  }

  async getPoolsForToken(tokenAddress) {
    const address = toLowerCaseAddress(tokenAddress);
    if (!address) return [];

    const feature = 'token-pools';
    const key = `token-pools:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/tokens/${address}/pools`, {
      include: INCLUDE_POOL_RELATIONS,
    });

    const pausedFor = cooldownRemaining(feature);
    if (pausedFor > 0) throw rateLimitError(feature, pausedFor);

    try {
      return await fetchCached(poolCache, key, async () => {
        const data = await this.request(url, { endpoint: feature });
        return sortPoolsByVolumeDesc(this.#toPools(data));
      }, TTL_DETAIL);
    } catch (error) {
      if (error?.status === 429 && !error.cooldown) startCooldown(feature, error);
      if (error?.status === 404) return [];
      const stale = readStale(poolCache, key);
      if (stale !== null) return stale;
      throw error;
    }
  }

  async getToken(tokenAddress) {
    const address = toLowerCaseAddress(tokenAddress);
    if (!address) return null;

    const feature = 'token';
    const key = `token:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/tokens/${address}`);

    const pausedFor = cooldownRemaining(feature);
    if (pausedFor > 0) throw rateLimitError(feature, pausedFor);

    try {
      const data = await fetchCached(tokenCache, key, () => this.request(url, { endpoint: feature }), 300_000);
      const attributes = data?.data?.attributes ?? null;
      if (!attributes) return null;
      return {
        address,
        symbol: attributes.symbol || null,
        name: attributes.name || null,
        iconUrl: attributes.image_url || null,
        decimals: int(attributes.decimals),
      };
    } catch (error) {
      if (error?.status === 429 && !error.cooldown) startCooldown(feature, error);
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async searchPools(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const feature = 'search';
    const key = `search:${NETWORK}:${trimmed.toLowerCase()}`;
    const url = this.#url(API_BASE, '/search/pools', {
      query: trimmed,
      include: INCLUDE_POOL_RELATIONS,
    });

    const pausedFor = cooldownRemaining(feature);
    if (pausedFor > 0) return [];

    try {
      return await fetchCached(tokenCache, key, async () => {
        const data = await this.request(url, { endpoint: feature });
        return sortPoolsByVolumeDesc(this.#toPools(data, { networkScoped: false }));
      }, TTL_SEARCH);
    } catch (error) {
      if (error?.status === 429 && !error.cooldown) startCooldown(feature, error);
      const stale = readStale(tokenCache, key);
      if (stale !== null) return stale;
      return [];
    }
  }

  #toPools(payload, { networkScoped = true } = {}) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length === 0) return [];

    const included = indexIncluded(payload?.included);
    const pools = rows
      .filter((row) => (networkScoped ? isThisNetwork(row) : true))
      .map((row) => this.#toPool(row, included))
      .filter((pool) => pool.poolAddress !== null);

    return deduplicatePools(pools);
  }

  #toPool(row, included) {
    const attributes = row?.attributes ?? {};
    const relationships = row?.relationships ?? {};

    const baseRefId = relationships.base_token?.data?.id ?? null;
    const quoteRefId = relationships.quote_token?.data?.id ?? null;
    const dexRefId = relationships.dex?.data?.id ?? null;

    const baseIncluded = baseRefId ? included.get(baseRefId) : null;
    const quoteIncluded = quoteRefId ? included.get(quoteRefId) : null;
    const dexIncluded = dexRefId ? included.get(dexRefId) : null;

    const nameFallback = splitPoolName(attributes.name);

    const baseAttributes = baseIncluded?.attributes ?? {};
    const quoteAttributes = quoteIncluded?.attributes ?? {};

    const transactions = attributes.transactions ?? {};
    const traders = pickTraders(transactions.h24);

    return makePool({
      poolAddress: attributes.address,
      poolCreatedAt: attributes.pool_created_at,

      dex: {
        id: dexRefId,
        name: dexIncluded?.attributes?.name || prettifyDexId(dexRefId),
        iconUrl:
          dexIncluded?.attributes?.image_url
          || dexIncluded?.attributes?.logo_uri
          || null,
      },

      baseToken: {
        address: baseAttributes.address || stripNetworkPrefix(baseRefId),
        symbol: baseAttributes.symbol || nameFallback.base,
        name: baseAttributes.name || null,
        iconUrl: baseAttributes.image_url || null,
        decimals: baseAttributes.decimals,
      },
      quoteToken: {
        address: quoteAttributes.address || stripNetworkPrefix(quoteRefId),
        symbol: quoteAttributes.symbol || nameFallback.quote,
        name: quoteAttributes.name || null,
        iconUrl: quoteAttributes.image_url || null,
        decimals: quoteAttributes.decimals,
      },

      priceUsd: attributes.base_token_price_usd,
      priceNative: attributes.base_token_price_native_currency,

      marketCap: attributes.market_cap_usd,
      fdv: attributes.fdv_usd,
      liquidityUsd: attributes.reserve_in_usd,

      volume: pickWindows(attributes.volume_usd),
      priceChange: pickWindows(attributes.price_change_percentage),
      txns: pickWindows(transactions),
      traders,

      // Prefer an explicit provider attribute if one ever appears; otherwise use
      // the fee tier parsed from the pool name.
      feePercentage: attributes.pool_fee_percentage ?? nameFallback.feePercentage,

      sources: ['geckoterminal'],
    });
  }
}

const PICKED_WINDOWS = { m5: 'm5', m1: 'h1', h6: 'h6', h24: 'h24' };

function pickWindows(source) {
  const out = {};
  for (const [target, key] of Object.entries(PICKED_WINDOWS)) {
    out[target] = source?.[key] ?? null;
  }
  return out;
}

function pickTraders(window) {
  const buyers = int(window?.buyers);
  if (buyers !== null) return buyers;
  return int(window?.sellers);
}

function indexIncluded(included) {
  const map = new Map();
  for (const item of Array.isArray(included) ? included : []) {
    if (item?.id) map.set(item.id, item);
  }
  return map;
}

function isThisNetwork(row) {
  const id = row?.id ?? '';
  return typeof id === 'string' && id.startsWith(`${NETWORK}_`);
}

function stripNetworkPrefix(refId) {
  if (typeof refId !== 'string') return null;
  const prefix = `${NETWORK}_`;
  return refId.startsWith(prefix) ? refId.slice(prefix.length) : refId;
}

/**
 * The v2 pool payload has no fee attribute; the fee tier is only present as a
 * trailing percentage on the free-text pool name (e.g. "USDG / WETH 0.01%").
 * The value is a percentage, so it is preserved as-is (0.01 => "0.01%"), not
 * as basis points or a protocol tier. Names without a fee yield null.
 */
function splitPoolName(name) {
  if (typeof name !== 'string' || !name.includes('/')) {
    return { base: null, quote: null, feePercentage: null };
  }

  const [rawBase, ...rest] = name.split('/');
  const base = rawBase.trim();
  const restName = rest.join('/') || '';

  const feeMatch = restName.match(/([\d.]+)\s*%\s*$/);
  const quote = (feeMatch ? restName.slice(0, feeMatch.index) : restName).trim();
  const feePercentage = feeMatch ? Number.parseFloat(feeMatch[1]) : null;

  return {
    base: base || null,
    quote: quote || null,
    feePercentage: Number.isFinite(feePercentage) ? feePercentage : null,
  };
}

function prettifyDexId(dexId) {
  if (typeof dexId !== 'string' || !dexId) return null;
  const withoutNetwork = dexId.replace(new RegExp(`[-_]${NETWORK}$`), '');
  return withoutNetwork
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const geckoTerminalClient = new GeckoTerminalClient();
export default geckoTerminalClient;
