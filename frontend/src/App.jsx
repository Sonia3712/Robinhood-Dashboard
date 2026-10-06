import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useNewPools, useTrendingPools, useHighVolumePools } from './hooks/usePools';
import { useSearch } from './hooks/useSearch';
import { useSort } from './hooks/useSort';
import { sortPools } from './utils/sort';
import { getUniquePoolKey } from './utils/normalize';
import Sidebar from './components/Sidebar';
import DexNavigation from './components/DexNavigation';
import CategoryNavigation from './components/CategoryNavigation';
import PoolTable from './components/PoolTable';
import Pagination from './components/Pagination';
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
const PAGE_SIZE = 20;

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

function getDexPaginatedPools(allPools, selectedDex, page, pageSize) {
  if (selectedDex === ALL_DEXES) {
    // For All DEXes, we use the provider's pagination directly
    // The caller should pass the current page's pools only
    return { pools: allPools, totalPages: 1, hasMore: false };
  }

  // For specific DEX: filter, deduplicate, sort, then paginate
  const filtered = allPools.filter((pool) => matchesDex(pool, selectedDex));

  const seen = new Set();
  const deduped = [];
  for (const pool of filtered) {
    const key = getUniquePoolKey(pool);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(pool);
  }

  const sorted = sortPools(deduped, { columnId: 'age', direction: 'asc' }); // Default sort, will be overridden by caller

  const totalPools = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalPools / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pagePools = sorted.slice(start, end);
  const hasMore = end < totalPools;

  return {
    pools: pagePools,
    totalPages,
    hasMore,
    totalPools,
    rowOffset: start,
  };
}

function Dashboard() {
  const { category: categorySegment, dexId: dexSegment } = useParams();
  const navigate = useNavigate();

  const resolvedId = categoryIdFromSegment(categorySegment);

  useEffect(() => {
    if (resolvedId === null) navigate(DEFAULT_CATEGORY_PATH, { replace: true });
  }, [resolvedId, navigate]);

  const activeCategory = resolvedId ?? 'new';

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

  const activeQuery =
    activeCategory === 'new'
      ? newPoolsQuery
      : activeCategory === 'trending'
        ? trendingQuery
        : highVolumeQuery;

  // All cached pools across all loaded pages for this category
  const allCachedPools = activeQuery.allCachedPools ?? [];

  // Build DEX index from ALL cached pools
  const availableDexes = useMemo(() => buildDexIndex(allCachedPools), [allCachedPools]);

  // Resolve selected DEX from URL
  const selectedDex = useMemo(() => {
    if (!requestedDexId) return ALL_DEXES;
    if (availableDexes.length === 0) return requestedDexId;
    return availableDexes.some((dex) => dex.id === requestedDexId) ? requestedDexId : ALL_DEXES;
  }, [requestedDexId, availableDexes]);

  // DEX-specific pagination state
  const [dexPage, setDexPage] = useState(1);

  // Reset DEX page when DEX or category changes
  useEffect(() => {
    setDexPage(1);
  }, [selectedDex, activeCategory]);

  // Compute visible pools and pagination for current view
  const { pools: visiblePools, totalPages: dexTotalPages, hasMore: dexHasMore, rowOffset } = useMemo(() => {
    if (selectedDex === ALL_DEXES) {
      // All DEXes: use provider pagination directly
      return {
        pools: activeQuery.pools,
        totalPages: activeQuery.totalPages,
        hasMore: activeQuery.hasMore,
        rowOffset: (activeQuery.currentPage - 1) * PAGE_SIZE,
      };
    }

    // Specific DEX: filter all cached pools, then paginate
    const filtered = allCachedPools.filter((pool) => matchesDex(pool, selectedDex));

    const seen = new Set();
    const deduped = [];
    for (const pool of filtered) {
      const key = getUniquePoolKey(pool);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(pool);
    }

    const sorted = sortPools(deduped, sort);
    const totalPools = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalPools / PAGE_SIZE));
    const clampedPage = Math.max(1, Math.min(dexPage, totalPages));
    const start = (clampedPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pagePools = sorted.slice(start, end);
    const hasMore = end < totalPools;

    // If clampedPage changed, update state (will trigger re-render)
    if (clampedPage !== dexPage) {
      setDexPage(clampedPage);
    }

    return {
      pools: pagePools,
      totalPages,
      hasMore,
      rowOffset: start,
    };
  }, [selectedDex, activeQuery.pools, activeQuery.currentPage, activeQuery.totalPages, activeQuery.hasMore, allCachedPools, sort, dexPage]);

  const handleCategoryChange = useCallback(
    (categoryId) => navigate(categoryDexPath(categoryId, ALL_DEXES)),
    [navigate],
  );

  const handleDexChange = useCallback(
    (dexId) => navigate(categoryDexPath(activeCategory, dexId)),
    [activeCategory, navigate],
  );

  // Handle DEX pagination (only for specific DEX)
  const handleDexPageChange = useCallback(
    (page) => {
      setDexPage(page);
    },
    [],
  );

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

  const isRateLimited = Boolean(activeQuery.isRateLimited);
  const retryRateLimited = activeQuery.retryRateLimited;
  const retryAfterMs = activeQuery.retryAfterMs;

  useEffect(() => {
    if (!isRateLimited) return undefined;

    const timer = setTimeout(() => {
      retryRateLimited();
    }, Math.max(2_500, retryAfterMs ?? 5_000));

    return () => clearTimeout(timer);
  }, [isRateLimited, retryAfterMs, retryRateLimited]);

  const isInitialLoading = activeQuery.isLoading;
  const hasBlockingError = activeQuery.isError && visiblePools.length === 0 && !isRateLimited;
  const copy = getCategory(activeCategory);

  // Pagination props - use provider pagination for All DEXes, DEX-specific for specific DEX
  const paginationCurrentPage = selectedDex === ALL_DEXES ? activeQuery.currentPage : dexPage;
  const paginationTotalPages = selectedDex === ALL_DEXES ? activeQuery.totalPages : dexTotalPages;
  const paginationHasMore = selectedDex === ALL_DEXES ? activeQuery.hasMore : dexHasMore;
  const paginationOnPageChange = selectedDex === ALL_DEXES ? activeQuery.goToPage : handleDexPageChange;
  const paginationDisabled = activeQuery.isFetching;

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
                isRefreshing={activeQuery.isFetching}
                emptyMessage={
                  selectedDex === ALL_DEXES
                    ? copy.empty
                    : `No ${copy.title.toLowerCase()} for this DEX`
                }
                sort={sort}
                onSort={toggleSort}
                showDexContext={selectedDex === ALL_DEXES}
                rowOffset={rowOffset}
              />

              <Pagination
                currentPage={paginationCurrentPage}
                totalPages={paginationTotalPages}
                hasMore={paginationHasMore}
                onPageChange={paginationOnPageChange}
                disabled={paginationDisabled}
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