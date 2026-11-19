import { useMemo } from 'react';
import { useCollection } from './useCollection';
import type { StoredRecord } from './store';
import {
  HYDROPONIC_CROPS_COLLECTION,
  cropListFromRecords,
  type HydroponicCropListRecord,
} from './hydroponicsSetup';
import type { HydroponicCrop } from '../../shared/hydroponics';
import type { CropListChange } from '../../shared/hydroponicCrops';

/**
 * 水耕栽培の品目の一覧を読み、変える口 (2026-11-19)。
 *
 * 一覧を増減できる画面は 2 つ在る (経営サマリーの試算の欄・水耕栽培の運転管理のロットの欄)。
 * 2 つとも**同じ 1 つの記録**を読み書きするので、読み方と書き方をここに 1 つだけ置く ——
 * 画面ごとに書くと、片方だけが古い書き方 (画面の写しに当てて丸ごと書く) へ戻りうる。
 */

/** 品目の一覧の変更の結果。**当てた一覧** (`before`) も返す —— 消した品目の名前はそこから引く。 */
export type CropChangeOutcome = CropListChange & { readonly before: readonly HydroponicCrop[] };

/**
 * 品目の一覧を変える —— `change` を**保管層の今の最新**に当て、断られなければ保存する
 * (パス 497 / 500)。読めなければ `null`・別の保存と重なり続けたら `'busy'`。
 */
export type ChangeCrops = (
  change: (current: readonly HydroponicCrop[]) => CropListChange,
) => Promise<CropChangeOutcome | 'busy' | null>;

export interface CropList {
  /** 今の品目の一覧 (購読の写し —— 表示に使う。変更はこれに当てない)。 */
  readonly crops: readonly HydroponicCrop[];
  /** 一覧が保管層から届く前か。届く前の一覧は参考値の品目である。 */
  readonly loading: boolean;
  readonly changeCrops: ChangeCrops;
}

export function useCropList(): CropList {
  const cropCol = useCollection<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
  const crops = useMemo(() => cropListFromRecords(cropCol.records), [cropCol.records]);
  /*
   * 品目の一覧の変更は**今の最新**に当てる (パス 497)。一覧は「最新の 1 件を採用する」ので、
   * 写し (`crops`) に当てて丸ごと書くと、別のタブで足した品目を知らないまま上書きして消す。
   * パス 497 は読み直してから素の `add` で書いており、**読み直しと書き込みの間**に入った変更は
   * まだ消えた —— 今は比べて足すまでが 1 つの取引 (`applyToLatest`・パス 500)。挟まれたら当て直す。
   * 断られたときは写しも読み直す (断った理由の品目が画面に見えるように —— `applyToLatest` が読み直す)。
   */
  const changeCrops: ChangeCrops = async (change) => {
    // 当て直すと `change` は 2 度呼ばれうる —— 答えるのは最後に当てた一覧の結果。
    const last: { outcome?: CropChangeOutcome } = {};
    const step = (current: StoredRecord<HydroponicCropListRecord> | null): HydroponicCropListRecord | null => {
      const before = cropListFromRecords(current === null ? [] : [current]);
      const res = change(before);
      last.outcome = { ...res, before };
      return res.ok ? { crops: res.crops } : null;
    };
    const r = await cropCol.applyToLatest(step);
    if (r.status === 'unreadable') return null;
    if (r.status === 'busy') return 'busy';
    return last.outcome!;
  };
  return { crops, loading: cropCol.loading, changeCrops };
}
