import config from '../config.js';

const SAFE_QUERY_PARAMS = ['network', 'page'];

const MAX_VALUE_LENGTH = 160;

const throttleState = new Map();

export function sanitizeUrl(originalUrl) {
  let parsed;
  try {
    parsed = new URL(originalUrl || '/', 'http://internal');
  } catch {
    return '/';
  }

  const kept = new URLSearchParams();
  for (const name of SAFE_QUERY_PARAMS) {
    const value = parsed.searchParams.get(name);
    if (value !== null) kept.set(name, value);
  }

  const query = kept.toString();
  return query ? `${parsed.pathname}?${query}` : parsed.pathname;
}

function stamp(date) {
  return date.toISOString().slice(11, 23);
}

export function logServer(message) {
  console.log(`[SERVER] ${message}`);
}

export function logError(scope, message) {
  console.error(`[${scope}] ${message}`);
}

export function logThrottled(scope, key, message, intervalMs = 15_000) {
  const now = Date.now();
  const previous = throttleState.get(key);
  if (previous !== undefined && now - previous < intervalMs) return false;
  throttleState.set(key, now);
  console.warn(`[${scope}] ${message}`);
  return true;
}

export function logRequest({ method, url, status, durationMs, cache }) {
  const cachePart = cache ? ` CACHE=${cache}` : '';
  const line = `${method} ${url} ${status} ${durationMs}ms${cachePart}`;
  if (config.isDevelopment) {
    console.log(`[${stamp(new Date())}] ${line}`);
    return;
  }
  logServer(line);
}

export function logStartupBanner(lines) {
  if (config.isDevelopment) {
    console.log('');
    for (const line of lines) console.log(`  ${line}`);
    console.log('');
    return;
  }
  for (const line of lines) logServer(line);
}
