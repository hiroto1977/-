/**
 * 保存済みレコードの**中身の形**を点検し、合わない物を消せるようにする —— 抜け出す道。
 *
 * 復元の入口 (`store.importAll`) は 2026-09-05 から collection ごとの形 (`collectionShapes.ts`) を
 * 見るが、それ以前に復元した・古い版が書いたレコードは既に保存されている。形の違うレコードが
 * 1 件あると、その画面は描画で投げて境界 (`PageErrorBoundary`) が受ける —— 画面は開けず、
 * 開けないので画面からは消せない。ここが唯一の出口になる (感情ログの「履歴を消去」と同じ発想)。
 *
 * - 見るのは台帳にある collection だけ (知らない collection は形を知らない = 判定しない)。
 * - 封緘済み (`__enc`) のまま返ってきた中身は**判定しない** —— 鍵が違うだけで中身は正しいかも
 *   しれず、消すと戻らない。
 * - collection の読み出しそのものが失敗したら、その collection は「読めなかった」として数える
 *   (消す対象にはしない)。
 */
import { COLLECTION_SHAPES, hasCollectionShape } from './collectionShapes';
import { isSealedData } from './recordCipher';
import type { RecordStore } from './store';

/** 点検に要る読み出しだけ。実物の `RecordStore.list` はこれを満たす (総称型は制約で具体化される)。 */
export interface ShapeAuditSource {
  list(collection: string): Promise<readonly { readonly id: string; readonly data: Record<string, unknown> }[]>;
}

export interface MalformedRecord {
  readonly id: string;
  readonly collection: string;
}

export interface ShapeAuditResult {
  /** 判定したレコード数 (封緘済みで判定しなかった分は含まない)。 */
  readonly checked: number;
  /** 封緘済みのまま返ってきて判定しなかった数。 */
  readonly skippedSealed: number;
  /** 読み出しに失敗した collection。 */
  readonly unreadable: readonly string[];
  readonly malformed: readonly MalformedRecord[];
}

/** 台帳にある collection を順に読み、形の合わないレコードを集める。 */
export async function auditRecordShapes(store: ShapeAuditSource): Promise<ShapeAuditResult> {
  let checked = 0;
  let skippedSealed = 0;
  const unreadable: string[] = [];
  const malformed: MalformedRecord[] = [];
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    let records: Awaited<ReturnType<ShapeAuditSource['list']>>;
    try {
      records = await store.list(collection);
    } catch {
      unreadable.push(collection);
      continue;
    }
    for (const r of records) {
      if (isSealedData(r.data)) {
        skippedSealed += 1;
        continue;
      }
      checked += 1;
      if (!hasCollectionShape(collection, r.data)) malformed.push({ id: r.id, collection });
    }
  }
  return { checked, skippedSealed, unreadable, malformed };
}

/** collection ごとの件数を「sales-entries 2 件 / kpi-actuals 1 件」の形に。 */
export function summarizeMalformed(malformed: readonly MalformedRecord[]): string {
  const counts = new Map<string, number>();
  for (const m of malformed) counts.set(m.collection, (counts.get(m.collection) ?? 0) + 1);
  return [...counts.entries()].map(([collection, n]) => `${collection} ${n} 件`).join(' / ');
}

/** 指定 id を消す。消せた数を返す (途中で失敗したら投げる —— 半端に消えた数は呼び出し側が再点検で知る)。 */
export async function deleteRecords(store: Pick<RecordStore, 'remove'>, ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    await store.remove(id);
    n += 1;
  }
  return n;
}
