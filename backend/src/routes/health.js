import { Router } from 'express';
import config from '../config.js';

const router = Router();

// Liveness + configuration. Intentionally does not call any provider, so a
// rate-limited upstream can never make the dashboard look "down".
router.get('/', (req, res) => {
  const body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.nodeEnv,
    network: config.network,
    chainId: config.chainId,
    refresh: 'polling',
    providers: {
      geckoTerminal: config.geckoTerminalBaseUrl,
      dexScreener: config.dexScreenerBaseUrl,
      rpc: config.rpcUrl,
    },
  };

  res.json(body);
});

export default router;
