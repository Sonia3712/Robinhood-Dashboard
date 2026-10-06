import { useEffect, useRef } from 'react';
import {
  BarChart3,
  Bell,
  Code,
  Search as SearchIcon,
  Star,
  TrendingUp,
} from 'lucide-react';
import SearchBar from './SearchBar';

const PLACEHOLDERS = [
  { label: 'Watchlist', icon: Star },
  { label: 'Alerts', icon: Bell },
  { label: 'Multicharts', icon: BarChart3 },
  { label: 'Gainers & Losers', icon: TrendingUp },
  { label: 'API', icon: Code },
];

const NETWORKS = [{ id: 'robinhood', label: 'Robinhood Chain', supported: true }];

export default function Sidebar({
  searchQuery,
  onSearchChange,
  isSearchOpen,
  onSearchOpenChange,
  networkName,
}) {
  const searchWrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const handlePointerDown = (event) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        onSearchOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isSearchOpen, onSearchOpenChange]);

  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-3">
        <h1 className="text-sm font-bold leading-tight text-slate-100">Robinhood DEX</h1>
        <p className="ui-meta text-slate-500">Chain 4663</p>
      </div>

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => onSearchOpenChange(!isSearchOpen)}
          aria-expanded={isSearchOpen}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 ui-label font-medium transition-colors ${
            isSearchOpen || searchQuery
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
          }`}
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          Search
        </button>

        {isSearchOpen && (
          <div ref={searchWrapRef} className="mt-1.5">
            <SearchBar
              ref={inputRef}
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Token or address"
              className="w-full"
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="mt-2 px-2 pb-2">
        <ul className="space-y-0.5">
          {PLACEHOLDERS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  title="Not implemented"
                  className="flex w-full cursor-not-allowed select-none items-center gap-2 rounded-md px-2 py-1.5 ui-label text-slate-600"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-auto px-2 pb-3 pt-2">
        <p className="px-2 py-1 ui-meta font-semibold uppercase tracking-wider text-slate-600">
          Networks
        </p>
        <ul className="space-y-0.5">
          {NETWORKS.map((network) => (
            <li key={network.id}>
              <span
                aria-current={network.supported ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 ui-label ${
                  network.supported
                    ? 'bg-slate-800 text-slate-100'
                    : 'cursor-not-allowed text-slate-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    network.supported ? 'bg-blue-400' : 'bg-slate-700'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{network.label}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-2 ui-meta leading-relaxed text-slate-700">
          {networkName} is the only supported network.
        </p>
      </div>
    </aside>
  );
}
