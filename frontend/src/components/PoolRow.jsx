import { useRef, useState } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import {
  formatCurrency,
  formatNumber,
  formatPriceUsd,
  formatAge,
  formatPriceChange,
  formatTraders,
  getDexLabel,
  getDexVersion,
  isRecentPool,
} from '../utils/normalize';
import { getDexImage } from '../utils/dexIcons';
import { SORT_COLUMNS, isSecondaryColumn } from '../utils/sort';
import TokenImagePreview from './TokenImagePreview';

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

function hashToIndex(value, modulo) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash % modulo;
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
      className={`token-icon-fallback ${FALLBACK_COLORS[hashToIndex(symbol ?? label, FALLBACK_COLORS.length)]}`}
      style={style}
      title={label}
      aria-label={`${label} (no image available)`}
    >
      {symbol?.charAt(0).toUpperCase() || '?'}
    </div>
  );
}

/**
 * DEX mark for the All DEXes row.
 *
 * Renders the real local brand logo (see `src/utils/dexIcons.js`) as a genuine
 * <img>, sized, rounded and bordered exactly like the token icon beside it so
 * the two identity marks in the cell read consistently. Brands are resolved
 * from the provider's real `dex.id` / `dex.name`; nothing is fabricated. A DEX
 * whose brand is not shipped yet falls back to the neutral swap tile.
 */
function DexIcon({ dex }) {
  const [imgError, setImgError] = useState(false);
  const logo = getDexImage(dex);
  const label = getDexLabel(dex) ?? 'Unknown DEX';

  if (logo && !imgError) {
    return (
      <img
        src={logo.src}
        alt={`${label} logo`}
        title={label}
        className="dex-icon"
        onError={() => setImgError(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span
      className="dex-icon dex-icon-fallback"
      title={label}
      aria-label={`${label} (no DEX artwork available)`}
    >
      <ArrowLeftRight className="dex-icon-glyph" aria-hidden="true" />
    </span>
  );
}

function shortAddress(address) {
  if (!address) return '';
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

/**
 * A ticker is only usable if it carries at least one alphanumeric character.
 * Providers occasionally report symbols such as "???" for unlabelled tokens;
 * those are dropped rather than rendered as a broken placeholder.
 */
function usableSymbol(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[a-z0-9]/i.test(trimmed)) return null;
  return trimmed;
}

export default function PoolRow({ pool, index, sortColumnId, showDexContext = false }) {
  const [hoveredToken, setHoveredToken] = useState(null);
  const [iconHot, setIconHot] = useState(false);
  const [previewHot, setPreviewHot] = useState(false);
  const previewButtonRef = useRef(null);

  const base = pool?.baseToken ?? {};
  const quote = pool?.quoteToken ?? {};

  // Some providers report a symbol with no alphanumeric content (e.g. "???").
  // That is placeholder-looking noise rather than a real ticker, so it is
  // treated as "not reported" and the token name is preferred instead.
  const baseSymbol = usableSymbol(base.symbol) || usableSymbol(base.name);
  const quoteSymbol = usableSymbol(quote.symbol) || usableSymbol(quote.name);
  const baseName = base.name || null;

  const dexLabel = getDexLabel(pool?.dex);
  const dexVersion = getDexVersion(pool?.dex);

  // Only render symbols the provider actually reported; the base symbol carries
  // the emphasis and the quote symbol is muted. Nothing is invented for a
  // missing value, and no separator is emitted when one side is absent.
  const pairTitle = [baseSymbol, quoteSymbol].filter(Boolean).join(' / ');
  const pairFallback = dexLabel || shortAddress(pool?.poolAddress) || null;

  const projectName = baseName && baseName !== baseSymbol ? baseName : null;

  // Boost is a paid DEX Screener placement; the pool fee tier is intentionally
  // not displayed as a second badge.
  const boosts = Number.isFinite(pool?.boosts) && pool.boosts > 0 ? Math.trunc(pool.boosts) : null;

  const marketCap = pool?.marketCap ?? pool?.fdv ?? null;
  const txns24h = pool?.txns?.h24
    ? (pool.txns.h24.buys ?? 0) + (pool.txns.h24.sells ?? 0)
    : null;

  const previewableToken = baseSymbol || baseName ? { ...base, symbol: baseSymbol, name: baseName } : null;

  const isSecondary = (columnId) =>
    isSecondaryColumn(SORT_COLUMNS.find((c) => c.id === columnId), sortColumnId);

  const age = formatAge(pool?.poolCreatedAt, pool?.age);

  return (
    <tr className="table-row">
      <td className="table-cell token-cell text-left">
        <div className="token-info">
          <span className="token-rank">{index + 1}</span>

          {/*
           * Only the All DEXes view shows the DEX mark. With a single DEX
           * selected the venue is already implied by the active filter, so the
           * specific-DEX row keeps its existing single-token-icon presentation.
           */}
          {showDexContext ? <DexIcon dex={pool?.dex} /> : null}

          {previewableToken ? (
            <button
              type="button"
              ref={previewButtonRef}
              onPointerEnter={() => {
                if (!previewableToken.iconUrl) return;
                setHoveredToken(previewableToken);
                setIconHot(true);
              }}
              onPointerLeave={() => setIconHot(false)}
              onFocus={() => {
                if (!previewableToken.iconUrl) return;
                setHoveredToken(previewableToken);
                setIconHot(true);
              }}
              onBlur={() => {
                setIconHot(false);
                setPreviewHot(false);
              }}
              className={`token-icon-button ${previewableToken.iconUrl ? '' : 'cursor-default'}`}
              title={previewableToken.iconUrl ? `Preview ${baseName || baseSymbol}` : undefined}
              aria-label={
                previewableToken.iconUrl
                  ? `${baseName || baseSymbol} icon preview`
                  : `${baseName || baseSymbol} (no image available)`
              }
            >
              <TokenIcon token={previewableToken} />
            </button>
          ) : (
            <TokenIcon token={base} />
          )}

          {dexVersion ? (
            <span className="token-dex-version" title={`${dexLabel ?? 'DEX'} version ${dexVersion}`}>
              {dexVersion}
            </span>
          ) : null}

          <div className="token-details">
            <div className="token-pair-line">
              {baseSymbol ? (
                <span className="token-symbol truncate" title={pairTitle || baseSymbol}>
                  {baseSymbol}
                </span>
              ) : null}

              {baseSymbol && quoteSymbol ? (
                <span className="token-pair-separator" aria-hidden="true">
                  /
                </span>
              ) : null}

              {quoteSymbol ? (
                <span className="token-quote-symbol truncate" title={pairTitle || quoteSymbol}>
                  {quoteSymbol}
                </span>
              ) : null}

              {projectName ? (
                <span className="token-name truncate" title={projectName}>
                  {projectName}
                </span>
              ) : null}

              {!baseSymbol && !quoteSymbol && pairFallback ? (
                <span className="token-symbol truncate" title={pairFallback}>
                  {pairFallback}
                </span>
              ) : null}
            </div>
          </div>

          <div className="token-flags">
            {boosts ? (
              <span
                className="token-boost"
                title={`${boosts} paid DEX Screener boost${boosts === 1 ? '' : 's'}`}
              >
                <Zap className="token-boost-icon" aria-hidden="true" />
                {boosts}
              </span>
            ) : null}
          </div>
        </div>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number compact-number-accent">
          {marketCap === null ? '—' : formatCurrency(marketCap)}
        </span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {formatPriceUsd(pool?.priceUsd) ?? '—'}
        </span>
      </td>

      <td className="table-cell table-cell-center">
        <span className={`compact-number-muted ${age && isRecentPool(pool) ? 'age-recent' : ''}`}>
          {age || '—'}
        </span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">{txns24h === null ? '—' : formatNumber(txns24h)}</span>
      </td>

      <td className="table-cell table-cell-right">
        <span className="compact-number">
          {pool?.volume?.h24 === null || pool?.volume?.h24 === undefined
            ? '—'
            : formatCurrency(pool.volume.h24)}
        </span>
      </td>

      <td className={`table-cell table-cell-right ${isSecondary('traders') ? 'table-cell-col-optional' : ''}`}>
        <span className="compact-number">{formatTraders(pool?.traders)}</span>
      </td>

      <td className={`table-cell table-cell-right ${isSecondary('5m') ? 'table-cell-col-optional' : ''}`}>
        <PriceChangeCell value={pool?.priceChange?.m5} />
      </td>

      <td className="table-cell table-cell-right">
        <PriceChangeCell value={pool?.priceChange?.m1} />
      </td>

      <td className={`table-cell table-cell-right ${isSecondary('6h') ? 'table-cell-col-optional' : ''}`}>
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

      {hoveredToken?.iconUrl && (iconHot || previewHot) ? (
        <TokenImagePreview
          token={hoveredToken}
          anchorRef={previewButtonRef}
          onPointerEnter={() => setPreviewHot(true)}
          onPointerLeave={() => setPreviewHot(false)}
          onClose={() => {
            setIconHot(false);
            setPreviewHot(false);
          }}
        />
      ) : null}
    </tr>
  );
}