/**
 * **アプリが書く collection は、どれも形の表 (`COLLECTION_SHAPES`) に載る。** (2026-10-29 · パス 556)
 *
 * ## なぜ機械が要るか
 *
 * 形の表は復元の関門 (`importableRecordGate` → `hasCollectionShape`) で、**表に無い collection は形を見ずに通る**
 * (`if (!Object.hasOwn(COLLECTION_SHAPES, collection)) return true` —— 落とし過ぎは復元の欠落になるので、
 * 知らない名前は通す設計)。そして形の表を起点に数える台帳 —— 見本 (`collectionSamples`)・往復
 * (`collectionShapesRoundTrip`)・行の上限 (`collectionRowBoundCensus`)・持ち出すと困るかの分類
 * (`plaintextExposureClassification`) —— は、**表に載っていない collection を 1 つも見ない**。
 * パス 556 で `work-assignments` を足したとき、表に載せる前の全件の `npm test` はこの漏れについて
 * 1 件も鳴らなかった (鳴ったのは画面の検査と、数の読み手の台帳だけ)。パス 551 の `mentor-sessions` は
 * 人が覚えていて載せていた。**覚えていることに守りを預けない。**
 *
 * ## 不変条件 (両方向)
 *
 * - 出荷コードの `export const …COLLECTION… = '<名前>'` の名前は、どれも `COLLECTION_SHAPES` の鍵。
 * - `COLLECTION_SHAPES` の鍵は、どれも出荷コードのどこかで定数として名乗られている (表だけに残った名前を作らない)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const SRC = path.resolve(__dirname, '../../..');

/** `export const <名前に COLLECTION を含む> = '<collection 名>'` —— 宣言だけを拾う (使う所は拾わない)。 */
const DECLARATION = /export const ([A-Z][A-Z0-9_]*COLLECTION[A-Z0-9_]*)\s*(?::\s*[A-Za-z<>[\]' |]+)?=\s*'([a-z0-9-]+)'/g;

function declaredIn(source: string): string[] {
  return [...stripComments(source).matchAll(DECLARATION)].map((m) => m[2]!);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

function declaredCollections(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(SRC)) {
    for (const name of declaredIn(readOriginalSource(file))) found.set(name, path.relative(SRC, file));
  }
  return found;
}

describe('アプリが書く collection は、形の表に載る (パス 556)', () => {
  it('★ 針は宣言に当たり、注記の中と使う所は数えない (標本)', () => {
    expect(declaredIn("export const WORK_ASSIGNMENTS_COLLECTION = 'work-assignments';")).toEqual(['work-assignments']);
    expect(declaredIn("export const MEMBERS_COLLECTION: string = 'team-members';")).toEqual(['team-members']);
    expect(declaredIn("// export const OLD_COLLECTION = 'old-one';")).toEqual([]);
    expect(declaredIn("useCollection(WORK_ASSIGNMENTS_COLLECTION); const x = 'work-assignments';")).toEqual([]);
  });

  it('走査は空虚でない (宣言を 20 以上拾う)', () => {
    expect(declaredCollections().size).toBeGreaterThanOrEqual(20);
  });

  it('★ 宣言された collection は、どれも形の表に在る (無ければ復元が形を見ずに通し、形の表を起点に数える台帳が全部その collection を見ない)', () => {
    const missing = [...declaredCollections()].filter(([name]) => !Object.hasOwn(COLLECTION_SHAPES, name)).map(([n, f]) => `${n} (${f})`);
    expect(missing, '形の表 (src/renderer/data/collectionShapes.ts の COLLECTION_SHAPES) に足すこと').toEqual([]);
  });

  it('★ 形の表の鍵は、どれも出荷コードで定数として名乗られている (表だけに残った名前を作らない)', () => {
    const declared = declaredCollections();
    const orphan = Object.keys(COLLECTION_SHAPES).filter((k) => !declared.has(k));
    expect(orphan).toEqual([]);
  });
});
