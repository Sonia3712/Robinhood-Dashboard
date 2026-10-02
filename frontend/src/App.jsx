import { useState, useCallback, useMemo } from 'react';
import { Search, TrendingUp, ListFilter } from 'lucide-react';
import { useNewPools, useTrendingPools, useHighVolumePools, usePoolList } from './hooks/usePools';
import { useSearch } from './hooks/useSearch';
import PoolTable from './components/PoolTable';
import SearchBar from './components/SearchBar';
import SearchResults from './components/SearchResults';
import TrendingSection from './components/TrendingSection';
import DataSourceBadge from './components/DataSourceBadge';

const TABS = [
  { id: 'new', label: 'New Pools', icon: Search },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'volume', label: 'High Volume', icon: ListFilter },
];

const NETWORK_NAME = 'Robinhood Chain';

const TAB_COPY = {
  new: {
    title: 'New Pools',
    subtitle: 'Newest pools on Robinhood Chain, by creation time',
    empty: 'No new pools found',
  },
  trending: {
    title: 'Trending Pools',
    subtitle: "GeckoTerminal's trending ranking on Robinhood Chain",
    empty: 'No trending pools found',
  },
  volume: {
    title: 'High Volume Pools',
    subtitle: 'Robinhood Chain pools ranked by 24h USD volume',
    empty: 'No pools found',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('new');
  const [searchQuery, setSearchQuery] = useState('');

  const newPoolsQuery = useNewPools({ enabled: activeTab === 'new' });
  const trendingQuery = useTrendingPools({ enabled: activeTab === 'trending' });
  const highVolumeQuery = useHighVolumePools({ enabled: activeTab === 'volume' });

  const searchQueryResult = useSearch(searchQuery);

  const isSearching = searchQuery.trim().length > 0;

  const newPools = usePoolList(newPoolsQuery);
  const trendingPools = usePoolList(trendingQuery);
  const highVolumePools = usePoolList(highVolumeQuery);

  const searchPools = useMemo(
    () => (searchQueryResult.data?.pools ?? []),
    [searchQueryResult.data],
  );

  const copy = TAB_COPY[activeTab];

  const poolsByTab = {
    new: newPools,
    trending: trendingPools,
    volume: highVolumePools,
  };

  const activeQuery =
    activeTab === 'new' ? newPoolsQuery : activeTab === 'trending' ? trendingQuery : highVolumeQuery;

  const isBusy = activeQuery.isPending && activeQuery.data === undefined;

  const lastUpdated = activeQuery.dataUpdatedAt || 0;

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setSearchQuery('');
  }, []);

  const handleLoadMore = useCallback(() => {
    if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      activeQuery.fetchNextPage();
    }
  }, [activeQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-30">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-200 to-blue-400 bg-clip-text text-transparent">
                Robinhood Chain DEX
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="select-dark flex items-center gap-2 cursor-default"
                aria-label="Network"
                title={`All results are filtered to ${NETWORK_NAME} (chainId 4663)`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-400" aria-hidden="true" />
                {NETWORK_NAME}
              </span>
            </div>
          </div>

          <div className="toolbar-group">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search token, symbol, or address..."
              className="max-w-sm sm:max-w-md"
            />
          </div>

          <nav className="border-t border-slate-700/50" aria-label="Data views">
            <ul className="flex overflow-x-auto gap-1" role="tablist">
              {TABS.map((tab) => {
                const Icon = tab.icon;

                const isActive = !isSearching && activeTab === tab.id;
                return (
                  <li key={tab.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`${tab.id}-panel`}
                      id={`${tab.id}-tab`}
                      onClick={() => handleTabChange(tab.id)}
                      className={`tab-button ${isActive ? 'tab-active' : 'tab-inactive'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {isSearching ? (
          <div className="table-container" id="search-panel" role="tabpanel">
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-100">Search Results</h2>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
                >
                  Back to {copy.title}
                </button>
              </div>
            </div>
            <div className="p-3">
              <SearchResults
                query={searchQueryResult.settledQuery}
                pools={searchPools}
                tokens={searchQueryResult.data?.tokens ?? []}
                isLoading={searchQueryResult.isPending}
                isFetching={searchQueryResult.isFetching}
                isError={searchQueryResult.isError}
                error={searchQueryResult.error}
                matchType={searchQueryResult.data?.matchType}
                verifiedOnChain={searchQueryResult.data?.verifiedOnChain}
                onRetry={() => searchQueryResult.refetch()}
              />
            </div>
          </div>
        ) : (
          <div className="table-container" id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`}>
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{copy.title}</h2>
                <p className="text-xs text-slate-500">{copy.subtitle}</p>
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {poolsByTab[activeTab].length} pools
              </span>
            </div>

            <div className="p-3">
              {activeTab === 'trending' ? (
                <TrendingSection
                  pools={trendingPools}
                  isLoading={trendingQuery.isPending}
                  isError={trendingQuery.isError}
                  error={trendingQuery.error}
                  onRetry={() => trendingQuery.refetch()}
                  hasMore={trendingQuery.hasNextPage}
                  isLoadingMore={trendingQuery.isFetchingNextPage}
                  onLoadMore={handleLoadMore}
                />
              ) : (
                <PoolTable
                  pools={poolsByTab[activeTab]}
                  isLoading={isBusy}
                  isError={activeQuery.isError}
                  error={activeQuery.error}
                  onRetry={() => activeQuery.refetch()}
                  isRefreshing={activeQuery.isFetching && !activeQuery.isPending}
                  emptyMessage={copy.empty}
                />
              )}
            </div>
          </div>
        )}

        <div className="status-strip">
          <span>
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : 'Not yet loaded'}
          </span>
          {activeQuery.isFetching && !activeQuery.isPending ? <span>Refreshing…</span> : null}
        </div>

        <DataSourceBadge source={isSearching ? 'mixed' : 'geckoterminal'} />
      </main>
    </div>
  );
}





