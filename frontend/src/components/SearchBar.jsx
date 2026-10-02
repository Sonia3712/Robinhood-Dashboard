import { Search, X } from 'lucide-react';

export default function SearchBar({
  value = '',
  onChange,
  placeholder = 'Search token name, symbol, or contract address',
  className = '',
}) {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(String(value).trim());

  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="search-input"
          autoComplete="off"
          spellCheck={false}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      {isAddress ? (
        <span className="absolute -bottom-6 left-0 text-xs text-emerald-400 font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" aria-hidden="true" />
          Contract address detected
        </span>
      ) : null}
    </div>
  );
}
