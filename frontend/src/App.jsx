import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useNewPools, useTrendingPools, useHighVolumePools, usePoolList } from './hooks/usePools';
import { useSearch } from './hooks/useSearch';
import { useSort } from './hooks/useSort';
import { sortPools } from './utils/sort';
import { getUniquePoolKey } from './utils/normalize';
import Sidebar from './components/Sidebar';
import DexNavigation from './components/DexNavigation';
import CategoryNavigation from './components/CategoryNavigation';
import PoolTable from './components/PoolTable';
import InfiniteScroll from './components/InfiniteScroll';
import SearchResults from './components/SearchResults';
import {
  ALL_DEXES,
  CATEGORY_BASE_PATH,
  DEFAULT_CATEGORY_PATH,
  categoryDexPath,
  categoryIdFromSegment,
  getCategory,
} from './routes/categories';

const NETWORK_NAME = 'Robinhood Chain';

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
      if (!existing.iconUrl && dex?.iconUrl) existing.iconUrl = dex.iconUrl;
    } else {
      index.set(id, {
        id,
        name: dex?.name || dex?.id,
        iconUrl: dex?.iconUrl ?? null,
        poolCount: 1,
      });
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

function Dashboard() {
  const { category: categorySegment, dexId: dexSegment } = useParams();
  const navigate = useNavigate();

  // The URL is the source of truth for both the category and the selected DEX,
  // so a direct visit, a refresh and a back/forward step all resolve the same
  // way. An unrecognised category segment redirects instead of rendering an
  // empty dashboard.
  const resolvedId = categoryIdFromSegment(categorySegment);

  useEffect(() => {
    if (resolvedId === null) navigate(DEFAULT_CATEGORY_PATH, { replace: true });
  }, [resolvedId, navigate]);

  const activeCategory = resolvedId ?? 'new';

  // React Router hands back a decoded path segment, so this is the provider's
  // own normalized DEX id (e.g. `uniswap-v4-robinhood`).
  const requestedDexId =
    typeof dexSegment === 'string' && dexSegment.trim() ? dexSegment.trim() : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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

  // A DEX id in the URL that is not in this category's loaded data falls back to
  // All DEXes instead of rendering an empty table. While the first page is still
  // loading the list is not yet a reliable index, so the requested id is kept.
  const selectedDex = useMemo(() => {
    if (!requestedDexId) return ALL_DEXES;
    if (availableDexes.length === 0) return requestedDexId;
    return availableDexes.some((dex) => dex.id === requestedDexId) ? requestedDexId : ALL_DEXES;
  }, [requestedDexId, availableDexes]);

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

  const handleCategoryChange = useCallback(
    (categoryId) => navigate(categoryDexPath(categoryId, ALL_DEXES)),
    [navigate],
  );

  const handleDexChange = useCallback(
    (dexId) => navigate(categoryDexPath(activeCategory, dexId)),
    [activeCategory, navigate],
  );

  // Search is a category-wide view, so it is cleared whenever the category
  // changes — from a sidebar click or from browser back/forward alike. The DEX
  // filter no longer needs resetting here because it lives in the URL.
  const previousCategoryRef = useRef(activeCategory);
  useEffect(() => {
    if (previousCategoryRef.current === activeCategory) return;
    previousCategoryRef.current = activeCategory;
    setSearchQuery('');
  }, [activeCategory]);

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
  const copy = getCategory(activeCategory);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        isSearchOpen={isSearchOpen}
        onSearchOpenChange={setIsSearchOpen}
        networkName={NETWORK_NAME}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {isSearching && (
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
            <h2 className="truncate text-sm font-semibold text-slate-100">Search Results</h2>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-blue-400 transition-colors hover:text-blue-300"
            >
              Clear
            </button>
          </header>
        )}

        {!isSearching && (
          <DexNavigation
            dexes={availableDexes}
            selectedDex={selectedDex}
            onSelect={handleDexChange}
          />
        )}

        {!isSearching && (
          <CategoryNavigation
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
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

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
                showDexContext={selectedDex === ALL_DEXES}
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={DEFAULT_CATEGORY_PATH} replace />} />
      <Route path={`${CATEGORY_BASE_PATH}/:category`} element={<Dashboard />} />
      <Route path={`${CATEGORY_BASE_PATH}/:category/:dexId`} element={<Dashboard />} />
      <Route path="*" element={<Navigate to={DEFAULT_CATEGORY_PATH} replace />} />
    </Routes>
  );
}