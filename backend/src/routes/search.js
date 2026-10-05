import { Router } from 'express';
import { search, isAddressQuery } from '../providers/searchProvider.js';
import config from '../config.js';
import { isSupportedNetwork } from '../utils/parseQuery.js';

const router = Router();

router.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const respond = (status, body) =>
    res.status(status).json({
      query,
      address: null,
      matchType: isAddressQuery(query) ? 'exact-address' : 'text',
      verifiedOnChain: false,
      tokens: [],
      pools: [],
      sources: { geckoterminal: false, dexscreener: false },
      ...body,
    });

  if (!query) {
    return respond(400, { error: 'Missing query parameter q' });
  }

  if (!isSupportedNetwork(req.query.network)) {
    return respond(400, { error: `Only network "${config.network}" is supported` });
  }

  try {
    const result = await search(query);
    res.json(result);
  } catch (error) {
    console.error('[SEARCH] error:', error.message);
    respond(502, { error: 'Search failed', detail: error.message });
  }
});

export default router;
