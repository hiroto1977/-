/**
 * 数値パラメータの上書きの保存と、画面向けの取り出し口。
 *
 * 台帳 (`shared/parameters.ts`) の値を利用者が上書きした分だけを、record store
 * の 1 レコード (`values: { id: number }`) に持つ。**1 レコードを書き換える**
 * (最新 1 件を積み上げる形にしない — 設定を変えるたびに履歴が増える理由が無い)。
 * 読むときは `latestRecord` で選び、壊れた保存は `sanitizeParameterOverrides` が捨てる。
 */
import { useMemo, useRef } from 'react';
import {
  PARAMETER_BY_ID,
  parameterIssue,
  resolveParameters,
  sanitizeParameterOverrides,
  type ParameterId,
  type ParameterOverrides,
  type ParameterValues,
} from '../../shared/parameters';
import { reporting, useCollection } from './useCollection';
import { latestRecord } from './latestRecord';
import { getRecordStore } from './store';

export const PARAMETER_OVERRIDES_COLLECTION = 'parameter-overrides';

export interface ParameterOverrideRecord extends Record<string, unknown> {
  readonly values: Record<string, number>;
}

/** 保存レコードから上書きを組む (最新 1 件・検証済み)。 */
export function overridesFromRecords(
  records: readonly { readonly createdAt: number; readonly data: unknown }[],
): ParameterOverrides {
  const latest = latestRecord(records)?.data;
  return sanitizeParameterOverrides((latest as { values?: unknown } | null | undefined)?.values);
}

export interface UseParameters {
  /** 既定に上書きを重ねた有効値。 */
  readonly values: ParameterValues;
  /** 利用者が置いた値だけ。 */
  readonly overrides: ParameterOverrides;
  readonly loading: boolean;
  set(id: ParameterId, value: number): Promise<void>;
  reset(id: ParameterId): Promise<void>;
  resetAll(): Promise<void>;
}

const noop = (): void => {};

/**
 * 上書きの 1 レコードを書き換える試みの回数 (パス 498)。1 度目で相手が消えていても、
 * 2 度目は読み直した最新 (置換復元が入れた行) に重ねる。それでも消えていれば新しい行として書く。
 */
export const MAX_WRITE_ATTEMPTS = 2;

export function useParameters(): UseParameters {
  const col = useCollection<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION);
  const overrides = useMemo(() => overridesFromRecords(col.records), [col.records]);
  const values = useMemo(() => resolveParameters(overrides), [overrides]);

  /**
   * 書き込みは 1 本の列に並べ、**保存されている値に**変更を重ねる。
   *
   * 描画時の `overrides` に重ねると、2 つの欄を続けて保存したとき 2 つ目が
   * 1 つ目を知らない (再描画前の閉包) — 1 つ目の上書きが消える。record も
   * 読み直さずに `col.records` から選ぶと、1 つ目の書き込みがまだ見えず
   * 2 レコード目を足す。どちらも「最新 1 件を書き換える」を破る。
   */
  // 関数は毎描画で作り直す (useCallback にしない)。依存配列は collection が定数なので
  // 空にしても挙動が変わらず、変異検査で等価な生存になるだけだった。
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mutate = (change: (current: Record<string, number>) => Record<string, number>): Promise<void> => {
    const run = async () => {
      const store = getRecordStore();
      /**
       * **読んでから書くまでの間に、相手の行が消えることが在る** (2026-09-27 · パス 498)。
       *
       * 別のタブのバックアップの置換復元・「すべてのデータを削除」・点検パネルの削除がそれで、
       * `col.edit` はそのとき何も書かずに `false` を返す。直す前はその答えを捨てており、
       * **利用者が保存した値は保管層のどこにも入らないまま**「保存した」形になった
       * (行の印も上書きの件数も変わらず、押せていないのと見分けが付かない)。
       *
       * 読み直して重ね直す —— 置換復元が入れた新しい行が在ればそれに (復元した他の値を残す)、
       * 無ければ新しい行として。**回数に上限を置くのは、相手が消え続けても回り続けないため**で、
       * 使い切ったら新しい行として書く (最新 1 件を読むので、利用者が今保存した値が効く)。
       */
      let next: Record<string, number> = {};
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
        // 読みも報せる (パス 493o) —— ここだけが保管層を直に読むので、`useCollection` の
        // 入口を通らない。通さないと、読めなかった保存は画面に 1 文も出ずに消えた
        // (設定画面の行は失敗を受け止めて黙るので、報せが無いと何も起きないように見える)。
        const latest = latestRecord(
          await reporting('save', PARAMETER_OVERRIDES_COLLECTION, () =>
            store.list<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION),
          ),
        );
        next = change({ ...(sanitizeParameterOverrides(latest?.data.values) as Record<string, number>) });
        if (!latest) break;
        if (await col.edit(latest.id, { values: next })) return;
      }
      await col.add({ values: next });
    };
    const p = queue.current.then(run, run);
    queue.current = p.then(noop, noop);
    return p;
  };

  const set = async (id: ParameterId, value: number): Promise<void> => {
    // 通らない値は保存しない — 保存できても読む側 (`sanitize`) が捨てるので、
    // 画面は既定のまま・記録には別の値、という食い違いになる。
    const issue = parameterIssue(PARAMETER_BY_ID.get(id)!, value);
    if (issue !== null) throw new Error(`${id}: ${issue}`);
    await mutate((current) => ({ ...current, [id]: value }));
  };
  const reset = async (id: ParameterId): Promise<void> => {
    await mutate((current) => {
      delete current[id];
      return current;
    });
  };
  const resetAll = async (): Promise<void> => {
    await mutate(() => ({}));
  };

  return { values, overrides, loading: col.loading, set, reset, resetAll };
}
