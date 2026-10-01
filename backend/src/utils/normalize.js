// Canonical data shapes for the whole backend.
//
// Every provider (GeckoTerminal, DEX Screener, Robinhood RPC) is adapted into
// the structures built here, so the routes and the frontend only ever deal with
// one field layout. Previously each provider emitted its own shape and
// PoolRow.jsx had to read three of them at once, which is why DEX Screener rows
// lost their DEX name, transaction count and every short-window price change.

import config from '../config.js';

export const NETWORK = config.network;
export const CHAIN_ID = config.chainId;

// Time windows the table displays.
export const WINDOWS = ['m5', 'm1', 'h6', 'h24'];


export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) || asNumber !== 0 ? asNumber : null;
  }
  if (typeof value === 'boolean') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function int(value) {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function toLowerCaseAddress(address) {
  if (typeof address !== 'string') return null;
  const trimmed = address.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

// Token identity is chainId + lowercase address. A bare address is ambiguous
// once more than one chain is in play.
export function getUniqueTokenKey(token) {
  return `${token?.chainId ?? CHAIN_ID}:${toLowerCaseAddress(token?.address) ?? ''}`;
}

export function getUniquePoolKey(pool) {
  return `${pool?.chainId ?? CHAIN_ID}:${toLowerCaseAddress(pool?.poolAddress) ?? ''}`;
}

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

export function calculateAgeSeconds(createdAt) {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000));
}

// "30s" / "2m" / "5m" / "2h" / "1d"
export function formatAge(createdAt) {
  if (!createdAt) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const seconds = calculateAgeSeconds(createdAt);
  if (seconds === null) return null;
  if (seconds < 5) return 'now';

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);

  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return `${months}mo`;
}

// ---------------------------------------------------------------------------
// canonical tokens and pools
// ---------------------------------------------------------------------------

// Missing symbol/name stay null. The UI decides how to render "unknown"; the
// backend must not invent a placeholder that then looks like real data.
export function normalizeTokenRef(token) {
  if (!token) return { address: null, symbol: null, name: null, iconUrl: null, decimals: null };
  return {
    address: toLowerCaseAddress(token.address),
    symbol: token.symbol?.trim() || null,
    name: token.name?.trim() || null,
    iconUrl: token.iconUrl || token.imageUrl || token.logoURI || null,
    decimals: int(token.decimals),
  };
}

export function normalizeToken(token, source) {
  const ref = normalizeTokenRef(token);
  return {
    network: NETWORK,
    chainId: CHAIN_ID,
    address: ref.address,
    symbol: ref.symbol,
    name: ref.name,
    decimals: ref.decimals,
    totalSupply: token?.totalSupply !== undefined && token?.totalSupply !== null
      ? String(token.totalSupply)
      : null,
    iconUrl: ref.iconUrl,
    createdAt: token?.createdAt || null,
    source,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function windowSeries(pick) {
  const series = {};
  for (const window of WINDOWS) {
    series[window] = pick(window) ?? null;
  }
  return series;
}

function txnsOf(value) {
  if (!value || typeof value !== 'object') return null;
  const buys = int(value.buys);
  const sells = int(value.sells);
  if (buys === null && sells === null) return null;
  return { buys, sells };
}

/**
 * Build the single pool shape every provider is adapted into.
 * Only these fields leave the backend; provider payloads are never forwarded.
 */
export function makePool(input) {
  const poolCreatedAt = input.poolCreatedAt || null;
  const base = normalizeTokenRef(input.baseToken);
  const quote = normalizeTokenRef(input.quoteToken);

  return {
    network: NETWORK,
    chainId: CHAIN_ID,
    poolAddress: toLowerCaseAddress(input.poolAddress),

    poolCreatedAt,
    ageSeconds: calculateAgeSeconds(poolCreatedAt),
    age: formatAge(poolCreatedAt),

    dex: input.dex
      ? { id: input.dex.id || null, name: input.dex.name || null }
      : { id: null, name: null },

    baseToken: base,
    quoteToken: quote,

    priceUsd: num(input.priceUsd),
    priceNative: num(input.priceNative),

    marketCap: num(input.marketCap),
    fdv: num(input.fdv),
    liquidityUsd: num(input.liquidityUsd),

    volume: windowSeries((w) => num(input.volume?.[w])),
    priceChange: windowSeries((w) => num(input.priceChange?.[w])),
    txns: windowSeries((w) => txnsOf(input.txns?.[w])),

    // Unique traders. GeckoTerminal reports buyers/sellers; DEX Screener does
    // not, so this stays null there instead of being faked as 0.
    traders: int(input.traders),

    sources: Array.from(new Set(input.sources || [])).filter(Boolean),
    url: input.url || null,
    updatedAt: new Date().toISOString(),
  };
}

export function sortPoolsByVolumeDesc(pools) {
  return [...pools].sort((a, b) => (num(b.volume?.h24) ?? -1) - (num(a.volume?.h24) ?? -1));
}

export function sortPoolsByAgeAsc(pools) {
  return [...pools].sort((a, b) => {
    const aAge = num(a.ageSeconds);
    const bAge = num(b.ageSeconds);
    if (aAge === null && bAge === null) return 0;
    if (aAge === null) return 1;
    if (bAge === null) return -1;
    return aAge - bAge;
  });
}

export function deduplicatePools(pools) {
  const seen = new Map();
  for (const pool of pools) {
    const key = getUniquePoolKey(pool);
    if (!key.endsWith(':')) seen.set(key, pool);
  }
  return Array.from(seen.values());
}

export function deduplicateTokens(tokens) {
  const seen = new Map();
  for (const token of tokens) {
    const key = getUniqueTokenKey(token);
    if (!key.endsWith(':')) seen.set(key, token);
  }
  return Array.from(seen.values());
}

// Keep whichever side carries more information. GeckoTerminal is the pool
// index of record; DEX Screener contributes icons and per-token detail.
export function mergePoolData(a, b) {
  if (!a) return b;
  if (!b) return a;

  const prefer = (x, y) => (x === null || x === undefined ? y : x);
  const pickSeries = (key) => {
    const merged = {};
    for (const window of WINDOWS) {
      merged[window] = prefer(a[key]?.[window], b[key]?.[window]);
    }
    return merged;
  };

  return {
    ...a,
    poolAddress: a.poolAddress || b.poolAddress,
    poolCreatedAt: prefer(a.poolCreatedAt, b.poolCreatedAt),
    dex: a.dex?.id || a.dex?.name ? a.dex : b.dex,
    baseToken: { ...b.baseToken, ...stripNulls(a.baseToken) },
    quoteToken: { ...b.quoteToken, ...stripNulls(a.quoteToken) },
    priceUsd: prefer(a.priceUsd, b.priceUsd),
    priceNative: prefer(a.priceNative, b.priceNative),
    marketCap: prefer(a.marketCap, b.marketCap),
    fdv: prefer(a.fdv, b.fdv),
    liquidityUsd: prefer(a.liquidityUsd, b.liquidityUsd),
    volume: pickSeries('volume'),
    priceChange: pickSeries('priceChange'),
    txns: pickSeries('txns'),
    traders: prefer(a.traders, b.traders),
    url: prefer(a.url, b.url),
    sources: Array.from(new Set([...(a.sources || []), ...(b.sources || [])])),
  };
}

function stripNulls(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return out;
}
