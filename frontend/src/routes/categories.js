export const CATEGORY_BASE_PATH = '/robinhood';

/**
 * Single source of truth for the dashboard categories: the URL segment that
 * selects each one and the sidebar label shown for it.
 */
export const CATEGORIES = [
  { id: 'new', segment: 'new-pools', label: 'New Pools', title: 'New Pools', empty: 'No new pools found' },
  {
    id: 'trending',
    segment: 'trending',
    label: 'Trending',
    title: 'Trending Pools',
    empty: 'No trending pools found',
  },
  {
    id: 'volume',
    segment: 'high-volume',
    label: 'High Volume',
    title: 'High Volume Pools',
    empty: 'No pools found',
  },
];

export const DEFAULT_CATEGORY_ID = CATEGORIES[0].id;

const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));
const CATEGORY_ID_BY_SEGMENT = new Map(
  CATEGORIES.map((category) => [category.segment, category.id]),
);

/**
 * Sentinel for the un-narrowed view. It is a UI/filter value only, never a URL
 * segment: `categoryDexPath` maps it back to the bare category path so the
 * shared "All DEXes" option can never leak into the address bar.
 */
export const ALL_DEXES = 'all';

export function getCategory(categoryId) {
  return CATEGORY_BY_ID.get(categoryId) ?? CATEGORY_BY_ID.get(DEFAULT_CATEGORY_ID);
}

export function categoryPath(categoryId) {
  return `${CATEGORY_BASE_PATH}/${getCategory(categoryId).segment}`;
}

/**
 * Path for a category narrowed to one DEX. `ALL_DEXES` (and any falsy id) maps
 * back to the bare category path, so "All DEXes" never appears in the URL.
 * The DEX id is the provider's own normalized id, encoded once so ids that
 * contain a slash or space still produce a single URL segment.
 */
export function categoryDexPath(categoryId, dexId) {
  const base = categoryPath(categoryId);
  if (typeof dexId !== 'string') return base;

  const trimmed = dexId.trim();
  if (!trimmed || trimmed === ALL_DEXES) return base;

  return `${base}/${encodeURIComponent(trimmed)}`;
}

export const DEFAULT_CATEGORY_PATH = categoryPath(DEFAULT_CATEGORY_ID);

/**
 * Resolves the `:category` URL segment to a known category id, or null when the
 * segment is unknown so the caller can redirect instead of rendering an empty
 * dashboard.
 */
export function categoryIdFromSegment(segment) {
  if (typeof segment !== 'string') return null;
  return CATEGORY_ID_BY_SEGMENT.get(segment.trim().toLowerCase()) ?? null;
}