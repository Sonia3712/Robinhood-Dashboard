import { apiRateLimiter } from '../utils/rateLimiter.js';
import { createCache, fetchCached, readStale } from '../utils/cache.js';
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

class GeckoTerminalClient {
  async request(url, { signal } = {}) {
    return apiRateLimiter.execute(async (rateLimitSignal) => {

      return requestJson(url, {
        signal: signal ?? rateLimitSignal,
        headers: { Accept: 'application/json' },
        label: 'GeckoTerminal',
      });
    });
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
    }), TTL_NEW, sortPoolsByAgeAsc);
  }

  async getTrendingPools(page = 1) {

    return this.#list('trending', this.#url(NETWORK_BASE, '/trending_pools', {
      page,
      include: INCLUDE_POOL_RELATIONS,
    }), TTL_TRENDING);
  }

  async getTopPoolsByVolume(page = 1) {
    return this.#list('high-volume', this.#url(NETWORK_BASE, '/pools', {
      page,
      sort: 'h24_volume_usd_desc',
      include: INCLUDE_POOL_RELATIONS,
    }), TTL_VOLUME);
  }

  async #list(feature, url, ttlMs, sort = (pools) => pools) {
    const key = `${feature}:${NETWORK}:${url}`;

    try {
      const value = await fetchCached(poolCache, key, async () => {
        const data = await this.request(url);
        return sort(this.#toPools(data));
      }, ttlMs, STALE_GRACE);

      poolCache.set(key, { value, expiresAt: Date.now() + ttlMs }, (ttlMs + STALE_GRACE) / 1000);
      return value;
    } catch (error) {
      const stale = readStale(poolCache, key);
      if (stale) return stale;
      throw error;
    }
  }

  async getPool(poolAddress) {
    const address = toLowerCaseAddress(poolAddress);
    if (!address) return null;

    const key = `pool:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/pools/${address}`, {
      include: INCLUDE_POOL_RELATIONS,
    });

    try {
      return await fetchCached(poolCache, key, async () => {
        const data = await this.request(url);
        const [pool] = this.#toPools(data);
        return pool ?? null;
      }, TTL_DETAIL);
    } catch (error) {

      if (error?.status === 404) return null;
      const stale = readStale(poolCache, key);
      if (stale) return stale;
      throw error;
    }
  }

  async getPoolsForToken(tokenAddress) {
    const address = toLowerCaseAddress(tokenAddress);
    if (!address) return [];

    const key = `token-pools:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/tokens/${address}/pools`, {
      include: INCLUDE_POOL_RELATIONS,
    });

    try {
      return await fetchCached(poolCache, key, async () => {
        const data = await this.request(url);
        return sortPoolsByVolumeDesc(this.#toPools(data));
      }, TTL_DETAIL);
    } catch (error) {
      if (error?.status === 404) return [];
      const stale = readStale(poolCache, key);
      if (stale) return stale;
      throw error;
    }
  }

  async getToken(tokenAddress) {
    const address = toLowerCaseAddress(tokenAddress);
    if (!address) return null;

    const key = `token:${NETWORK}:${address}`;
    const url = this.#url(NETWORK_BASE, `/tokens/${address}`);

    try {
      const data = await fetchCached(tokenCache, key, () => this.request(url), 300_000);
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
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async searchPools(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const key = `search:${NETWORK}:${trimmed.toLowerCase()}`;
    const url = this.#url(API_BASE, '/search/pools', {
      query: trimmed,
      include: INCLUDE_POOL_RELATIONS,
    });

    try {
      return await fetchCached(tokenCache, key, async () => {
        const data = await this.request(url);

        return sortPoolsByVolumeDesc(this.#toPools(data, { networkScoped: false }));
      }, TTL_SEARCH);
    } catch (error) {
      const stale = readStale(tokenCache, key);
      if (stale) return stale;
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

function splitPoolName(name) {
  if (typeof name !== 'string' || !name.includes('/')) return { base: null, quote: null };
  const [rawBase, ...rest] = name.split('/');
  const base = rawBase.trim();
  const quote = (rest.join('/') || '').replace(/\s+[\d.]+%$/, '').trim();
  return { base: base || null, quote: quote || null };
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
