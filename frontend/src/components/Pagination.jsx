import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({
  currentPage,
  totalPages,
  hasMore,
  onPageChange,
  disabled = false,
  showTotalPages = true,
}) {
  if (totalPages <= 1 && !hasMore) return null;

  const goPrev = useCallback(() => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);

  const goNext = useCallback(() => {
    if (currentPage < totalPages && hasMore) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, hasMore, onPageChange]);

  const pagesToShow = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
  } else {
    pagesToShow.push(1);
    if (currentPage > 3) pagesToShow.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pagesToShow.push(i);
    if (currentPage < totalPages - 2) pagesToShow.push('...');
    pagesToShow.push(totalPages);
  }

  return (
    <div
      className="flex items-center justify-center gap-1.5 px-3 py-3 border-t border-slate-800 bg-slate-900/50"
      role="navigation"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={currentPage === 1 || disabled}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-800 text-slate-300"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      <div className="flex items-center gap-1" role="group" aria-label="Page numbers">
        {pagesToShow.map((page, index) => (
          <span key={index}>
            {page === '...' ? (
              <span className="px-2 text-slate-500">…</span>
            ) : (
              <button
                type="button"
                onClick={() => !disabled && onPageChange(page)}
                disabled={page === currentPage || disabled}
                className={`inline-flex items-center justify-center min-w-[32px] h-8 rounded-md text-xs font-medium transition-all ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                }`}
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            )}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={goNext}
        disabled={currentPage >= totalPages || !hasMore || disabled}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-800 text-slate-300"
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </button>

      {showTotalPages && totalPages > 1 && (
        <span className="ml-2 text-xs text-slate-500">
          Page {currentPage} of {totalPages}
        </span>
      )}
    </div>
  );
}