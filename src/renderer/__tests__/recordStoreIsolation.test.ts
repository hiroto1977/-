/**
 * **記録ストアを触る検査は、必ず隔離する** (2026-09-12 · パス 170)。
 *
 * ## 隔離しているつもりだった
 *
 * `_resetRecordStoreForTests()` は名前に反して **singleton を捨てるだけ**で、
 * IndexedDB (`business-hub-data`) は残る。`localStorage.clear()` も効かない。
 * だから前の `it()` が UI から足したレコードが**次の `it()` に見える**。
 *
 * 実測 (2026-09-12): `ManualDataSection` を駆動する検査を書いたら **3 本落ちた** ——
 * 「0 件であること」「件数が 2 であること」を見る検査が、前に走った `it()` の
 * 残りを数えていた。単独では通り、並べると落ちる (**逆に、落ちるべき欠陥を
 * 見逃す側にも倒れる**)。パス 169 の固定 `settle` と同じ形で、
 * **隔離しているつもりの仕掛けが実は隔離していない**。
 *
 * ## 母集団は走査で数える
 *
 * 実測: `_resetRecordStoreForTests` を呼ぶ検査 **67 ファイル**、うち
 * **49 は自分で `deleteDatabase` も呼んでいた** (同じ 6 行を 49 回写している) ——
 * **18 は呼んでいなかった**。
 *
 * 「書き込む検査だけ直す」は成り立たない: 書き込みは UI の click から起きるので
 * 静的に数えられない (`.add(` を探すと `container.remove()` に当たる)。
 * だから **呼ぶなら必ず隔離する**にした。空の DB を消す費用は数 ms で、
 * 隔離していない検査が静かに順序へ依存する費用のほうが高い。
 *
 * ## 2 つの症状も記録する
 *
 * - 2 ファイルは `await _resetRecordStoreForTests();` と**同期の void を await**して
 *   いた —— 「後始末の I/O をしてくれる」と読んだ跡である。
 * - 1 ファイルは `data/store` を丸ごと `vi.mock` しており、`fake-indexeddb` も
 *   入れていない。DB を消そうとすると `indexedDB is not defined` で落ちる ——
 *   **消す物が無い**ので台帳の免除に入れた (理由つき)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const SRC = path.resolve(__dirname, '../..');

/** この検査ファイル自身 (下の対照が印を文字列として持つので母集団から外す)。 */
const SELF = path.basename(__filename);

function testFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/** 記録ストアの singleton を捨てている (= 記録ストアを触る検査)。 */
function touchesRecordStore(src: string): boolean {
  return /_resetRecordStoreForTests\s*\(|\bresetRecordStore\s*\(/.test(src);
}

/** 本当に隔離している (共有 helper か、自前の deleteDatabase)。 */
function isolates(src: string): boolean {
  return /\bresetRecordStore\s*\(/.test(src) || /deleteDatabase\s*\(/.test(src);
}

/** 隔離しなくてよいファイルと、その理由 (`src` からの相対)。 */
const NOT_ISOLATED_ALLOWED: Readonly<Record<string, string>> = {
  'renderer/__tests__/appDeviceStoreFailure.test.ts':
    '`data/store` を丸ごと vi.mock しており、本物の IndexedDB を開かない (fake-indexeddb も入れていない)。DB を消そうとすると indexedDB is not defined で落ちる —— 消す物が無い',
};

describe('記録ストアを触る検査は隔離する (母集団は走査で数える · パス 170)', () => {
  const files = testFiles().filter((f) => path.basename(f) !== SELF);
  const touching = files.filter((f) => touchesRecordStore(readOriginalSource(f)));
  const notIsolated = touching
    .filter((f) => !isolates(readOriginalSource(f)))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'));

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(files.length, '検査ファイルが集まっていない').toBeGreaterThanOrEqual(500);
    expect(touching.length, '記録ストアを触る検査が見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(50);
  });

  it('★ 隔離していない検査は、理由つきの台帳の物だけ', () => {
    expect(
      notIsolated.filter((f) => !(f in NOT_ISOLATED_ALLOWED)),
      '隔離していない検査 —— `resetRecordStore()` を使うか、使えない理由を台帳に書く',
    ).toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (隔離済みになった行が残っていない)', () => {
    expect(
      Object.keys(NOT_ISOLATED_ALLOWED).filter((f) => !notIsolated.includes(f)),
      '台帳の古い行',
    ).toEqual([]);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const [f, why] of Object.entries(NOT_ISOLATED_ALLOWED)) {
      expect(why.length, `${f}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 共有 helper は singleton と DB の両方を落とす', () => {
    const src = readOriginalSource(path.join(SRC, 'renderer/__tests__/recordStoreHarness.ts'));
    expect(src, 'singleton を捨てていない').toContain('_resetRecordStoreForTests()');
    expect(src, 'DB を消していない').toContain('deleteDatabase');
    // 順序が要る (生きた singleton が握った接続で blocked になりうる)。
    expect(
      src.indexOf('_resetRecordStoreForTests()'),
      'DB を消してから singleton を捨てている',
    ).toBeLessThan(src.lastIndexOf('deleteRecordDb'));
  });

  it('★ 対照: 印が 2 つの形を取り違えない', () => {
    const weak = 'beforeEach(() => {\n  _resetRecordStoreForTests();\n});';
    const strongShared = 'beforeEach(async () => {\n  await resetRecordStore();\n});';
    const strongHand = '_resetRecordStoreForTests();\nindexedDB.deleteDatabase("business-hub-data");';
    expect(touchesRecordStore(weak), '弱い形を掴めていない').toBe(true);
    expect(isolates(weak), '弱い形を隔離済みとして通している').toBe(false);
    expect(touchesRecordStore(strongShared)).toBe(true);
    expect(isolates(strongShared), '共有 helper を隔離と見ていない').toBe(true);
    expect(isolates(strongHand), '自前の deleteDatabase を隔離と見ていない').toBe(true);
    // 記録ストアに触らない検査は母集団の外。
    expect(touchesRecordStore('const x = 1;')).toBe(false);
  });
});
