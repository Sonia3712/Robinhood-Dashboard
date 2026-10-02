import config from '../config.js';

export const MAX_PAGE = 25;

export function readPage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

export function readNetwork(value) {
  return value || config.network;
}

export function isSupportedNetwork(value) {
  return readNetwork(value) === config.network;
}
