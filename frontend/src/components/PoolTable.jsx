// Pool table - dense DEX Screener / GeckoTerminal style.
import PoolRow from './PoolRow';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import { getUniquePoolKey } from '../utils/normalize';

export default function PoolTable({
  pools = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  isRefreshing = false,
  emptyMessage = 'No pools found',
}) {
  // A background poll must not tear the table down and replace it with a
  // spinner; only the first load does that.
  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return <ErrorMessage message={error?.message || 'Failed to load data'} onRetry={onRetry} />;
  }

  if (pools.length === 0) {
    return (
      <div className="empty-state">
        <svg className="w-12 h-12 mx-auto text-slate-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`table-container overflow-x-auto ${isRefreshing ? 'is-refreshing' : ''}`}>
      <table className="w-full text-sm" role="table">
        <thead className="table-header">
          <tr>
            <th className="table-cell token-cell text-left">TOKEN</th>
            <th className="table-cell table-cell-right">MCAP</th>
            <th className="table-cell table-cell-right">PRICE</th>
            <th className="table-cell table-cell-center">AGE</th>
            <th className="table-cell table-cell-right">TXNS</th>
            <th className="table-cell table-cell-right">VOLUME</th>
            <th className="table-cell table-cell-right">TRADERS</th>
            <th className="table-cell table-cell-right">5M</th>
            <th className="table-cell table-cell-right">1H</th>
            <th className="table-cell table-cell-right">6H</th>
            <th className="table-cell table-cell-right">24H</th>
            <th className="table-cell table-cell-right">LIQUIDITY</th>
          </tr>
        </thead>
        <tbody className="table-body">
          {pools.map((pool, index) => (
            <PoolRow key={getUniquePoolKey(pool) || index} pool={pool} index={index} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
