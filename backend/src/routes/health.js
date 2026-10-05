import { Router } from 'express';
import config from '../config.js';

const router = Router();

router.get('/', (req, res) => {
  const body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.nodeEnv,
    network: config.network,
    chainId: config.chainId,
    refresh: 'websocket',
    providers: {
      geckoTerminal: config.geckoTerminalBaseUrl,
      dexScreener: config.dexScreenerBaseUrl,
    },
  };

  res.json(body);
});

export default router;
