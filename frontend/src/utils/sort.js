const TIER = 3;

export const SORT_COLUMNS = [
  { id: 'mcap', label: 'MCAP', align: 'right', getValue: (p) => p?.marketCap ?? p?.fdv },
  { id: 'price', label: 'PRICE', align: 'right', getValue: (p) => p?.priceUsd },
  { id: 'age', label: 'AGE', align: 'center', getValue: (p) => p?.ageSeconds },
  {
    id: 'txns',
    label: 'TXNS',
    align: 'right',
    getValue: (p) => {
      const t = p?.txns?.h24;
      if (!t) return null;
      return (t.buys ?? 0) + (t.sells ?? 0);
    },
  },
  { id: 'volume', label: 'VOLUME', align: 'right', getValue: (p) => p?.volume?.h24 },
  { id: 'traders', label: 'TRADERS', align: 'right', getValue: (p) => p?.traders, tier: TIER },
  { id: '5m', label: '5M', align: 'right', getValue: (p) => p?.priceChange?.m5, tier: TIER },
  { id: '1h', label: '1H', align: 'right', getValue: (p) => p?.priceChange?.m1 },
  { id: '6h', label: '6H', align: 'right', getValue: (p) => p?.priceChange?.h6, tier: TIER },
  { id: '24h', label: '24H', align: 'right', getValue: (p) => p?.priceChange?.h24 },
  { id: 'liquidity', label: 'LIQUIDITY', align: 'right', getValue: (p) => p?.liquidityUsd },
];

export function isSecondaryColumn(column, activeColumnId) {
  return column.tier === TIER && column.id !== activeColumnId;
}

const COLUMNS_BY_ID = new Map(SORT_COLUMNS.map((c) => [c.id, c]));

export const DEFAULT_SORT = { columnId: 'age', direction: 'asc' };

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getNextSort(current, columnId) {
  if (current.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return { columnId, direction: 'asc' };
}

export function sortPools(pools, sort) {
  const column = COLUMNS_BY_ID.get(sort.columnId);
  if (!column) return pools;

  const sign = sort.direction === 'desc' ? -1 : 1;

  return [...pools].sort((a, b) => {
    const left = toNumber(column.getValue(a));
    const right = toNumber(column.getValue(b));

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;

    return (left < right ? -1 : 1) * sign;
  });
}
