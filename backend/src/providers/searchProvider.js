import { geckoTerminalClient } from '../services/geckoTerminal.js';
import { dexScreenerClient } from '../services/dexScreener.js';
import { rpcClient } from '../services/robinhoodRpc.js';
import { createCache, fetchCached } from '../utils/cache.js';
import { withTimeout } from '../utils/rateLimiter.js';
import {
  NETWORK,
  normalizeToken,
  deduplicatePools,
  deduplicateTokens,
  mergePoolData,
  sortPoolsByVolumeDesc,
  toLowerCaseAddress,
} from '../utils/normalize.js';

const searchCache = createCache();

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PROVIDER_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 5_000;
const TTL = 300_000;

export function isAddressQuery(query) {
  return ADDRESS_PATTERN.test(String(query || '').trim());
}

export async function search(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return emptyResult('', 'empty');
  }

  const key = `${isAddressQuery(query) ? 'addr' : 'name'}:${query.toLowerCase()}:${NETWORK}`;

  return fetchCached(searchCache, key, async () => {
    return isAddressQuery(query) ? searchByAddress(query) : searchByText(query);
  }, TTL);
}

async function searchByAddress(query) {
  const address = toLowerCaseAddress(query);

  const [gecko, dex, onChain] = await Promise.allSettled([
    withTimeout(() => geckoTerminalClient.getPoolsForToken(address), PROVIDER_TIMEOUT_MS, 'GeckoTerminal'),
    withTimeout(() => searchDexByExactAddress(address), PROVIDER_TIMEOUT_MS, 'DEX Screener'),
    withTimeout(() => rpcClient.isContract(address), RPC_TIMEOUT_MS, 'RPC isContract'),
  ]);

  const pools = mergePoolSets([
    fulfilled(gecko),
    fulfilled(dex),
  ]);

  const verifiedOnChain = onChain.status === 'fulfilled' ? onChain.value === true : false;

  const tokens = await collectTokens(address, pools, verifiedOnChain);

  return {
    query,
    matchType: 'exact-address',
    address,
    verifiedOnChain,
    tokens,
    pools: sortPoolsByVolumeDesc(pools),
    sources: describeSources(gecko, dex, onChain),
  };
}

async function searchDexByExactAddress(address) {
  const pairs = await dexScreenerClient.search(address, { chain: NETWORK });
  return pairs.filter(
    (pool) =>
      toLowerCaseAddress(pool.baseToken?.address) === address ||
      toLowerCaseAddress(pool.quoteToken?.address) === address,
  );
}

async function collectTokens(address, pools, verifiedOnChain) {
  const fromPools = [];
  for (const pool of pools) {
    for (const token of [pool.baseToken, pool.quoteToken]) {
      if (toLowerCaseAddress(token?.address) === address) {
        fromPools.push(normalizeToken(token, pool.sources?.[0] || 'unknown'));
      }
    }
  }

  if (fromPools.length > 0) return deduplicateTokens(fromPools);

  if (!verifiedOnChain) return [];

  try {
    const metadata = await rpcClient.getTokenMetadata(address);
    if (!metadata?.symbol && !metadata?.name) return [];
    return [normalizeToken({ address, ...metadata }, 'rpc')];
  } catch (error) {
    console.warn('[SEARCH] RPC token metadata failed:', error.message);
    return [];
  }
}

async function searchByText(query) {
  const [gecko, dex] = await Promise.allSettled([
    withTimeout(() => geckoTerminalClient.searchPools(query), PROVIDER_TIMEOUT_MS, 'GeckoTerminal'),
    withTimeout(() => dexScreenerClient.search(query, { chain: NETWORK }), PROVIDER_TIMEOUT_MS, 'DEX Screener'),
  ]);

  const geckoPools = filterToMatch(fulfilled(gecko), query);
  const dexPools = filterToMatch(fulfilled(dex), query);

  const pools = mergePoolSets([geckoPools, dexPools]);
  const tokens = deduplicateTokens(collectPoolTokens(pools));

  return {
    query,
    matchType: 'text',
    address: null,
    verifiedOnChain: false,
    tokens,
    pools: sortPoolsByVolumeDesc(pools),
    sources: describeSources(gecko, dex, null),
  };
}

function filterToMatch(pools, query) {
  if (!Array.isArray(pools) || pools.length === 0) return [];

  const needle = query.trim().toLowerCase();
  if (!needle) return pools;

  const matched = pools.filter((pool) => {
    for (const token of [pool.baseToken, pool.quoteToken]) {
      if (!token) continue;
      if (token.address && token.address.toLowerCase() === needle) return true;
      if (token.symbol && token.symbol.toLowerCase().includes(needle)) return true;
      if (token.name && token.name.toLowerCase().includes(needle)) return true;
    }
    return false;
  });

  return matched.length > 0 ? matched : pools;
}

function collectPoolTokens(pools) {
  const tokens = [];
  for (const pool of pools) {
    const source = pool.sources?.[0] || 'unknown';
    if (pool.baseToken?.address) tokens.push(normalizeToken(pool.baseToken, source));
    if (pool.quoteToken?.address) tokens.push(normalizeToken(pool.quoteToken, source));
  }
  return tokens;
}

function fulfilled(result) {
  if (result?.status !== 'fulfilled') {
    if (result?.status === 'rejected') {
      console.warn('[SEARCH] provider failed:', result.reason?.message ?? result.reason);
    }
    return [];
  }
  return Array.isArray(result.value) ? result.value : [];
}

function mergePoolSets(sets) {
  const merged = new Map();

  for (const set of sets) {
    for (const pool of Array.isArray(set) ? set : []) {
      const key = `${pool.chainId}:${pool.poolAddress}`;
      if (!pool.poolAddress) continue;
      merged.set(key, merged.has(key) ? mergePoolData(merged.get(key), pool) : pool);
    }
  }

  return Array.from(merged.values());
}

function describeSources(...results) {
  const names = ['geckoterminal', 'dexscreener', 'rpc'];
  const out = {};
  results.forEach((result, index) => {
    out[names[index]] = result?.status === 'fulfilled';
  });
  return out;
}

function emptyResult(query, matchType) {
  return {
    query,
    matchType,
    address: null,
    verifiedOnChain: false,
    tokens: [],
    pools: [],
    sources: { geckoterminal: false, dexscreener: false, rpc: false },
  };
}
