import { ArrowDown, ArrowUp } from 'lucide-react';
import PoolRow from './PoolRow';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import { SORT_COLUMNS, isSecondaryColumn } from '../utils/sort';
import { getUniquePoolKey } from '../utils/normalize';

function SortableHeader({ column, sort, onSort }) {
  const isActive = sort.columnId === column.id;
  const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;

  const alignClass =
    column.align === 'right'
      ? 'text-right'
      : column.align === 'center'
        ? 'text-center'
        : 'text-left';

  return (
    <th
      scope="col"
      aria-sort={isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`table-cell col-${column.id} ${alignClass} ${
        isSecondaryColumn(column, sort.columnId) ? 'table-cell-col-optional' : ''
      } ${isActive ? 'text-blue-400' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.id)}
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-400"
      >
        {column.label}
        {isActive ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

export default function PoolTable({
  pools = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  isRefreshing = false,
  emptyMessage = 'No pools found',
  sort,
  onSort,
  showDexContext = false,
  rowOffset = 0,
}) {
  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return <ErrorMessage message={error?.message || 'Failed to load data'} onRetry={onRetry} />;
  }

  if (pools.length === 0) {
    return (
      <div className="empty-state">
        <svg
          className="w-12 h-12 mx-auto text-slate-700 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={isRefreshing ? 'is-refreshing' : ''}>
      <table className="w-full table-fixed text-xs" role="table">
        <thead className="table-header">
          <tr>
            <th scope="col" className="table-cell token-col text-left">
              TOKEN
            </th>
            {SORT_COLUMNS.map((column) => (
              <SortableHeader
                key={column.id}
                column={column}
                sort={sort}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="table-body">
          {pools.map((pool, index) => (
            <PoolRow
              key={getUniquePoolKey(pool) || index}
              pool={pool}
              index={index}
              sortColumnId={sort.columnId}
              showDexContext={showDexContext}
              rowOffset={rowOffset}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
