import { useCallback, useState } from 'react';
import { DEFAULT_SORT, getNextSort } from '../utils/sort';

export function useSort() {
  const [sort, setSort] = useState(DEFAULT_SORT);

  const toggleSort = useCallback((columnId) => {
    setSort((current) => getNextSort(current, columnId));
  }, []);

  return { sort, toggleSort };
}
