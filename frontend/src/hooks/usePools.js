import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { subscribeFeature } from '../api/socket';
import { mergePools } from '../utils/normalize';

const PAGE_SIZE = 20;

export const POOL_FEATURES = {
  new: { fetcher: api.newPools, refetchMs: 45_000 },
  trending: { fetcher: api.trendingPools, refetchMs: 120_000 },
  highVolume: { fetcher: api.topPoolsByVolume, refetchMs: 60_000 },
};

const FEATURE_WS_IDS = {
  new: 'new-pools',
  trending: 'trending',
  highVolume: 'high-volume',
};

export function usePools(feature, { enabled = true } = {}) {
  const config = POOL_FEATURES[feature];
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
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
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1_500,
  });

  useEffect(() => {
    if (!enabled || !config) return undefined;

    return subscribeFeature(FEATURE_WS_IDS[feature], (payload) => {
      const pools = Array.isArray(payload?.pools) ? payload.pools : [];
      if (pools.length === 0) return;

      queryClient.setQueryData(['pools', feature], (current) => {
        const currentPages = current?.pages ?? [];
        const pages =
          currentPages.length > 0
            ? currentPages.map((page, index) => (index === 0 ? pools : page))
            : [pools];
        return {
          ...current,
          pages,
          pageParams: current?.pageParams ?? [1],
        };
      });
    });
  }, [feature, enabled, config, queryClient]);

  return query;
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
  return mergePools(pages.flat());
}