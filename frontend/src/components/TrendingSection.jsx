// Trending pools section.
//
// "Load More" appends the next page; it used to be wired to the page state and
// replaced the list instead. The retry button is now the query's own refetch
// rather than a page increment.
import PoolTable from './PoolTable';

export default function TrendingSection({
  pools = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) {
  return (
    <div className="space-y-3">
      <PoolTable
        pools={pools}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={onRetry}
        isRefreshing={isLoadingMore}
        emptyMessage="No trending pools found"
      />

      {hasMore && pools.length > 0 && (
        <div className="text-center pt-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
