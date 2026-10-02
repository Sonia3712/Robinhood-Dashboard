const API_PREFIX = '/api';

const rawBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

if (!rawBase) {
  throw new Error(
    'VITE_API_URL is not set. Add VITE_API_URL=http://localhost:3001 to frontend/.env.local.',
  );
}

const BASE_URL = rawBase.endsWith(API_PREFIX) ? rawBase : `${rawBase}${API_PREFIX}`;

const DEFAULT_TIMEOUT_MS = 30_000;
const NETWORK = 'robinhood';

export class ApiError extends Error {
  constructor(message, { status, url, detail } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.detail = detail;
  }
}

async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = {}) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    if (!response.ok) {

      let detail = null;
      try {
        const body = await response.json();
        detail = body?.detail || body?.error || null;
      } catch {

      }
      throw new ApiError(
        detail || `Request failed with status ${response.status}`,
        { status: response.status, url, detail },
      );
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError(signal?.aborted ? 'Request cancelled' : 'Request timed out', { url });
    }
    throw error;
  } finally {

    clearTimeout(timeoutId);
  }
}

const withPage = (path, page) => `${path}?network=${NETWORK}&page=${page}`;

export const api = {
  baseUrl: BASE_URL,

  health: () => request('/health', { timeoutMs: 5_000 }),

  search: (query, { signal } = {}) =>
    request(`/search?q=${encodeURIComponent(query)}&network=${NETWORK}`, { signal }),

  searchTokens: (query) => request(`/tokens?q=${encodeURIComponent(query)}&network=${NETWORK}`),

  newPools: (page = 1, { signal } = {}) =>
    request(withPage('/pools/new', page), { signal }),

  topPoolsByVolume: (page = 1, { signal } = {}) =>
    request(withPage('/pools/high-volume', page), { signal }),

  trendingPools: (page = 1, { signal } = {}) =>
    request(withPage('/pools/trending', page), { signal }),

  poolByAddress: (chainId, address) => request(`/pools/${chainId}/${address}`),

  tokenByAddress: (chainId, address) => request(`/tokens/${chainId}/${address}`),
};

export default api;
