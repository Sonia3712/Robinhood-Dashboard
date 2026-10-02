import config from '../config.js';
import { setRequestContext } from '../utils/cache.js';
import { logRequest, sanitizeUrl } from '../utils/logger.js';

function cacheVerdict(events) {
  if (events.length === 0) return null;
  if (events.some((event) => event.outcome === 'MISS')) return 'MISS';
  if (events.some((event) => event.outcome === 'STALE')) return 'STALE';
  return 'HIT';
}

export function requestLogger(req, res, next) {
  const started = Date.now();
  const url = sanitizeUrl(req.originalUrl);

  if (!config.isDevelopment) {
    if (config.requestLog) {
      res.on('finish', () => {
        logRequest({ method: req.method, url, status: res.statusCode, durationMs: Date.now() - started });
      });
    }
    return next();
  }

  const context = { cacheEvents: [] };

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

  setRequestContext(context);
  res.on('finish', () => setRequestContext(null));

  return next();
}
