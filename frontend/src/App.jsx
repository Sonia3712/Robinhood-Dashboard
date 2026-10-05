import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNewPools, useTrendingPools, useHighVolumePools, usePoolList } from './hooks/usePools';
import { useSearch } from './hooks/useSearch';
import { useSort } from './hooks/useSort';
import { sortPools } from './utils/sort';
import { getUniquePoolKey } from './utils/normalize';
import Sidebar from './components/Sidebar';
import DexNavigation from './components/DexNavigation';
import PoolTable from './components/PoolTable';
import InfiniteScroll from './components/InfiniteScroll';
import SearchResults from './components/SearchResults';

const ALL_DEXES = 'all';
const NETWORK_NAME = 'Robinhood Chain';

const CATEGORY_COPY = {
  new: { title: 'New Pools', empty: 'No new pools found' },
  trending: { title: 'Trending Pools', empty: 'No trending pools found' },
  volume: { title: 'High Volume Pools', empty: 'No pools found' },
};

function buildDexIndex(pools) {
  const index = new Map();

  for (const pool of pools) {
    const dex = pool?.dex;
    const id = dex?.id;
    if (!id) continue;

    const existing = index.get(id);
    if (existing) {
      existing.poolCount += 1;
      if (!existing.name && dex?.name) existing.name = dex.name;
    } else {
      index.set(id, { id, name: dex?.name || dex?.id, poolCount: 1 });
    }
  }

  return Array.from(index.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

function matchesDex(pool, dexId) {
  if (dexId === ALL_DEXES) return true;
  return pool?.dex?.id === dexId;
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState('new');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDex, setSelectedDex] = useState(ALL_DEXES);
  const { sort, toggleSort } = useSort();

  const newPoolsQuery = useNewPools({ enabled: activeCategory === 'new' });
  const trendingQuery = useTrendingPools({ enabled: activeCategory === 'trending' });
  const highVolumeQuery = useHighVolumePools({ enabled: activeCategory === 'volume' });

  const searchResult = useSearch(searchQuery);
  const isSearching = searchQuery.trim().length > 0;

  const newPools = usePoolList(newPoolsQuery);
  const trendingPools = usePoolList(trendingQuery);
  const highVolumePools = usePoolList(highVolumeQuery);

  const activeQuery =
    activeCategory === 'new'
      ? newPoolsQuery
      : activeCategory === 'trending'
        ? trendingQuery
        : highVolumeQuery;

  const poolsByCategory = useMemo(
    () => ({
      new: newPools,
      trending: trendingPools,
      volume: highVolumePools,
    }),
    [newPools, trendingPools, highVolumePools],
  );

  const currentPools = poolsByCategory[activeCategory];

  const availableDexes = useMemo(() => buildDexIndex(currentPools), [currentPools]);

  const visiblePools = useMemo(() => {
    const filtered = currentPools.filter((pool) => matchesDex(pool, selectedDex));

    const seen = new Set();
    const deduped = [];
    for (const pool of filtered) {
      const key = getUniquePoolKey(pool);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(pool);
    }

    return sortPools(deduped, sort);
  }, [currentPools, selectedDex, sort]);

  const handleCategoryChange = useCallback((categoryId) => {
    setActiveCategory(categoryId);
    setSearchQuery('');
    setSelectedDex(ALL_DEXES);
  }, []);

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    if (value.trim()) setIsSearchOpen(true);
  }, []);

  const isRateLimited = Boolean(activeQuery.rateLimited);
  const retryRateLimited = activeQuery.retryRateLimited;
  const retryAfterMs = activeQuery.retryAfterMs;
  const handleLoadMore = activeQuery.loadMore;

  // Already-loaded pages stay on screen while the provider cools down; the
  // stalled page is retried once per backoff window instead of on every scroll.
  useEffect(() => {
    if (!isRateLimited) return undefined;

    const timer = setTimeout(() => {
      retryRateLimited();
    }, Math.max(2_500, retryAfterMs ?? 5_000));

    return () => clearTimeout(timer);
  }, [isRateLimited, retryAfterMs, retryRateLimited]);

  const isInitialLoading = activeQuery.isPending && activeQuery.data === undefined;

  // A failed page never clears the table: only an empty result is a hard error.
  const hasBlockingError = activeQuery.isError && visiblePools.length === 0 && !isRateLimited;
  const copy = CATEGORY_COPY[activeCategory];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        isSearchOpen={isSearchOpen}
        onSearchOpenChange={setIsSearchOpen}
        networkName={NETWORK_NAME}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
          <h2 className="truncate text-sm font-semibold text-slate-100">
            {isSearching ? 'Search Results' : copy.title}
          </h2>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500">
            {!isSearching && availableDexes.length > 0 && (
              <span className="tabular-nums">
                {visiblePools.length} of {currentPools.length} pools
              </span>
            )}
            {activeQuery.dataUpdatedAt > 0 && (
              <span className="hidden sm:inline tabular-nums">
                {new Date(activeQuery.dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            {isSearching && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-blue-400 transition-colors hover:text-blue-300"
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {!isSearching && (
          <DexNavigation
            dexes={availableDexes}
            selectedDex={selectedDex}
            onSelect={setSelectedDex}
          />
        )}

        {!isSearching && isRateLimited && (
          <div className="rate-limit-notice" role="status">
            <span className="rate-limit-notice-label">Rate limited — retrying…</span>
            <button
              type="button"
              className="rate-limit-notice-action"
              onClick={retryRateLimited}
              disabled={activeQuery.isFetching}
            >
              Retry now
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto">
          {isSearching ? (
            <SearchResults
              query={searchResult.settledQuery}
              pools={sortPools(searchResult.data?.pools ?? [], sort)}
              sort={sort}
              onSort={toggleSort}
              tokens={searchResult.data?.tokens ?? []}
              isLoading={searchResult.isPending}
              isFetching={searchResult.isFetching}
              isError={searchResult.isError}
              error={searchResult.error}
              matchType={searchResult.data?.matchType}
              verifiedOnChain={searchResult.data?.verifiedOnChain}
              onRetry={() => searchResult.refetch()}
            />
          ) : (
            <>
              <PoolTable
                pools={visiblePools}
                isLoading={isInitialLoading}
                isError={hasBlockingError}
                error={activeQuery.error}
                onRetry={() => activeQuery.refetch()}
                isRefreshing={activeQuery.isFetching && !activeQuery.isFetchingNextPage}
                emptyMessage={
                  selectedDex === ALL_DEXES
                    ? copy.empty
                    : `No ${copy.title.toLowerCase()} for this DEX`
                }
                sort={sort}
                onSort={toggleSort}
              />

              <InfiniteScroll
                hasMore={Boolean(activeQuery.hasNextPage)}
                isFetching={Boolean(activeQuery.isFetchingNextPage)}
                isWaiting={isRateLimited}
                onLoadMore={handleLoadMore}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
