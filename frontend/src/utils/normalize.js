export function toLowerCaseAddress(address) {
  if (typeof address !== 'string') return null;
  const trimmed = address.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function isNum(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatCurrency(value) {
  if (!isNum(value)) return null;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatNumber(value) {
  if (!isNum(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatPrice(value) {
  if (!isNum(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1) return value.toFixed(4);
  if (abs >= 0.0001) return value.toFixed(6);
  if (abs >= 0.000001) return value.toFixed(8);
  return value.toExponential(2);
}

export function formatTraders(value) {
  if (!isNum(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatAge(createdAt, precomputed) {
  if (typeof precomputed === 'string' && precomputed) return precomputed;
  if (!createdAt) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const seconds = Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000));
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

export function formatPriceChange(value) {
  if (!isNum(value)) return { text: '—', className: 'price-neutral', direction: 0 };
  return {
    text: `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
    className: value > 0 ? 'price-up' : value < 0 ? 'price-down' : 'price-neutral',
    direction: value > 0 ? 1 : value < 0 ? -1 : 0,
  };
}

export function getUniquePoolKey(pool) {
  return `${pool?.chainId ?? ''}:${toLowerCaseAddress(pool?.poolAddress) ?? ''}`;
}

export function mergePools(pools) {
  const seen = new Map();
  for (const pool of pools) {
    const key = getUniquePoolKey(pool);
    if (!key.endsWith(':')) seen.set(key, pool);
  }
  return Array.from(seen.values());
}
