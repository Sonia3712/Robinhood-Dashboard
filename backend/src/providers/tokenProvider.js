import { geckoTerminalClient } from '../services/geckoTerminal.js';
import {
  NETWORK,
  normalizeToken,
  deduplicateTokens,
  toLowerCaseAddress,
} from '../utils/normalize.js';
import { createCache, fetchCached } from '../utils/cache.js';
import { withTimeout } from '../utils/rateLimiter.js';

const tokenCache = createCache();

const TTL = 3600_000;

export async function getTokenByAddress(address) {
  const addr = toLowerCaseAddress(address);
  if (!addr) return null;

  const key = `detail:${NETWORK}:${addr}`;

  return fetchCached(tokenCache, key, async () => {
    const [indexed] = await Promise.allSettled([
      withTimeout(() => geckoTerminalClient.getToken(addr), 8000, 'GeckoTerminal token'),
    ]);

    const gt = indexed.status === 'fulfilled' ? indexed.value : null;

    if (!gt) return null;

    const token = normalizeToken(
      {
        address: addr,
        symbol: gt?.symbol,
        name: gt?.name,
        iconUrl: gt?.iconUrl || null,
        decimals: gt?.decimals,
        totalSupply: gt?.totalSupply,
      },
      'geckoterminal',
    );

    token.verifiedOnChain = false;
    return token;
  }, TTL);
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
