import { CATEGORIES } from '../routes/categories';

/**
 * Horizontal category tabs rendered under the DEX navigation: New Pools,
 * Trending, High Volume. The active tab carries a bottom border (`.tab-active`)
 * so the selection reads at the seam with the table below it.
 */
export default function CategoryNavigation({ activeCategory, onCategoryChange }) {
  return (
    <nav
      aria-label="Pool categories"
      className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/40 px-3"
    >
      {CATEGORIES.map((category) => {
        const isActive = activeCategory === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`tab-button ${isActive ? 'tab-active' : 'tab-inactive'}`}
          >
            {category.label}
          </button>
        );
      })}
    </nav>
  );
}