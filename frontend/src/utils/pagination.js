/**
 * Pure pagination rules for the pool lists.
 *
 * Kept dependency-free and separate from the hook so the "pages 1-4 only" ceiling
 * is directly testable rather than only observable in a browser.
 */

/** Rows the provider returns per page. */
export const PAGE_SIZE = 20;

/**
 * Hard ceiling on provider page requests. Each category loads page 1 through page
 * 4 and never asks for page 5 or beyond, so scrolling to the bottom of a long
 * list cannot walk off into further requests.
 */
export const MAX_PAGE = 4;

/**
 * Decides which page to request next, or `undefined` when there is nothing more
 * to fetch.
 *
 * Stops when the provider is exhausted, when the page is rate limited or short,
 * and unconditionally once page 4 has been loaded - a `hasMore: true` response
 * on page 4 does not lift that ceiling.
 */
export function getNextPageParam(lastPage, allPages, lastPageParam) {
  if (!lastPage) return undefined;
  if (lastPage.rateLimited) return undefined;
  if (lastPage.hasMore === false) return undefined;
  if (lastPage.pools.length < PAGE_SIZE) return undefined;

  const nextPage = (lastPageParam ?? allPages.length) + 1;
  return nextPage > MAX_PAGE ? undefined : nextPage;
}