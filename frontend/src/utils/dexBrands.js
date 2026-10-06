/**
 * Map a live provider DEX (GeckoTerminal relation) to the brand whose real logo
 * we ship locally in `src/assets/dex/`. The provider's `dex` relation carries
 * only `id` and `name` (verified against the live upstream payloads), so the
 * brand is resolved from those strings only — never from an icon URL.
 *
 * Resolution is keyword based and order-independent: the id is checked first,
 * then the name. Parenthesised suffixes and punctuation are ignored so
 * "Ramses V3 (Robinhood)" and "ramses-v3-robinhood" land on the same brand as
 * plain "Ramses". Unmapped future DEXes resolve to `null`, which renders the
 * neutral tile.
 */
export const DEX_BRANDS = [
  { key: 'uniswap', label: 'Uniswap', asset: 'uniswap.svg' },
  { key: 'ramses', label: 'Ramses', asset: 'ramses.png' },
  { key: 'pons', label: 'Pons', asset: 'pons.png' },
  { key: 'bankr', label: 'Bankr', asset: 'bankr.svg' },
  { key: 'alandale', label: 'Alandale', asset: 'alandale.svg' },
  { key: 'up', label: 'Up', asset: 'up.svg' },
];

const BRAND_KEY_SET = new Set(DEX_BRANDS.map((brand) => brand.key));

function tokensOf(value) {
  if (typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Resolves a `dex` object to its brand key, or null when no local logo exists.
 * Pure and dependency free so it can be exercised by the Node verify script
 * (the asset wiring in `dexIcons.js` stays out of this module).
 */
export function resolveBrandKey(dex) {
  if (!dex) return null;
  const id = typeof dex.id === 'string' ? dex.id.trim() : '';
  const name = typeof dex.name === 'string' ? dex.name.trim() : '';

  for (const token of tokensOf(id)) {
    if (BRAND_KEY_SET.has(token)) return token;
  }
  for (const token of tokensOf(name)) {
    if (BRAND_KEY_SET.has(token)) return token;
  }

  return null;
}

export function getBrand(brandKey) {
  return DEX_BRANDS.find((brand) => brand.key === brandKey) ?? null;
}