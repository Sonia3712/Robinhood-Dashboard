

import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../api/client';
import { mergePools } from '../utils/normalize';

const PAGE_SIZE = 20;

export const POOL_FEATURES = {
  new: { fetcher: api.newPools, refetchMs: 45_000 },
  trending: { fetcher: api.trendingPools, refetchMs: 120_000 },
  highVolume: { fetcher: api.topPoolsByVolume, refetchMs: 60_000 },
};

export function usePools(feature, { enabled = true } = {}) {
  const config = POOL_FEATURES[feature];

  return useInfiniteQuery({
    queryKey: ['pools', feature],
    queryFn: async ({ pageParam = 1, signal }) => {
      const response = await config.fetcher(pageParam, { signal });
      return Array.isArray(response?.pools) ? response.pools : [];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length >= PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: Boolean(enabled) && Boolean(config),
    staleTime: config?.refetchMs ?? 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: config?.refetchMs ?? 60_000,
    // Polling, not a socket. Pausing on a hidden tab keeps the "Live" badge honest.
    refetchIntervalInBackground: false,
    retry: 1,
    retryDelay: 1_500,
  });
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

/** Flatten every loaded page into one deduplicated list. */
export function usePoolList(query) {
  const pages = query.data?.pages;
  if (!pages) return [];
  return mergePools(pages.flat());
}
