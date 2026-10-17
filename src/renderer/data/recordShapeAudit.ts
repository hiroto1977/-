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
  /**
   * 全件 (collection 名つき)。**台帳に無い collection の記録**を見つけるのに要る (T-050)。
   * 無ければ `unknown` は空 —— 点検だけの読み手 (検査の代役) は持たなくてよい。
   */
  exportAll?(): Promise<readonly { readonly id: string; readonly collection: string }[]>;
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
  /**
   * **台帳 (`COLLECTION_SHAPES`) に無い collection の記録** (2026-10-15 · パス 522 · threat: T-050)。
   *
   * 復元の入口は collection 名の字だけを見て (将来の版の記録を落とさないため) 中身の形は
   * 台帳に在る collection しか見ない。すると、バックアップに書かれた `zz-not-a-collection` の
   * 記録は入り、**どの画面にも出ず、この点検にも映らず、平文の書き出しの確認にも数えられず、
   * 以後のバックアップすべてに乗り続けた** (実測: 2 MB の blob 1 件を置いた控えを復元すると
   * `auditRecordShapes` は checked 0 / malformed 0 で「ありません」と言い、次の控えは 2 MB 増えた)。
   * 形は判定できないので `malformed` には混ぜず、別の束として出し、削除の対象には含める。
   */
  readonly unknown: readonly MalformedRecord[];
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
  const unknown: MalformedRecord[] = [];
  if (store.exportAll) {
    try {
      for (const r of await store.exportAll()) {
        if (!Object.hasOwn(COLLECTION_SHAPES, r.collection)) unknown.push({ id: r.id, collection: r.collection });
      }
    } catch {
      unreadable.push('(全件の読み出し)');
    }
  }
  return { checked, skippedSealed, unreadable, malformed, unknown };
}

/** collection ごとの件数を「sales-entries 2 件 / kpi-actuals 1 件」の形に。 */
export function summarizeMalformed(malformed: readonly MalformedRecord[]): string {
  const counts = new Map<string, number>();
  for (const m of malformed) counts.set(m.collection, (counts.get(m.collection) ?? 0) + 1);
  return [...counts.entries()].map(([collection, n]) => `${collection} ${n} 件`).join(' / ');
}

/** 削除の結果。**消さなかった件数を必ず返す** —— 呼び出し側が利用者へ本当の数を言えるように。 */
export interface DeleteOutcome {
  /** 実際に消した件数。 */
  readonly deleted: number;
  /** 消さなかった件数 (もう形が合う / もう無い / 判定できない)。 */
  readonly skipped: number;
}

/**
 * 指定 id のうち、**今も形が合わない物だけ**を消す (2026-09-23 · パス 433)。
 *
 * 2026-09-23 まで、この関数は渡された id を無条件に消していた。渡す側 (`RecordShapeAuditPanel`)
 * は**点検した時点の一覧**を持ち続けるので、点検から押すまでの間に中身が変わると
 * **今は形の合う記録を消す**。実測 (直す前):
 *
 * ```
 *   ① 点検      調べた 3 件 / 合わない 2 件 → ボタン「2 件を削除」
 *   ② 復元      良いバックアップをマージ → 同じ id が put で置き換わり、合わない行は 0 件
 *   ③ 押す      確認文「形式の合わないレコード 2 件を削除します。元に戻せません。」
 *              → 復元したばかりの正しい 2 件が消え、「2 件を削除しました。」と報せる
 * ```
 *
 * ★ **確認文が名乗る種別 (`形式の合わないレコード`) と件数が、押した瞬間にはどちらも偽である。**
 *   しかも消えるのは**元に戻せない**。①②③ はどれも設定画面の中で続けて起きる
 *   (点検パネルとバックアップパネルは同じ画面に並ぶ) し、別のタブでも同じことが起きる。
 *
 * ★ **だから数え直しはここでする** —— 呼び出し側が忘れられない所に置く
 *   (法則 `one-subset-per-answer`: 器が「これから起きる事」なら、部分集合は実行が読む関門から取る)。
 *   読み直しは点検と**同じ `auditRecordShapes`** で、封緘済み・読めない collection の扱いも同じになる。
 *
 * 途中で失敗したら投げる —— 半端に消えた数は呼び出し側が再点検で知る。
 */
export async function deleteRecords(
  store: ShapeAuditSource & Pick<RecordStore, 'remove'>,
  ids: readonly string[],
): Promise<DeleteOutcome> {
  const now = await auditRecordShapes(store);
  // 台帳に無い collection の記録も「今もそうである物」だけ消す (T-050)。
  const stillMalformed = new Set([...now.malformed, ...now.unknown].map((m) => m.id));
  let deleted = 0;
  for (const id of ids) {
    if (!stillMalformed.has(id)) continue;
    await store.remove(id);
    deleted += 1;
  }
  return { deleted, skipped: ids.length - deleted };
}

/**
 * 削除の結果の文 —— **消さなかった分は理由つきで言う** (2026-09-23 · パス 433)。
 *
 * `deleteRecords` は「今も形が合わない物」だけを消すので、確認してから消すまでの間に
 * 中身が変わると `deleted` が確認した件数より少なくなる。黙って少なく消すと、利用者は
 * 「消えていない記録がまだ形式不正なのか、消し損ねたのか」を区別できない。
 * 画面の文を関数にしてあるのは、**消した数と消さなかった理由を 1 か所から返す**ため
 * (別々に書くと「少なく消えたのに理由が出ない」形が開く)。
 */
export function deleteResultMessage(outcome: DeleteOutcome): string {
  const kept =
    outcome.skipped > 0
      ? `${outcome.skipped} 件は消す直前に形が合うようになっていたので残しました。`
      : '';
  return `${outcome.deleted} 件を削除しました。${kept}再読み込みで反映されます。`;
}
