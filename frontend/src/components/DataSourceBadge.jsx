// Data source attribution badge - dark theme
export default function DataSourceBadge({ source = 'geckoterminal' }) {
  const sources = {
    geckoterminal: {
      name: 'GeckoTerminal',
      color: 'bg-green-900/50 text-green-400',
      url: 'https://www.geckoterminal.com/',
    },
    dexscreener: {
      name: 'DEX Screener',
      color: 'bg-purple-900/50 text-purple-400',
      url: 'https://dexscreener.com/',
    },
    rpc: { name: 'Robinhood Chain RPC', color: 'bg-orange-900/50 text-orange-400', url: null },
    mixed: { name: 'GeckoTerminal + DEX Screener', color: 'bg-slate-800 text-slate-400', url: null },
  };

  const current = sources[source] || sources.mixed;

  return (
    <div className="data-source-badge">
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${current.color}`}>
        Data: {current.name}
        {current.url ? (
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline ml-1"
          >
            →
          </a>
        ) : null}
      </span>
      <span className="ml-2 text-slate-500">• Read-only • Auto-refresh (polling)</span>
    </div>
  );
}
