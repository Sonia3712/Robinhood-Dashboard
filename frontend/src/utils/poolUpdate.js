/**
 * Reduces a WebSocket message onto the already-loaded page cache.
 *
 * Deliberately a pure, dependency-free function so the "HTTP owns the initial
 * page" rule is directly testable:
 *  - with no loaded page, nothing is created — the socket can never bootstrap
 *    page 1, so a failed initial load keeps showing its normal error;
 *  - a `snapshot` is ignored, because it only restates what HTTP already
 *    returned, so the socket cannot overwrite the authoritative first render;
 *  - only a live `update` replaces page 1 in place, leaving page order and
 *    pageParams intact so HTTP pagination keeps working.
 *
 * Returns `undefined` when the cache must be left untouched.
 */
export function applyPoolUpdate(current, payload) {
  const pools = Array.isArray(payload?.pools) ? payload.pools : [];
  if (pools.length === 0) return undefined;

  const currentPages = current?.pages ?? [];
  if (currentPages.length === 0) return undefined;
  if (payload?.type !== 'update') return undefined;

  const pages = currentPages.map((page, index) => (index === 0 ? { ...page, pools } : page));

  return { ...current, pages, pageParams: current?.pageParams ?? [1] };
}