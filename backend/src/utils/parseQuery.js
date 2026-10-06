import config from '../config.js';

// GeckoTerminal's public API answers page numbers past its maximum with
// HTTP 429, so the API never asks the provider for a page it cannot serve.
export const MAX_PAGE = 4;

// GeckoTerminal returns up to 20 pools per list page.
export const PAGE_SIZE = 20;

export function readPage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return page; // Return actual page, validation happens in route
}

export function readNetwork(value) {
  return value || config.network;
}

export function isSupportedNetwork(value) {
  return readNetwork(value) === config.network;
}
