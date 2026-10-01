// Per-request logging.
//
// One line per request, written on 'finish':
//
//   [09:42:15] GET /api/pools/trending 200 5ms CACHE=HIT
//   [09:42:20] GET /api/pools/trending 200 218ms CACHE=MISS
//   [09:42:25] GET /api/search 500 120ms ERROR
//
// sanitizeUrl() is applied before anything is logged, so a search term or any
// other `?q=`/`?token=`/`?key=` value can never reach the console. The cache
// verdict comes from the request context, which the cache populates as it serves.

import config from '../config.js';
import {
  createRequestContext,
  isContextEnabled,
  runWithContext,
} from '../utils/requestContext.js';
import { logRequest, sanitizeUrl } from '../utils/logger.js';

// HIT only if nothing had to be fetched. A single MISS makes the whole request a
// MISS, because at least part of the response came from a provider rather than
// from memory. Requests that never touch a cache get no CACHE= field at all.
function cacheVerdict(events) {
  if (events.length === 0) return null;
  if (events.some((event) => event.outcome === 'MISS')) return 'MISS';
  if (events.some((event) => event.outcome === 'STALE')) return 'STALE';
  return 'HIT';
}

export function requestLogger(req, res, next) {
  const started = Date.now();
  const url = sanitizeUrl(req.originalUrl);

  // Production: no context, no allocation, one compact line.
  if (!isContextEnabled()) {
    if (config.requestLog) {
      res.on('finish', () => {
        logRequest({ method: req.method, url, status: res.statusCode, durationMs: Date.now() - started });
      });
    }
    return next();
  }

  const context = createRequestContext();

  if (config.requestLog) {
    res.on('finish', () => {
      logRequest({
        method: req.method,
        url,
        status: res.statusCode,
        durationMs: Date.now() - started,
        cache: cacheVerdict(context.cacheEvents),
      });
    });
  }

  return runWithContext(context, next);
}