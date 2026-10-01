// Express application factory and process bootstrap.
//
// This module is the composition root: it builds the middleware stack, mounts
// the routers, installs the terminal handlers, and owns everything that has to
// happen around a listening socket. server.js is left with a single import and
// the listen call, so there is exactly one place to look for how the API is
// assembled.
//
// createApp() itself binds no port and installs no signal handlers, so it can
// be mounted in a test without a listening socket.

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

// What server.js hands to app.listen().
export const listenConfig = { port: defaultConfig.port, host: defaultConfig.host };

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export function createCorsMiddleware(config) {
  if (config.allowAllOrigins) {
    return cors();
  }

  const allowed = new Set(config.corsOrigins);
  return cors({
    origin(origin, callback) {
      // Same-origin requests and non-browser clients send no Origin header.
      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  });
}

// ---------------------------------------------------------------------------
// terminal handlers
// ---------------------------------------------------------------------------

// Safety net: a bigint reaching the response layer used to throw
// "Do not know how to serialize a BigInt" and turn a successful handler into an
// empty HTTP 500. Everything the API returns is numeric-or-null by contract, so
// any bigint here is a bug we should surface as a string rather than a crash.
function bigIntSafe(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

// eslint-disable-next-line no-unused-vars
function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function onError(error, _req, res, _next) {
  console.error('[SERVER] Error:', error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' }, bigIntSafe);
}

// ---------------------------------------------------------------------------
// application
// ---------------------------------------------------------------------------

export function createApp(config = defaultConfig) {
  const app = express();

  app.disable('x-powered-by');

  // Read when the response is serialized, so it must be set before the first
  // send() — and setting it up front is what makes that guarantee obvious.
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

// ---------------------------------------------------------------------------
// startup banner
// ---------------------------------------------------------------------------

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
  ]);
}

// ---------------------------------------------------------------------------
// process lifecycle
// ---------------------------------------------------------------------------

/**
 * Wire the listening socket to the process: announce it, handle a port clash,
 * and shut down cleanly on a signal.
 *
 * The banner is attached to the 'listening' event rather than printed by
 * server.js, so it cannot claim the server is up when the bind actually failed.
 */
export function attachServer(server, config = defaultConfig) {
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

    // Stop node-cache's expiry sweep timers so nothing holds the event loop.
    closeAllCaches();

    server.close((error) => {
      if (error) {
        logError('SERVER', `Error while closing server: ${error}`);
        process.exit(1);
      }
      logServer('Shutdown complete');
      process.exit(0);
    });

    // Don't hang forever on lingering keep-alive sockets.
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
