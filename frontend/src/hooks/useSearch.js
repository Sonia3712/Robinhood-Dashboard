import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

const DEBOUNCE_MS = 300;

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useSearch(query) {
  const trimmed = (query || '').trim();
  const settledQuery = useDebouncedValue(trimmed, DEBOUNCE_MS);

  const result = useQuery({

    queryKey: ['search', settledQuery],
    queryFn: async ({ signal }) => {
      const result = await api.search(settledQuery, { signal });
      return {
        ...result,
        pools: Array.isArray(result?.pools) ? result.pools : [],
        tokens: Array.isArray(result?.tokens) ? result.tokens : [],
      };
    },

    enabled: settledQuery.length > 0 && settledQuery === trimmed,
    staleTime: 60_000,
    gcTime: 10 * 60_000,

    refetchInterval: false,
    retry: 1,
    retryDelay: 1_500,
  });

  return { ...result, settledQuery };
}
