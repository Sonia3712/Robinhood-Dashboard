

import config from '../config.js';

export const MAX_PAGE = 25;

/** Absent, unparseable or out-of-range input falls back to page 1, clamped to MAX_PAGE. */
export function readPage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/** The effective network for a request: the query value, or the configured default. */
export function readNetwork(value) {
  return value || config.network;
}

export function isSupportedNetwork(value) {
  return readNetwork(value) === config.network;
}
