import { useCallback, useMemo, useState } from 'react';
import { nextShown, ROW_WINDOW_STEP, windowRows, type RowWindow } from './rowWindow';

/** 一覧の窓 (`rowWindow.ts`)。`showMore` は残りが在るときだけ意味を持つ。 */
export function useRowWindow<T>(rows: readonly T[]): RowWindow<T> & { showMore: () => void } {
  const [shown, setShown] = useState(ROW_WINDOW_STEP);
  const win = useMemo(() => windowRows(rows, shown), [rows, shown]);
  const showMore = useCallback(() => setShown((s) => nextShown(s)), []);
  return { ...win, showMore };
}
