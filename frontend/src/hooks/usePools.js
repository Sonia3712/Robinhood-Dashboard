import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { subscribeFeature } from '../api/socket';
import { mergePools } from '../utils/normalize';

const PAGE_SIZE = 20;

export const POOL_FEATURES = {
  new: { fetcher: api.newPools },
  trending: { fetcher: api.trendingPools },
  highVolume: { fetcher: api.topPoolsByVolume },
};

const FEATURE_WS_IDS = {
  new: 'new-pools',
  trending: 'trending',
  highVolume: 'high-volume',
};

const EMPTY_PAGE = { pools: [], hasMore: true, rateLimited: false, retryAfterMs: null };

function toPage(response, pageParam) {
  const pools = Array.isArray(response?.pools) ? response.pools : [];
  const rateLimited = response?.rateLimited === true;

  return {
    pools,
    page: pageParam,
    hasMore: rateLimited ? false : response?.hasMore !== false,
    rateLimited,
    retryAfterMs: rateLimited ? (response?.retryAfterMs ?? null) : null,
  };
}

export function usePools(feature, { enabled = true } = {}) {
  const config = POOL_FEATURES[feature];
  const queryClient = useQueryClient();
  const loadMoreInFlight = useRef(false);

  const query = useInfiniteQuery({
    queryKey: ['pools', feature],
    queryFn: async ({ pageParam = 1, signal }) => {
      try {
        const response = await config.fetcher(pageParam, { signal });
        return toPage(response, pageParam);
      } catch (error) {
        // A rate limit is not a page error: return an empty, stalled page so
        // loaded rows stay on screen and the cooldown banner can drive the retry.
        if (error?.rateLimited === true) {
          return {
            ...EMPTY_PAGE,
            page: pageParam,
            hasMore: false,
            rateLimited: true,
            retryAfterMs: error.retryAfterMs ?? null,
          };
        }
        throw error;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!lastPage) return undefined;
      if (lastPage.rateLimited) return undefined;
      if (lastPage.hasMore === false) return undefined;
      if (lastPage.pools.length < PAGE_SIZE) return undefined;
      return (lastPageParam ?? allPages.length) + 1;
    },
    enabled: Boolean(enabled) && Boolean(config),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error?.rateLimited) return false;
      return failureCount < 1;
    },
    retryDelay: 1_500,
  });

  const pages = query.data?.pages ?? [];
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
  const rateLimited = lastPage?.rateLimited === true;

  // A rate-limited page contributes no rows, so dropping it removes nothing from
  // the table and simply re-enables the next page request after the cooldown.
  const retryRateLimited = useCallback(() => {
    if (loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;

    try {
      queryClient.setQueryData(['pools', feature], (current) => {
        if (!current?.pages?.length) return current;
        const tail = current.pages[current.pages.length - 1];
        if (tail?.rateLimited !== true) return current;

        return {
          ...current,
          pages: current.pages.slice(0, -1),
          pageParams: current.pageParams.slice(0, -1),
        };
      });
    } finally {
      loadMoreInFlight.current = false;
    }
  }, [feature, queryClient]);

  // Only one next page is ever in flight. `cancelRefetch: false` makes react-query
  // reuse the running page request instead of cancelling and restarting it, so a
  // burst of scroll events can never turn into a burst of provider requests.
  const loadMore = useCallback(() => {
    if (loadMoreInFlight.current) return;
    if (!query.hasNextPage || query.isFetchingNextPage || query.isFetching) return;

    loadMoreInFlight.current = true;
    Promise.resolve(query.fetchNextPage({ cancelRefetch: false })).finally(() => {
      loadMoreInFlight.current = false;
    });
  }, [query.hasNextPage, query.isFetching, query.isFetchingNextPage, query.fetchNextPage]);

  useEffect(() => {
    loadMoreInFlight.current = false;
  }, [feature]);

  useEffect(() => {
    if (!enabled || !config) return undefined;

    return subscribeFeature(FEATURE_WS_IDS[feature], (payload) => {
      const pools = Array.isArray(payload?.pools) ? payload.pools : [];
      if (pools.length === 0) return;

      queryClient.setQueryData(['pools', feature], (current) => {
        const currentPages = current?.pages ?? [];
        if (currentPages.length === 0) {
          return { ...current, pages: [{ ...EMPTY_PAGE, pools }], pageParams: [1] };
        }

        // Replace page 1 in place so page order (and pageParams) stay intact.
        const pages = currentPages.map((page, index) =>
          index === 0 ? { ...page, pools } : page,
        );

        return { ...current, pages, pageParams: current?.pageParams ?? [1] };
      });
    });
  }, [feature, enabled, config, queryClient]);

  return useMemo(
    () => ({
      ...query,
      loadMore,
      hasNextPage: Boolean(query.hasNextPage) && !rateLimited,
      rateLimited,
      retryAfterMs: lastPage?.retryAfterMs ?? null,
      pageCount: pages.length,
    }),
    [query, loadMore, rateLimited, lastPage, pages.length],
  );
}

export function useNewPools(options) {
  return usePools('new', options);
}

export function useTrendingPools(options) {
  return usePools('trending', options);
}

export function useHighVolumePools(options) {
  return usePools('highVolume', options);
}

export function usePoolList(query) {
  const pages = query.data?.pages;
  if (!pages) return [];
  return mergePools(pages.flatMap((page) => page?.pools ?? []));
}
