import { useEffect, useRef } from 'react';

export default function InfiniteScroll({
  hasMore,
  isFetching,
  isWaiting,
  onLoadMore,
  rootMargin = '400px',
}) {
  const sentinelRef = useRef(null);
  const handlerRef = useRef(onLoadMore);
  const isIntersectingRef = useRef(false);

  useEffect(() => {
    handlerRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!isFetching || !hasMore) isIntersectingRef.current = false;
  }, [isFetching, hasMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);

        // React-query dedupes page requests by key, but the sentinel must not
        // re-fire `loadMore` while the same intersection is still in view.
        if (isIntersecting === isIntersectingRef.current) return;
        isIntersectingRef.current = isIntersecting;

        if (!isIntersecting || isFetching) return;
        handlerRef.current?.();
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isFetching, rootMargin]);

  if (!hasMore && !isWaiting) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center py-4" role="status">
      {isWaiting ? (
        <span className="text-xs text-amber-400/90">Rate limited — retrying…</span>
      ) : isFetching ? (
        <span className="text-xs text-slate-500">Loading more pools…</span>
      ) : (
        <span className="text-xs text-slate-600">Scroll for more</span>
      )}
    </div>
  );
}
