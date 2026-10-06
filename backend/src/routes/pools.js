import { Router } from 'express';
import {
  getNewPools,
  getTopPoolsByVolume,
  getTrendingPools,
  getPoolByAddress,
  getCategoryPageCount,
} from '../providers/poolProvider.js';
import config from '../config.js';
import { logThrottled } from '../utils/logger.js';
import { PAGE_SIZE, readNetwork, readPage, isSupportedNetwork } from '../utils/parseQuery.js';

const MAX_PAGE = 4;

const router = Router();

const LISTS = {
  new: { handler: getNewPools, feature: 'new-pools', category: 'new' },
  trending: { handler: getTrendingPools, feature: 'trending', category: 'trending' },
  'high-volume': { handler: getTopPoolsByVolume, feature: 'high-volume', category: 'highVolume' },
};

function retryAfterSeconds(error) {
  const retryAfterMs = Number(error?.retryAfterMs);
  const ms = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 10_000;
  return Math.max(1, Math.ceil(ms / 1000));
}

async function getHasMore(category, page, currentPoolCount) {
  if (page >= MAX_PAGE) return false;
  if (currentPoolCount < PAGE_SIZE) return false;

  // Check if next page already exists in MongoDB
  try {
    const pageCount = await getCategoryPageCount(category);
    if (pageCount > page) return true;
  } catch {
    // If we can't check, fall back to pool count heuristic
  }

  return currentPoolCount >= PAGE_SIZE;
}

for (const [path, { handler, feature, category }] of Object.entries(LISTS)) {
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

    // Enforce max page = 4
    if (page > MAX_PAGE) {
      return res.status(400).json({
        error: `Page ${page} exceeds maximum of ${MAX_PAGE}`,
        feature,
        page,
        pools: [],
      });
    }

    try {
      const pools = await handler(page);
      const hasMore = await getHasMore(category, page, pools.length);

      res.json({
        feature,
        network,
        page,
        count: pools.length,
        hasMore,
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
