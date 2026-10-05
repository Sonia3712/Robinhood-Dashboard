import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

const MIN_VISIBLE_DEXES = 1;
const MAX_VISIBLE_DEXES = 5;
const MENU_WIDTH = 208;
const CHIP_GAP = 6;
const VIEWPORT_MARGIN = 8;

// Above the sticky table header (z-10) and the token preview overlay (z-50).
const MENU_Z = 70;

const MENU_ITEM_HEIGHT = 30;
const MENU_PADDING = 8;
const MENU_MAX_HEIGHT = 288;
const MENU_OFFSET = 4;
const ALL_DEXES_BUTTON = 'All DEXes';
const MORE_BUTTON = 'More';

/**
 * Decides how many DEX chips fit inline. Overflow is measured with the real
 * rendered widths, so the `More` button is always pushed into `overflow` and
 * stays visible instead of being clipped or causing page-level scrolling.
 */
function useVisibleCount(dexes, navRef) {
  const [count, setCount] = useState(Math.min(MAX_VISIBLE_DEXES, dexes.length));
  const measureRef = useRef(null);

  const measure = useCallback(() => {
    const nav = navRef.current;
    const ruler = measureRef.current;
    if (!nav || !ruler) return;

    const styles = window.getComputedStyle(nav);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const available = nav.clientWidth - paddingX;
    if (available <= 0) return;

    const widthOf = (selector) => {
      const node = ruler.querySelector(`[${selector}]`);
      return node ? node.getBoundingClientRect().width : 0;
    };

    const allWidth = widthOf('data-all-width');
    const moreWidth = widthOf('data-more-width');
    if (allWidth <= 0) return;

    const chipWidths = [...ruler.querySelectorAll('[data-dex-chip]')].map(
      (node) => node.getBoundingClientRect().width,
    );

    let used = allWidth;
    let visible = 0;

    for (const width of chipWidths) {
      const next = used + CHIP_GAP + width;
      if (next > available) break;
      used = next;
      visible += 1;
    }

    // The `More` button is reserved before the last chip, so it can never be
    // pushed out of the bar by a chip that only just fits.
    const roomForMore = available - used - CHIP_GAP;
    const keepsMoreVisible = moreWidth <= roomForMore + (chipWidths[visible] ?? 0) + CHIP_GAP;

    const limited = visible > MAX_VISIBLE_DEXES ? MAX_VISIBLE_DEXES : visible;
    setCount(Math.max(MIN_VISIBLE_DEXES, keepsMoreVisible ? limited : Math.max(MIN_VISIBLE_DEXES, visible - 1)));
  }, [navRef, dexes]);

  useLayoutEffect(() => {
    measure();

    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => measure());
    observer.observe(nav);
    return () => observer.disconnect();
  }, [measure, dexes]);

  return { count, measureRef };
}

export default function DexNavigation({ dexes = [], selectedDex, onSelect }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const moreRef = useRef(null);
  const navRef = useRef(null);
  const menuRef = useRef(null);

  const { count: visibleCount, measureRef } = useVisibleCount(dexes, navRef);

  const visible = useMemo(() => dexes.slice(0, visibleCount), [dexes, visibleCount]);
  const overflow = useMemo(() => dexes.slice(visibleCount), [dexes, visibleCount]);

  const reposition = useCallback(() => {
    const button = moreRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuHeight = Math.min(overflow.length * MENU_ITEM_HEIGHT + MENU_PADDING, MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + MENU_OFFSET;
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - MENU_OFFSET;
    }

    // Keep the menu fully on screen even if the button sits at the very edge.
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN);
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop);

    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft);

    setMenuPosition({ top, left });
  }, [overflow.length]);

  const openMenu = useCallback(() => {
    reposition();
    setIsMoreOpen(true);
  }, [reposition]);

  useEffect(() => {
    if (!isMoreOpen) {
      setMenuPosition(null);
      return undefined;
    }

    reposition();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (moreRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsMoreOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMoreOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isMoreOpen, reposition]);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [selectedDex]);

  const chipClass = (isActive) =>
    `shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
    }`;

  const chip = (dex) => {
    const id = dex.id;
    const isActive = selectedDex === id;
    return (
      <button
        key={id}
        type="button"
        data-dex-chip={id}
        onClick={() => onSelect(id)}
        aria-pressed={isActive}
        title={`${dex.name} · ${dex.poolCount} pools`}
        className={chipClass(isActive)}
      >
        {dex.name}
      </button>
    );
  };

  const moreButton = (
    <button
      type="button"
      ref={moreRef}
      onClick={() => (isMoreOpen ? setIsMoreOpen(false) : openMenu())}
      aria-expanded={isMoreOpen}
      aria-haspopup="true"
      data-more-button="true"
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        overflow.some((dex) => dex.id === selectedDex)
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
      }`}
    >
      {MORE_BUTTON}
      <ChevronDown
        className={`h-3 w-3 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  );

  // Rendered off-screen (not display:none) so the widths used to fit the chips
  // are the widths they will actually occupy in the bar.
  const measureBar = (
    <div
      ref={measureRef}
      aria-hidden="true"
      className="pointer-events-none invisible absolute top-0 left-0 flex items-center overflow-hidden"
      style={{ gap: `${CHIP_GAP}px`, height: 0, width: 'max-content' }}
    >
      <span data-all-width="true" className={`${chipClass(false)} shrink-0 whitespace-nowrap`}>
        {ALL_DEXES_BUTTON}
      </span>
      {dexes.map(chip)}
      <span data-more-width="true" className={`${chipClass(false)} shrink-0 whitespace-nowrap`}>
        {MORE_BUTTON}
      </span>
    </div>
  );

  return (
    <div className="relative min-w-0 shrink overflow-hidden">
      {measureBar}

      <nav
        ref={navRef}
        aria-label="Filter by DEX"
        className="relative flex items-center gap-1.5 overflow-hidden border-b border-slate-800 bg-slate-900/40 px-3 py-2"
      >
        <button
          type="button"
          onClick={() => onSelect('all')}
          aria-pressed={selectedDex === 'all'}
          className={chipClass(selectedDex === 'all')}
        >
          {ALL_DEXES_BUTTON}
        </button>

        {visible.map(chip)}

        {overflow.length > 0 ? moreButton : null}
      </nav>

      {isMoreOpen && overflow.length > 0 && menuPosition
        ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="More DEXes"
            style={{
              position: 'fixed',
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${MENU_WIDTH}px`,
              zIndex: MENU_Z,
            }}
            className="max-h-72 overflow-y-auto overscroll-contain rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl"
          >
            {overflow.map((dex) => {
              const id = dex.id;
              const isActive = selectedDex === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(id);
                    setIsMoreOpen(false);
                  }}
                  aria-pressed={isActive}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                  }`}
                >
                  <span className="truncate">{dex.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums opacity-60">
                    {dex.poolCount}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
