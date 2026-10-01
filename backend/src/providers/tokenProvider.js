

import { geckoTerminalClient } from '../services/geckoTerminal.js';
import { rpcClient } from '../services/robinhoodRpc.js';
import {
  NETWORK,
  normalizeToken,
  deduplicateTokens,
  toLowerCaseAddress,
} from '../utils/normalize.js';
import { createCache, fetchCached } from '../utils/cache.js';

const tokenCache = createCache();
import { withTimeout } from '../utils/timeout.js';

const TTL = 3600_000;

export async function getTokenByAddress(address) {
  const addr = toLowerCaseAddress(address);
  if (!addr) return null;

  const key = `detail:${NETWORK}:${addr}`;

  return fetchCached(tokenCache, key, async () => {
    const [indexed, onChain, metadata] = await Promise.allSettled([
      withTimeout(() => geckoTerminalClient.getToken(addr), 8000, 'GeckoTerminal token'),
      withTimeout(() => rpcClient.isContract(addr), 5000, 'RPC isContract'),
      withTimeout(() => rpcClient.getTokenMetadata(addr), 8000, 'RPC metadata'),
    ]);

    const verifiedOnChain = onChain.status === 'fulfilled' ? onChain.value === true : false;
    const gt = indexed.status === 'fulfilled' ? indexed.value : null;
    const rpc = metadata.status === 'fulfilled' ? metadata.value : null;

    // Neither source knows this address.
    if (!gt && !rpc && !verifiedOnChain) return null;

    const source = gt ? 'geckoterminal' : 'rpc';
    const token = normalizeToken(
      {
        address: addr,
        symbol: gt?.symbol || rpc?.symbol,
        name: gt?.name || rpc?.name,
        iconUrl: gt?.iconUrl || null,
        decimals: gt?.decimals ?? rpc?.decimals,
        totalSupply: rpc?.totalSupply,
      },
      source,
    );

    token.verifiedOnChain = verifiedOnChain;
    return token;
  }, TTL);
}

export async function getTokenBySymbol(symbol) {
  const needle = String(symbol || '').trim().toLowerCase();
  if (!needle) return [];

  const pools = await geckoTerminalClient.searchPools(symbol);
  const tokens = [];

  for (const pool of pools) {
    for (const token of [pool.baseToken, pool.quoteToken]) {
      if (token?.symbol?.toLowerCase() === needle) {
        tokens.push(normalizeToken(token, 'geckoterminal'));
      }
    }
  }

  return deduplicateTokens(tokens);
}

export async function searchTokens(query) {
  const needle = String(query || '').trim();
  if (!needle) return [];

  const key = `search:${NETWORK}:${needle.toLowerCase()}`;

  return fetchCached(tokenCache, key, async () => {
    const pools = await geckoTerminalClient.searchPools(needle);
    const lower = needle.toLowerCase();
    const tokens = [];

    for (const pool of pools) {
      for (const token of [pool.baseToken, pool.quoteToken]) {
        if (!token?.address) continue;
        const symbol = token.symbol?.toLowerCase() ?? '';
        const name = token.name?.toLowerCase() ?? '';
        if (symbol.includes(lower) || name.includes(lower)) {
          tokens.push(normalizeToken(token, 'geckoterminal'));
        }
      }
    }

    return deduplicateTokens(tokens);
  }, 300_000);
}

export function verifyContract(address) {
  return rpcClient.isContract(address);
}

export function getTokenMetadataFromRPC(address) {
  return rpcClient.getTokenMetadata(address);
}
