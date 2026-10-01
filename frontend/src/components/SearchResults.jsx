// Search results - shows the trading pairs an address or name resolves to.
//
// The banner states which kind of match these are, so symbol results are never
// presented as if they were results for the exact contract address.
import PoolTable from './PoolTable';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function MatchBanner({ query, matchType, verifiedOnChain, count }) {
  if (ADDRESS_PATTERN.test(query.trim())) {
    return (
      <div
        className={`match-banner ${verifiedOnChain ? 'match-banner-ok' : 'match-banner-warn'}`}
        role="status"
      >
        <span className="match-banner-title">
          {verifiedOnChain ? 'Verified contract on Robinhood Chain' : 'No contract code on Robinhood Chain'}
        </span>
        <span className="match-banner-body">
          {count} {count === 1 ? 'pool' : 'pools'} where this exact address is the base or quote token.
          {verifiedOnChain ? '' : ' Symbol matches are not substituted for address matches.'}
        </span>
      </div>
    );
  }

  return (
    <div className="match-banner" role="status">
      <span className="match-banner-title">Symbol / name search</span>
      <span className="match-banner-body">
        {count} {count === 1 ? 'pool' : 'pools'} matching “{query}” on Robinhood Chain. A symbol can
        match several different contracts.
      </span>
    </div>
  );
}

export default function SearchResults({
  query = '',
  pools = [],
  tokens = [],
  isLoading = false,
  isFetching = false,
  isError = false,
  error = null,
  matchType,
  verifiedOnChain,
  onRetry,
}) {
  const hasQuery = query.trim().length > 0;

  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return <ErrorMessage message={error?.message || 'Search failed'} onRetry={onRetry} />;
  }

  if (!hasQuery) {
    return (
      <div className="text-center py-16 text-slate-500">
        <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-lg font-medium">Search for a token</p>
        <p className="text-sm mt-1">Try a token name, symbol, or contract address</p>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="space-y-4">
        <MatchBanner
          query={query}
          matchType={matchType}
          verifiedOnChain={verifiedOnChain}
          count={0}
        />
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg font-medium">No trading pairs found</p>
          <p className="text-sm mt-1">
            {ADDRESS_PATTERN.test(query.trim())
              ? 'No Robinhood Chain pool uses this contract as its base or quote token.'
              : 'Try a different token name, symbol, or contract address.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MatchBanner
        query={query}
        matchType={matchType}
        verifiedOnChain={verifiedOnChain}
        count={pools.length}
      />

      {isFetching ? (
        <p className="text-xs text-slate-500" role="status">
          Refreshing results…
        </p>
      ) : null}

      <PoolTable
        pools={pools}
        isLoading={false}
        isError={false}
        error={null}
        onRetry={onRetry}
        isRefreshing={isFetching}
        emptyMessage="No trading pairs found"
      />

      {tokens.length > 0 ? (
        <p className="text-xs text-slate-500">
          {tokens.length} matching {tokens.length === 1 ? 'token' : 'tokens'} across these pools.
        </p>
      ) : null}
    </div>
  );
}
