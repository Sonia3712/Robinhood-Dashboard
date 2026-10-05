import { Router } from 'express';
import {
  getNewPools,
  getTopPoolsByVolume,
  getTrendingPools,
  getPoolByAddress,
} from '../providers/poolProvider.js';
import config from '../config.js';
import { logThrottled } from '../utils/logger.js';
import {
  MAX_PAGE,
  PAGE_SIZE,
  readNetwork,
  readPage,
  isSupportedNetwork,
} from '../utils/parseQuery.js';

const router = Router();

const LISTS = {
  new: { handler: getNewPools, feature: 'new-pools' },
  trending: { handler: getTrendingPools, feature: 'trending' },
  'high-volume': { handler: getTopPoolsByVolume, feature: 'high-volume' },
};

function retryAfterSeconds(error) {
  const retryAfterMs = Number(error?.retryAfterMs);
  const ms = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 10_000;
  return Math.max(1, Math.ceil(ms / 1000));
}

for (const [path, { handler, feature }] of Object.entries(LISTS)) {
  router.get(`/${path}`, async (req, res) => {
    if (!isSupportedNetwork(req.query.network)) {
      return res.status(400).json({
        error: `Only network "${config.network}" is supported`,
        feature,
        pools: [],
      });
    }

    const network = readNetwork(req.query.network);
    const page = readPage(req.query.page);

    try {
      const pools = await handler(page);

      res.json({
        feature,
        network,
        page,
        count: pools.length,
        hasMore: pools.length >= PAGE_SIZE && page < MAX_PAGE,
        rateLimited: false,
        pools,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error?.status === 429) {
        const retryAfter = retryAfterSeconds(error);

        logThrottled(
          'POOLS',
          `${feature}:429`,
          `${feature} page=${page} rate limited by GeckoTerminal, clients asked to wait ${retryAfter}s`,
        );

        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: `GeckoTerminal is rate limiting ${feature}`,
          detail: 'The upstream provider is rate limiting requests. Retry after the delay above.',
          feature,
          page,
          hasMore: false,
          rateLimited: true,
          retryAfterMs: retryAfter * 1000,
          pools: [],
          updatedAt: new Date().toISOString(),
        });
      }

      logThrottled('POOLS', `${feature}:error`, `${feature} page=${page} error: ${error.message}`);
      res.status(502).json({
        error: `Failed to load ${feature} pools`,
        detail: error.message,
        feature,
        page,
        hasMore: false,
        rateLimited: false,
        pools: [],
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

router.get('/:chainId/:poolAddress', async (req, res) => {
  const { chainId, poolAddress } = req.params;

  if (Number(chainId) !== config.chainId) {
    return res.status(400).json({
      error: `Only chainId ${config.chainId} is supported`,
      pool: null,
    });
  }

  try {
    const pool = await getPoolByAddress(poolAddress);
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found', pool: null });
    }
    res.json({ pool });
  } catch (error) {
    logThrottled('POOLS', `detail:error`, `Pool detail error: ${error.message}`);
    res.status(502).json({ error: 'Failed to load pool', detail: error.message, pool: null });
  }
});

export default router;
