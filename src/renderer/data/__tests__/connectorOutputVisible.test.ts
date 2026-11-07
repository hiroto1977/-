/**
 * **押した結果が、押した所から見えて消せるか** (2026-09-24 · パス 448)。
 *
 * `connector-output` を購読する画面は 1 つも無かった (走査で確認)。実行できる
 * 無料コネクタは 10 件で、行き先が**ちょうど半分ずつ**に割れている:
 *
 * | 行き先 | 件数 | 直す前: 画面に出るか | 消せるか |
 * | --- | ---: | --- | --- |
 * | `library` | **5** | ライブラリ画面に出る | 「削除」が在る |
 * | `storage` | **5** | **出ない** | **「すべてのデータを削除」だけ** |
 *
 * 同じパネルの同じボタンで行き先だけが違い、**どちらも「記録しました」と告げる**。
 * 点検パネルにも出ない —— 形は合っているので (実測: 3 件押して「調べた 3 件 /
 * 形式不正 0 件」)。法則 `escape-hatch-stays-open`。
 *
 * ここが留めるもの: ① 行き先の割れ方を**registry から導いて**数える (6 件目の
 * storage コネクタが足された日も母集団が伸びる) ② 読み口は**読めない行を落とさない**
 * (落とすとまた消せなくなる) ③ id は必ず返る (消すのに要る唯一の鍵)。
 */
import { describe, expect, it } from 'vitest';
import { FREE_CONNECTORS } from '../../../shared/connectors/freeConnectors';
import { connectorOutputRows, targetKind, CONNECTOR_OUTPUT_COLLECTION } from '../connectorExecution';
import { COLLECTION_SHAPES } from '../collectionShapes';

const free = FREE_CONNECTORS as readonly {
  id: string;
  targetService: string;
  requiresAuth?: boolean;
}[];

/** 実行できる (認証の要らない) コネクタを行き先で分ける —— registry から導く。 */
function runnableByKind(): { storage: string[]; library: string[] } {
  const out = { storage: [] as string[], library: [] as string[] };
  for (const c of free) {
    if (c.requiresAuth === true) continue;
    const k = targetKind(c.targetService);
    if (k === 'storage') out.storage.push(c.id);
    if (k === 'library') out.library.push(c.id);
  }
  return out;
}

describe('ストレージへ書いたコネクタの出力 — 母集団 (パス 448)', () => {
  it('★ 実行できるコネクタは storage と library の両方へ行く (走査が空虚でない)', () => {
    const { storage, library } = runnableByKind();
    expect(storage.length, 'storage へ行くコネクタが無い').toBeGreaterThanOrEqual(1);
    expect(library.length, 'library へ行くコネクタが無い').toBeGreaterThanOrEqual(1);
    // 直す前は storage 側だけが face を持たなかった。片方しか無い registry では
    // その非対称が起こりえないので、両方在ることが前提として要る。
    expect(storage.length + library.length).toBe(
      free.filter((c) => c.requiresAuth !== true).length,
    );
  });

  it('★ storage の行き先は形の表に在る 1 つの collection', () => {
    expect(COLLECTION_SHAPES[CONNECTOR_OUTPUT_COLLECTION], '形の表に無い').toBeDefined();
  });
});

describe('ストレージへ書いたコネクタの出力 — 読み口 (パス 448)', () => {
  it('★ 揃った行は綴りをそのまま返し、id も返す', () => {
    const rows = connectorOutputRows([
      { id: 'r1', data: { connectorId: 'stocks-to-storage-export', key: '7203', payload: {} } },
    ]);
    expect(rows).toEqual([{ id: 'r1', connectorId: 'stocks-to-storage-export', key: '7203' }]);
  });

  it('★ 欄が読めなくても行は落とさない —— id は必ず返る (消すのに要る)', () => {
    for (const bad of [42, null, undefined, {}, [], true] as const) {
      const rows = connectorOutputRows([
        { id: 'r2', data: { connectorId: bad as unknown, key: bad as unknown } },
      ]);
      expect(rows, `壊れ方 ${String(bad)} で行が消えた`).toHaveLength(1);
      expect(rows[0]!.id, '消すのに要る id が落ちた').toBe('r2');
      expect(rows[0]!.connectorId).toBe('(読めません)');
      expect(rows[0]!.key).toBe('(読めません)');
    }
  });

  it('★ 件数は入力の件数と一致する (黙って絞らない)', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i}`,
      data: { connectorId: 'x', key: String(i) },
    }));
    expect(connectorOutputRows(many)).toHaveLength(7);
  });

  it('★ 空なら空', () => {
    expect(connectorOutputRows([])).toEqual([]);
  });
});
