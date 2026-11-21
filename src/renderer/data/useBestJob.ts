/**
 * ベストアンサー 3 の仕事場を React から読む口。仕事場はモジュールの中に在るので、
 * 画面が付け外しされても状態は残る —— ここは購読するだけ (`useSyncExternalStore`)。
 */
import { useSyncExternalStore } from 'react';
import { getBestJob, subscribeBestJob, type BestJob } from './bestAnswersJob';

export function useBestJob(): BestJob | null {
  return useSyncExternalStore(subscribeBestJob, getBestJob, getBestJob);
}
