// Pool row - dense DEX Screener / GeckoTerminal style.
//
// Reads the single canonical pool shape produced by the backend:
//   { poolAddress, dex:{id,name}, baseToken:{address,symbol,name,iconUrl},
//     priceUsd, marketCap, fdv, liquidityUsd, volume:{m5,m1,h6,h24},
//     priceChange:{m5,m1,h6,h24}, txns:{...}, traders, age }
//
// Missing values arrive as null and render as "—". Nothing is invented here.

import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  formatCurrency,
  formatNumber,
  formatPrice,
  formatAge,
  formatPriceChange,
  formatTraders,
} from '../utils/normalize';
import TokenImagePreview from './TokenImagePreview';

const NETWORK_NAME = 'Robinhood Chain';
const FALLBACK_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-red-500',
];

function PriceChangeIcon({ direction }) {
  if (direction > 0) return <TrendingUp className="w-3 h-3" />;
  if (direction < 0) return <TrendingDown className="w-3 h-3" />;
  return <Minus className="w-3 h-3" />;
}

function PriceChangeCell({ value }) {
  const { text, className, direction } = formatPriceChange(value);
  if (text === '—') return <span className="compact-number-muted">—</span>;
  return (
    <span className={`compact-number ${className} flex items-center justify-end gap-1`}>
      {text}
      <PriceChangeIcon direction={direction} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// icons
// ---------------------------------------------------------------------------

// Deterministic colour from the symbol so the letter fallback is stable per
// token, and never the same circle for every row.
function fallbackColor(symbol) {
  if (!symbol) return 'bg-slate-600';
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    hash = (hash * 31 + symbol.charCodeAt(i)) % 100000;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function TokenIcon({ token, size = 28 }) {
  const [imgError, setImgError] = useState(false);
  const symbol = token?.symbol || null;
  const label = token?.name || symbol || 'Token';
  const style = { width: size, height: size };

  if (token?.iconUrl && !imgError) {
    return (
      <img
        src={token.iconUrl}
        alt={`${label} icon`}
        title={label}
        className="token-icon"
        style={style}
        onError={() => setImgError(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`token-icon-fallback ${fallbackColor(symbol)}`}
      style={style}
      title={label}
      aria-label={`${label} (no image available)`}
    >
      {symbol?.charAt(0).toUpperCase() || '?'}
    </div>
  );
}

function NetworkIcon({ size = 24 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0"
      title={NETWORK_NAME}
      aria-label={NETWORK_NAME}
      role="img"
    >
      <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    </div>
  );
}

// Per-DEX branding comes from the provider's own logo when it exposes one,
// otherwise a neutral monogram of the DEX name.
function DexIcon({ dex, size = 24 }) {
  const name = dex?.name || dex?.id || null;
  const display = name || 'Unknown DEX';
  const monogram = display.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'DX';
  const hue = hashHue(display);

  return (
    <div
      style={{ width: size, height: size, backgroundColor: hue }}
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-[9px] leading-none"
      title={display}
      aria-label={display}
      role="img"
    >
      {monogram}
    </div>
  );
}

function hashHue(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 55% 42%)`;
}

// ---------------------------------------------------------------------------
// row
// ---------------------------------------------------------------------------

function shortAddress(address) {
  if (!address) return '';
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export default function PoolRow({ pool, index }) {
  const [previewToken, setPreviewToken] = useState(null);

  const base = pool?.baseToken ?? {};
  const quote = pool?.quoteToken ?? {};

  const baseSymbol = base.symbol || null;
  const quoteSymbol = quote.symbol || null;
  const baseName = base.name || baseSymbol || 'Unknown token';

  // Fall back to the pair label when the provider gave us no symbols at all.
  const hasSymbols = Boolean(baseSymbol || quoteSymbol);
  const pairLabel = hasSymbols
    ? `${baseSymbol || '?'} / ${quoteSymbol || '?'}`
    : pool?.dex?.name || shortAddress(pool?.poolAddress) || 'Unknown pair';

  const dexLabel = (pool?.dex?.name || pool?.dex?.id || 'Unknown DEX')
    .replace(new RegExp(`[-_]?${'robinhood'}$`, 'i'), '')
    .toUpperCase();

  const marketCap = pool?.marketCap ?? pool?.fdv ?? null;
  const txns24h = pool?.txns?.h24
    ? (pool.txns.h24.buys ?? 0) + (pool.txns.h24.sells ?? 0)
    : null;

  const canPreview = Boolean(base.iconUrl);

  return (
    <tr className="table-row">
      <td className="table-cell token-cell token-cell-sticky text-left">
        <div className="token-info">
          <span className="text-slate-500 font-mono text-xs w-6 text-right mr-1">{index + 1}</span>

          <div className="token-icons flex items-center gap-1 flex-shrink-0">
            <NetworkIcon size={24} />

            <DexIcon dex={pool?.dex} size={24} />

            {canPreview ? (
              <button
                type="button"
                onClick={() => setPreviewToken({ ...base, symbol: baseSymbol, name: baseName })}
                className="token-icon-button"
                title={`Preview ${baseName}`}
                aria-label={`Enlarge ${baseName} icon`}
              >
                <TokenIcon token={{ ...base, symbol: baseSymbol, name: baseName }} size={28} />
              </button>
            ) : (
              <TokenIcon token={{ ...base, symbol: baseSymbol, name: baseName }} size={28} />
            )}
          </div>

          <div className="token-details min-w-0">
            <div className="flex items-center gap-1.5 flex-nowrap truncate">
              <span className="token-symbol truncate">{pairLabel}</span>
              <span className="token-name truncate max-w-[150px]" title={baseName}>
                {hasSymbols ? baseName : ''}
              </span>
              <span className="token-dex-label">{dexLabel}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">{marketCap === null ? '—' : formatCurrency(marketCap)}</span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {pool?.priceUsd === null || pool?.priceUsd === undefined
            ? '—'
            : formatPrice(pool.priceUsd)}
        </span>
      </td>

      <td className="table-cell table-cell-center">
        <span className="compact-number-muted">{formatAge(pool?.poolCreatedAt, pool?.age) || '—'}</span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {txns24h === null ? '—' : (formatNumber(txns24h) ?? '—')}
        </span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {pool?.volume?.h24 === null || pool?.volume?.h24 === undefined
            ? '—'
            : formatCurrency(pool.volume.h24)}
        </span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number-muted">{formatTraders(pool?.traders)}</span>
      </td>

      <td className="table-cell table-cell-right">
        <PriceChangeCell value={pool?.priceChange?.m5} />
      </td>

      <td className="table-cell table-cell-right">
        <PriceChangeCell value={pool?.priceChange?.m1} />
      </td>

      <td className="table-cell table-cell-right">
        <PriceChangeCell value={pool?.priceChange?.h6} />
      </td>

      <td className="table-cell table-cell-right">
        <PriceChangeCell value={pool?.priceChange?.h24} />
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {pool?.liquidityUsd === null || pool?.liquidityUsd === undefined
            ? '—'
            : formatCurrency(pool.liquidityUsd)}
        </span>
      </td>

      {previewToken ? (
        <TokenImagePreview token={previewToken} onClose={() => setPreviewToken(null)} />
      ) : null}
    </tr>
  );
}
