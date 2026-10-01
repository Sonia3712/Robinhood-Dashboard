import { Router } from 'express';
import { getTokenByAddress, searchTokens } from '../providers/tokenProvider.js';
import config from '../config.js';
import { isSupportedNetwork } from '../utils/parseQuery.js';

const router = Router();

// Token by address.
router.get('/:chainId/:address', async (req, res) => {
  const { chainId, address } = req.params;

  if (Number(chainId) !== config.chainId) {
    return res.status(400).json({
      error: `Only chainId ${config.chainId} is supported`,
      token: null,
    });
  }

  try {
    const token = await getTokenByAddress(address);
    if (!token) {
      return res.status(404).json({ error: 'Token not found', token: null });
    }
    res.json({ token });
  } catch (error) {
    console.error('[TOKENS] Token detail error:', error.message);
    res.status(502).json({ error: 'Failed to load token', detail: error.message, token: null });
  }
});

// Search tokens by name / symbol.
router.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q', tokens: [] });
  }

  if (!isSupportedNetwork(req.query.network)) {
    return res.status(400).json({
      error: `Only network "${config.network}" is supported`,
      tokens: [],
    });
  }

  try {
    const tokens = await searchTokens(query);
    res.json({ query, count: tokens.length, tokens });
  } catch (error) {
    console.error('[TOKENS] Search error:', error.message);
    res.status(502).json({ error: 'Token search failed', detail: error.message, tokens: [] });
  }
});

export default router;
