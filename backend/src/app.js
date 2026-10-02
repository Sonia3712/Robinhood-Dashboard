import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/requestLogger.js';
import searchRoutes from './routes/search.js';
import poolsRoutes from './routes/pools.js';
import tokensRoutes from './routes/tokens.js';
import healthRoutes from './routes/health.js';
import defaultConfig from './config.js';
import { closeAllCaches } from './utils/cache.js';
import { logError, logServer, logStartupBanner } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

export const listenConfig = { port: defaultConfig.port, host: defaultConfig.host };

export function createCorsMiddleware(config) {
  if (config.allowAllOrigins) {
    return cors();
  }

  const allowed = new Set(config.corsOrigins);
  return cors({
    origin(origin, callback) {

      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  });
}

function bigIntSafe(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

function onError(error, _req, res, _next) {
  console.error('[SERVER] Error:', error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' }, bigIntSafe);
}

export function createApp(config = defaultConfig) {
  const app = express();

  app.disable('x-powered-by');

  app.set('json replacer', bigIntSafe);

  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.use('/api/health', healthRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/pools', poolsRoutes);
  app.use('/api/tokens', tokensRoutes);

  app.use(notFound);
  app.use(onError);

  return app;
}

export function printStartupBanner(config = defaultConfig) {
  const base = `http://localhost:${config.port}`;
  const { network, chainId } = config;

  logStartupBanner([
    `Robinhood DEX API listening on ${base} (${config.host}:${config.port})`,
    `environment: ${config.nodeEnv}`,
    `CORS origins: ${config.allowAllOrigins ? '*' : config.corsOrigins.join(', ')}`,
    `request log: ${config.requestLog ? 'on' : 'off'}`,
    'Endpoints:',
    `GET ${base}/api/health`,
    `GET ${base}/api/search?q=...&network=${network}`,
    `GET ${base}/api/pools/new?network=${network}&page=1`,
    `GET ${base}/api/pools/trending?network=${network}&page=1`,
    `GET ${base}/api/pools/high-volume?network=${network}&page=1`,
    `GET ${base}/api/pools/${chainId}/:poolAddress`,
    `GET ${base}/api/tokens?q=...&network=${network}`,
    `GET ${base}/api/tokens/${chainId}/:address`,
    `WS ${base.replace('http', 'ws')}/ws`,
  ]);
}

export function attachServer(server, config = defaultConfig, onShutdown = () => {}) {
  server.once('listening', () => printStartupBanner(config));

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logError('SERVER', `Port ${config.port} is already in use.`);
      process.exit(1);
    }
    logError('SERVER', `Server error: ${error}`);
  });

  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logServer(`${signal} received, shutting down...`);

    closeAllCaches();
    onShutdown();

    server.close((error) => {
      if (error) {
        logError('SERVER', `Error while closing server: ${error}`);
        process.exit(1);
      }
      logServer('Shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      logError('SERVER', 'Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logError('SERVER', `Unhandled rejection: ${reason}`);
  });

  process.on('uncaughtException', (error) => {
    logError('SERVER', `Uncaught exception: ${error}`);
    process.exit(1);
  });

  return { shutdown };
}
