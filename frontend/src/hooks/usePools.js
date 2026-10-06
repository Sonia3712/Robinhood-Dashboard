import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { subscribeFeature } from '../api/socket';
import { mergePools } from '../utils/normalize';
import { applyPoolUpdate } from '../utils/poolUpdate';
import { PAGE_SIZE, MAX_PAGE } from '../utils/pagination';

export const POOL_FEATURES = {
  new: { fetcher: api.newPools, wsId: 'new-pools' },
  trending: { fetcher: api.trendingPools, wsId: 'trending' },
  highVolume: { fetcher: api.topPoolsByVolume, wsId: 'high-volume' },
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

/**
 * Page-based pool fetching hook.
 * Replaces infinite scroll with explicit page navigation.
 * Each page is fetched on demand and cached.
 */
export function usePools(feature, { enabled = true } = {}) {
  const config = POOL_FEATURES[feature];
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rateLimitedPage, setRateLimitedPage] = useState(null);

  // Fetch a specific page
  const fetchPage = useCallback(
    async (page, { signal } = {}) => {
      if (!config) return toPage({}, page);
      if (page < 1 || page > MAX_PAGE) return { ...EMPTY_PAGE, page };

      try {
        const response = await config.fetcher(page, { signal });
        const pageData = toPage(response, page);

        // Update total pages based on hasMore
        if (pageData.hasMore && page < MAX_PAGE) {
          setTotalPages((prev) => Math.max(prev, page + 1));
        } else if (!pageData.hasMore) {
          setTotalPages((prev) => Math.max(prev, page));
        }

        if (pageData.rateLimited) {
          setRateLimitedPage(page);
        } else if (rateLimitedPage === page) {
          setRateLimitedPage(null);
        }

        return pageData;
      } catch (error) {
        if (error?.rateLimited === true) {
          setRateLimitedPage(page);
          return {
            ...EMPTY_PAGE,
            page,
            hasMore: false,
            rateLimited: true,
            retryAfterMs: error.retryAfterMs ?? null,
          };
        }
        throw error;
      }
    },
    [config, rateLimitedPage],
  );

  // Use useQuery for each page - pages are cached individually
  const pageQuery = useQuery({
    queryKey: ['pools', feature, currentPage],
    queryFn: ({ signal }) => fetchPage(currentPage, { signal }),
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
    placeholderData: (previousData) => previousData,
  });

  // Get all cached pages from queryClient
  const getAllCachedPages = useCallback(() => {
    const pages = [];
    for (let page = 1; page <= MAX_PAGE; page++) {
      const data = queryClient.getQueryData(['pools', feature, page]);
      if (data) pages.push(data);
    }
    return pages.sort((a, b) => a.page - b.page);
  }, [queryClient, feature]);

  // Navigate to a specific page
  const goToPage = useCallback(
    (page) => {
      const clampedPage = Math.max(1, Math.min(page, MAX_PAGE));
      if (clampedPage !== currentPage) {
        setCurrentPage(clampedPage);
      }
    },
    [currentPage],
  );

  const goPrev = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const goNext = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  // Retry a rate-limited page
  const retryRateLimited = useCallback(() => {
    if (rateLimitedPage) {
      queryClient.invalidateQueries({ queryKey: ['pools', feature, rateLimitedPage] });
    }
  }, [queryClient, feature, rateLimitedPage]);

  // Subscribe to WebSocket updates for page 1
  useEffect(() => {
    if (!enabled || !config || currentPage !== 1) return undefined;

    return subscribeFeature(config.wsId, (payload) => {
      queryClient.setQueryData(['pools', feature, 1], (current) => {
        if (!current) return current;
        const next = applyPoolUpdate({ pages: [current], pageParams: [1] }, payload);
        return next?.pages?.[0] ?? current;
      });
    });
  }, [feature, enabled, config, currentPage, queryClient]);

  // Reset page when feature/category changes
  useEffect(() => {
    setCurrentPage(1);
    setTotalPages(1);
    setRateLimitedPage(null);
  }, [feature, enabled]);

  const pageData = pageQuery.data ?? EMPTY_PAGE;
  const isRateLimited = pageData.rateLimited === true;
  const isLastPage = currentPage >= totalPages || !pageData.hasMore;

  return useMemo(
    () => ({
      // Current page data
      pools: pageData.pools ?? [],
      currentPage,
      totalPages: Math.min(totalPages, MAX_PAGE),
      hasMore: pageData.hasMore && !isRateLimited && currentPage < MAX_PAGE,
      isLastPage,

      // Loading states
      isLoading: pageQuery.isLoading,
      isFetching: pageQuery.isFetching,
      isError: pageQuery.isError,
      error: pageQuery.error,

      // Rate limiting
      isRateLimited,
      rateLimitedPage,
      retryAfterMs: pageData.retryAfterMs ?? null,
      retryRateLimited,

      // Navigation
      goToPage,
      goPrev,
      goNext,

      // Refetch current page
      refetch: pageQuery.refetch,

      // All cached pools (for DEX filtering)
      allCachedPools: getAllCachedPages().flatMap((p) => p?.pools ?? []),
    }),
    [
      pageData,
      pageQuery.isLoading,
      pageQuery.isFetching,
      pageQuery.isError,
      pageQuery.error,
      pageQuery.refetch,
      currentPage,
      totalPages,
      isRateLimited,
      rateLimitedPage,
      isLastPage,
      goToPage,
      goPrev,
      goNext,
      retryRateLimited,
      getAllCachedPages,
    ],
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
  // This is now less used but kept for compatibility
  return query.allCachedPools ?? [];
}