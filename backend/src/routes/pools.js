import { Router } from 'express';
import {
  getNewPools,
  getTopPoolsByVolume,
  getTrendingPools,
  getPoolByAddress,
} from '../providers/poolProvider.js';
import config from '../config.js';
import { readNetwork, readPage, isSupportedNetwork } from '../utils/parseQuery.js';

const router = Router();

// Each feature is its own GeckoTerminal endpoint with its own cache key and
// TTL. They are registered from one table so a new list is one line here.
const LISTS = {
  new: { handler: getNewPools, feature: 'new-pools' },
  trending: { handler: getTrendingPools, feature: 'trending' },
  'high-volume': { handler: getTopPoolsByVolume, feature: 'high-volume' },
};

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
      // `updatedAt` is the time this RESPONSE was assembled, not when the data
      // was fetched. It is part of the response contract, so it is not moved
      // into the cached payload.
      res.json({
        feature,
        network,
        page,
        count: pools.length,
        pools,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Upstream failure is not a client error. Report 502 so the frontend can
      // distinguish "the provider is down" from "your request was wrong".
      console.error(`[POOLS] ${feature} error:`, error.message);
      res.status(502).json({
        error: `Failed to load ${feature} pools`,
        detail: error.message,
        feature,
        page,
        pools: [],
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

// Pool detail by address.
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
    console.error('[POOLS] Pool detail error:', error.message);
    res.status(502).json({ error: 'Failed to load pool', detail: error.message, pool: null });
  }
});

export default router;
