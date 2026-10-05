import config from '../config.js';

export const NETWORK = config.network;
export const CHAIN_ID = config.chainId;

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

export function getUniqueTokenKey(token) {
  return `${token?.chainId ?? CHAIN_ID}:${toLowerCaseAddress(token?.address) ?? ''}`;
}

export function getUniquePoolKey(pool) {
  return `${pool?.chainId ?? CHAIN_ID}:${toLowerCaseAddress(pool?.poolAddress) ?? ''}`;
}

export function calculateAgeSeconds(createdAt) {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000));
}

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

const DEX_VERSION_PART = /^(?:v|ver|version)[-_ ]?(\d{1,2})$/i;

export function parseDexVersion(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const direct = DEX_VERSION_PART.exec(trimmed);
    if (direct) return `V${direct[1]}`;

    for (const part of trimmed.split(/[-_/\s]+/)) {
      const matched = DEX_VERSION_PART.exec(part);
      if (matched) return `V${matched[1]}`;
    }
  }

  return null;
}

function pickUrl(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function normalizeDex(dex, versionCandidates) {
  if (!dex) return { id: null, name: null, version: null, iconUrl: null };

  const id = dex.id || null;
  const name = typeof dex.name === 'string' && dex.name.trim() ? dex.name.trim() : null;

  return {
    id,
    name,
    // An explicit version (e.g. parsed from DEX Screener labels) wins over
    // guesses derived from the DEX id or name.
    version: parseDexVersion(dex.version, ...(versionCandidates ?? []), id, name),
    iconUrl: pickUrl(dex.iconUrl, dex.logoUri, dex.imageUrl),
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

export function makePool(input) {
  const poolCreatedAt = input.poolCreatedAt || null;
  const base = normalizeTokenRef(input.baseToken);
  const quote = normalizeTokenRef(input.quoteToken);
  const dexInput = input.dex ?? {};

  return {
    network: NETWORK,
    chainId: CHAIN_ID,
    poolAddress: toLowerCaseAddress(input.poolAddress),

    poolCreatedAt,
    ageSeconds: calculateAgeSeconds(poolCreatedAt),
    age: formatAge(poolCreatedAt),

    dex: normalizeDex(dexInput, dexInput.versionLabels),

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

    traders: int(input.traders),
    feePercentage: num(input.feePercentage),
    boosts: num(input.boosts),

    sources: Array.from(new Set(input.sources || [])).filter(Boolean),
    url: input.url || null,
    updatedAt: new Date().toISOString(),
  };
}

export function formatFee(feePercentage) {
  const value = num(feePercentage);
  if (value === null) return null;
  const rounded = Number(value.toFixed(4));
  return `${rounded}%`;
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
    dex: mergeDex(a.dex, b.dex),
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
    feePercentage: prefer(a.feePercentage, b.feePercentage),
    boosts: prefer(a.boosts, b.boosts),
    url: prefer(a.url, b.url),
    sources: Array.from(new Set([...(a.sources || []), ...(b.sources || [])])),
  };
}

function mergeDex(a, b) {
  if (!a?.id && !a?.name) return b;
  if (!b?.id && !b?.name) return a;

  const prefer = (x, y) => (x === null || x === undefined ? y : x);

  return {
    id: prefer(a.id, b.id),
    name: prefer(a.name, b.name),
    version: prefer(a.version, b.version),
    iconUrl: prefer(a.iconUrl, b.iconUrl),
  };
}

function stripNulls(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return out;
}
