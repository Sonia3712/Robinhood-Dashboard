import { apiRateLimiter } from '../utils/rateLimiter.js';
import { createCache, fetchCached, readStale } from '../utils/cache.js';
import { requestJson } from './httpClient.js';
import {
  NETWORK,
  makePool,
  num,
  parseDexVersion,
  toLowerCaseAddress,
  deduplicatePools,
} from '../utils/normalize.js';
import config from '../config.js';

const dexScreenerCache = createCache();

const BASE_URL = config.dexScreenerBaseUrl;

const TTL_SEARCH = 300_000;
const TTL_PAIR = 120_000;
const STALE_GRACE = 15 * 60_000;

class DexScreenerClient {
  async request(url, { signal } = {}) {
    return apiRateLimiter.execute(async (rateLimitSignal) => {
      return requestJson(url, {
        signal: signal ?? rateLimitSignal,
        label: 'DEX Screener',
      });
    });
  }

  #url(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async search(query, { chain = NETWORK } = {}) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const key = `search:${chain}:${trimmed.toLowerCase()}`;
    const url = this.#url('/search', { q: trimmed });

    let raw;
    try {
      raw = await fetchCached(dexScreenerCache, key, async () => {
        const data = await this.request(url);
        return Array.isArray(data?.pairs) ? data.pairs : [];
      }, TTL_SEARCH);

      dexScreenerCache.set(
        key,
        { value: raw, expiresAt: Date.now() + TTL_SEARCH },
        (TTL_SEARCH + STALE_GRACE) / 1000,
      );
    } catch (error) {
      const stale = readStale(dexScreenerCache, key);
      if (!stale) throw error;
      raw = stale;
    }

    const pairs = Array.isArray(raw) ? raw : [];
    return this.#normalizeAll(pairs, { chain });
  }

  async getPair(chainId, pairAddress) {
    const address = toLowerCaseAddress(pairAddress);
    if (!address) return null;

    const key = `pair:${chainId}:${address}`;
    const url = this.#url(`/pairs/${chainId}/${address}`);

    let pair;
    try {
      pair = await fetchCached(dexScreenerCache, key, async () => {
        const data = await this.request(url);
        return data?.pairs?.[0] ?? data?.pair ?? null;
      }, TTL_PAIR);
    } catch (error) {
      if (error?.status === 404) return null;
      const stale = readStale(dexScreenerCache, key);
      return stale ? stale : null;
    }

    if (!pair) return null;
    const [pool] = this.#normalizeAll([pair], { chain: chainId });
    return pool ?? null;
  }

  #normalizeAll(pairs, { chain }) {
    return deduplicatePools(
      (Array.isArray(pairs) ? pairs : [])

        .filter((pair) => pair?.chainId === chain)
        .map((pair) => this.#toPool(pair))
        .filter((pool) => pool.poolAddress !== null),
    );
  }

  #toPool(pair) {
    const info = pair.info ?? null;

    const pairImage = firstImage(info);

    return makePool({
      poolAddress: pair.pairAddress,
      poolCreatedAt: normalizeTimestamp(pair.pairCreatedAt),
      dex: {
        id: pair.dexId ?? null,
        name: pair.dexId ? prettifyDexId(pair.dexId) : null,
        version: parseDexVersion(...(Array.isArray(pair.labels) ? pair.labels : []), pair.dexId),
      },
      baseToken: {
        address: pair.baseToken?.address,
        symbol: pair.baseToken?.symbol,
        name: pair.baseToken?.name,
        iconUrl: pairImage,
        decimals: null,
      },
      quoteToken: {
        address: pair.quoteToken?.address,
        symbol: pair.quoteToken?.symbol,
        name: pair.quoteToken?.name,
        iconUrl: null,
        decimals: null,
      },
      priceUsd: pair.priceUsd,
      priceNative: pair.priceNative,
      marketCap: pair.marketCap,
      fdv: pair.fdv,
      liquidityUsd: pair.liquidity?.usd,
      volume: {
        m5: pair.volume?.m5,
        m1: pair.volume?.h1,
        h6: pair.volume?.h6,
        h24: pair.volume?.h24,
      },
      priceChange: {
        m5: pair.priceChange?.m5,
        m1: pair.priceChange?.h1,
        h6: pair.priceChange?.h6,
        h24: pair.priceChange?.h24,
      },
      txns: {
        m5: pair.txns?.m5,
        m1: pair.txns?.h1,
        h6: pair.txns?.h6,
        h24: pair.txns?.h24,
      },

      traders: null,
      boosts: pair.boosts?.active ?? null,
      url: pair.url ?? null,
      sources: ['dexscreener'],
    });
  }
}

function firstImage(info) {
  if (!info) return null;
  if (Array.isArray(info.images) && info.images.length > 0) return info.images[0] || null;
  return info.imageUrl || info.openGraph || null;
}

function normalizeTimestamp(value) {
  const parsed = num(value);
  if (parsed === null) return null;
  const asNumber = parsed > 1e12 ? parsed : parsed * 1000;
  const date = new Date(asNumber);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function prettifyDexId(dexId) {
  return String(dexId)
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const dexScreenerClient = new DexScreenerClient();
export default dexScreenerClient;
