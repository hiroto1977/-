import { describe, expect, it, vi } from 'vitest';
import {
  isValidLadderMember,
  isValidProbability,
  sanitizeInitiatives,
  sanitizeReports,
  sanitizeTalentState,
  EMPTY_TALENT_STATE,
} from '../talent';

/**
 * **IPC 境界の検査を、`src/shared/` から直接 import して置く。**
 *
 * ## なぜ「置き場所」が問題なのか (2026-08-29 実測)
 *
 * 同じ判定の検査は既に `src/main/clients/__tests__/talent.test.ts` に在り、
 * **論理としては正しく効いている** —— 手で変異を当てると 4 件落ちる:
 *
 * ```
 *   L335 の条件を false に置換 → ★ 先頭は英数字 / ★ 64 文字まで /
 *                                使える字は… / 不正なメンバーは落とす  が失敗
 * ```
 *
 * ところが**変異検査はこの行を「生存」と報告していた** (全 245 件の完全走査で)。
 * 原因は `--mutate` の絞り込みではない (今回は絞っていない)。
 * あちらの検査は `../talent` = `src/main/clients/talent.ts` を import しており、
 * それは **`export * from '../../shared/talent'` の再輸出**である。
 * Stryker の perTest 被覆は、**再輸出を経由して届く検査を元のモジュールの
 * 変異体へ帰属させない**。
 *
 * 裏付け: 同じ `shared/talent.ts` でも、`src/shared/__tests__/` から直接
 * import している `talentTables.test.ts` の分は**ちゃんと殺せている**
 * (定義表を足したとき 66.95% → 83.62% と動いた)。**帰属されるかどうかは
 * 検査の置き場所と import の経路で決まる。**
 *
 * だからここは **`../talent` (= `src/shared/talent.ts`) を直接 import する**。
 * 検査の内容ではなく、**届き方**を直すためのファイルである。
 *
 * ## 何を守っているか
 *
 * ここは乗っ取られたレンダラーから来る payload の入口である。
 * 上限と形の検査が外れても画面は普通に動くので、**検査でしか気付けない**。
 */

describe('メンバーの形 — 直接 import して帰属させる', () => {
  const member = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    name: '山田',
    step: 1,
    yearsInStep: 0,
    ...over,
  });

  it('★ 正しい形は通る (対照: 何でも落とす実装になっていない)', () => {
    expect(isValidLadderMember(member())).toBe(true);
  });

  it('★ id は先頭が英数字で 64 文字まで、小文字英数字とハイフンのみ', () => {
    expect(isValidLadderMember(member({ id: '1m' }))).toBe(true);
    expect(isValidLadderMember(member({ id: 'm-1' }))).toBe(true);
    expect(isValidLadderMember(member({ id: 'a'.repeat(64) })), '64 は通す').toBe(true);
    expect(isValidLadderMember(member({ id: '-m1' })), '先頭のハイフン').toBe(false);
    expect(isValidLadderMember(member({ id: 'a'.repeat(65) })), '65 文字').toBe(false);
    expect(isValidLadderMember(member({ id: 'M1' })), '大文字').toBe(false);
    expect(isValidLadderMember(member({ id: 'm_1' })), 'アンダースコア').toBe(false);
    expect(isValidLadderMember(member({ id: '' })), '空文字').toBe(false);
    expect(isValidLadderMember(member({ id: 'm1\n' })), '末尾の改行 ($ の緩みを見る)').toBe(false);
    expect(isValidLadderMember(member({ id: 123 })), '文字列でない').toBe(false);
  });

  it('★ name は 1〜64 文字の文字列', () => {
    expect(isValidLadderMember(member({ name: 'あ'.repeat(64) })), '64 は通す').toBe(true);
    expect(isValidLadderMember(member({ name: 'あ'.repeat(65) })), '65 は落とす').toBe(false);
    expect(isValidLadderMember(member({ name: '' }))).toBe(false);
    expect(isValidLadderMember(member({ name: 1 }))).toBe(false);
  });

  it('★ step は 1〜4 の整数', () => {
    expect(isValidLadderMember(member({ step: 4 })), '4 は通す').toBe(true);
    expect(isValidLadderMember(member({ step: 0 }))).toBe(false);
    expect(isValidLadderMember(member({ step: 5 }))).toBe(false);
    expect(isValidLadderMember(member({ step: 1.5 })), '整数でない').toBe(false);
    expect(isValidLadderMember(member({ step: '1' }))).toBe(false);
  });

  /*
   * 在籍年数は **0〜60 の有限数**。上限も下限も外すと、画面の並び順と
   * 「滞留」の判定が壊れる。`Number.isFinite` は NaN / Infinity を弾く枠で、
   * ここが抜けると `NaN` が保存されて以後ずっと比較が false になる。
   */
  it('★ yearsInStep は 0〜60 の有限数 (NaN / Infinity を通さない)', () => {
    expect(isValidLadderMember(member({ yearsInStep: 60 })), '60 は通す').toBe(true);
    expect(isValidLadderMember(member({ yearsInStep: 61 }))).toBe(false);
    expect(isValidLadderMember(member({ yearsInStep: -1 }))).toBe(false);
    expect(isValidLadderMember(member({ yearsInStep: Number.NaN })), 'NaN').toBe(false);
    expect(isValidLadderMember(member({ yearsInStep: Infinity })), 'Infinity').toBe(false);
    expect(isValidLadderMember(member({ yearsInStep: '3' }))).toBe(false);
  });

  it('★ オブジェクトでない物は落とす', () => {
    expect(isValidLadderMember(null)).toBe(false);
    expect(isValidLadderMember(undefined)).toBe(false);
    expect(isValidLadderMember('m1')).toBe(false);
    expect(isValidLadderMember(42)).toBe(false);
  });
});

describe('達成確率 — 0〜100 の有限数', () => {
  it('★ 境界を両側から見る', () => {
    expect(isValidProbability(0)).toBe(true);
    expect(isValidProbability(100)).toBe(true);
    expect(isValidProbability(-0.1)).toBe(false);
    expect(isValidProbability(100.1)).toBe(false);
    expect(isValidProbability(Number.NaN)).toBe(false);
    expect(isValidProbability(Infinity)).toBe(false);
    expect(isValidProbability('50')).toBe(false);
    expect(isValidProbability(null)).toBe(false);
  });
});

describe('施策の正規化 — 上限と形', () => {
  const ini = (over: Record<string, unknown> = {}) => ({ name: '施策', probability: 50, ...over });

  it('★ 正しい形は残る (対照)', () => {
    expect(sanitizeInitiatives([ini()])).toEqual([{ name: '施策', probability: 50 }]);
  });

  it('★ 名前は 1〜128 文字', () => {
    expect(sanitizeInitiatives([ini({ name: 'あ'.repeat(128) })]), '128 は通す').toHaveLength(1);
    expect(sanitizeInitiatives([ini({ name: 'あ'.repeat(129) })]), '129 は落とす').toHaveLength(0);
    expect(sanitizeInitiatives([ini({ name: '' })])).toHaveLength(0);
    expect(sanitizeInitiatives([ini({ name: 1 })])).toHaveLength(0);
  });

  it('★ 確率が不正なら落とす', () => {
    expect(sanitizeInitiatives([ini({ probability: 101 })])).toHaveLength(0);
    expect(sanitizeInitiatives([ini({ probability: Number.NaN })])).toHaveLength(0);
    expect(sanitizeInitiatives([ini({ probability: '50' })])).toHaveLength(0);
  });

  it('★ 要素がオブジェクトでなければ飛ばす (配列ごと壊さない)', () => {
    expect(sanitizeInitiatives([null, 'x', 42, ini()])).toHaveLength(1);
  });

  it('★ 配列でなければ空配列', () => {
    for (const v of [null, undefined, 'x', 42, {}]) expect(sanitizeInitiatives(v)).toEqual([]);
  });

  it('★ 件数の上限で切る', () => {
    const many = Array.from({ length: 250 }, (_, i) => ini({ name: `施策${i}` }));
    expect(sanitizeInitiatives(many).length).toBeLessThanOrEqual(200);
  });
});

describe('部署申告の正規化 — 上限と形', () => {
  const rep = (over: Record<string, unknown> = {}) => ({ department: '営業', diseases: [], ...over });

  it('★ 正しい形は残る (対照)', () => {
    expect(sanitizeReports([rep()])).toHaveLength(1);
  });

  it('★ 部署名は 1〜64 文字', () => {
    expect(sanitizeReports([rep({ department: 'あ'.repeat(64) })]), '64 は通す').toHaveLength(1);
    expect(sanitizeReports([rep({ department: 'あ'.repeat(65) })]), '65 は落とす').toHaveLength(0);
    expect(sanitizeReports([rep({ department: '' })])).toHaveLength(0);
    expect(sanitizeReports([rep({ department: 1 })])).toHaveLength(0);
  });

  it('★ 要素がオブジェクトでなければ飛ばす', () => {
    expect(sanitizeReports([null, 'x', 42, rep()])).toHaveLength(1);
  });

  it('★ 知らない病の id は落とす (許可制)', () => {
    const out = sanitizeReports([rep({ diseases: ['imprint', 'unknown-disease', 42] })]);
    expect(out[0]?.diseases).toEqual(['imprint']);
  });

  it('★ 配列でなければ空配列', () => {
    for (const v of [null, undefined, 'x', 42, {}]) expect(sanitizeReports(v)).toEqual([]);
  });
});

describe('状態全体の正規化 — 根の番人', () => {
  it('★ オブジェクトでなければ空の状態', () => {
    for (const v of [null, undefined, 'x', 42, true]) {
      expect(sanitizeTalentState(v)).toEqual(EMPTY_TALENT_STATE);
    }
  });

  it('★ 配列は object だが、中身が無いので空の状態に落ちる', () => {
    expect(sanitizeTalentState([]).reports).toEqual([]);
    expect(sanitizeTalentState([]).initiatives).toEqual([]);
  });

  it('★ updatedAt は 32 文字で切る', () => {
    const s = sanitizeTalentState({ updatedAt: 'x'.repeat(100) });
    expect(s.updatedAt.length).toBe(32);
  });

  it('★ updatedAt が文字列でなければ空文字', () => {
    expect(sanitizeTalentState({ updatedAt: 42 }).updatedAt).toBe('');
    expect(sanitizeTalentState({}).updatedAt).toBe('');
  });

  it('★ 正しい状態はそのまま通る (対照)', () => {
    const s = sanitizeTalentState({
      reports: [{ department: '営業', diseases: ['imprint'] }],
      initiatives: [{ name: '施策', probability: 50 }],
      updatedAt: '2026-08-29',
    });
    expect(s.reports).toHaveLength(1);
    expect(s.initiatives).toHaveLength(1);
    expect(s.updatedAt).toBe('2026-08-29');
  });
});

/**
 * **モジュール直下の定数は、読み直さないと変異体が届かない。**
 *
 * `MEMBER_ID_RE` は `const … = /^[a-z0-9][a-z0-9-]{0,63}$/` で、
 * **読み込み時に 1 度だけ評価される**。静的 import のままだと、
 * Stryker が変異を有効にする前に既に評価が済んでいるので、
 * 正規表現への変異は**どれも届かない** (実測: 5 件すべて生存)。
 *
 * `stryker.config.json` と SESSION_HANDOFF が言う「覆われた static 変異体」で、
 * 同じ形を `ORGAN_DISEASES` で既に踏んでいる。`vi.resetModules()` +
 * 動的 `import()` で毎回読み直す。
 */
describe('MEMBER_ID_RE — 読み直して static 変異体を届かせる', () => {
  async function fresh() {
    vi.resetModules();
    return await import('../talent');
  }

  const m = (id: string) => ({ id, name: '山田', step: 1, yearsInStep: 0 });

  it('★ 先頭の錨 (^) が効いている', async () => {
    const t = await fresh();
    expect(t.isValidLadderMember(m('-abc'))).toBe(false);
    expect(t.isValidLadderMember(m('_abc'))).toBe(false);
  });

  it('★ 末尾の錨 ($) が効いている', async () => {
    const t = await fresh();
    expect(t.isValidLadderMember(m('abc\n'))).toBe(false);
    expect(t.isValidLadderMember(m('abc!'))).toBe(false);
  });

  it('★ 先頭の字は英数字に限る (否定クラスへの反転を捕まえる)', async () => {
    const t = await fresh();
    expect(t.isValidLadderMember(m('a1'))).toBe(true);
    expect(t.isValidLadderMember(m('9z'))).toBe(true);
  });

  it('★ 2 文字目以降は英数字とハイフン (否定クラスへの反転を捕まえる)', async () => {
    const t = await fresh();
    expect(t.isValidLadderMember(m('ab-c9'))).toBe(true);
    expect(t.isValidLadderMember(m('a!b'))).toBe(false);
  });

  it('★ 長さの量指定子 {0,63} が効いている', async () => {
    const t = await fresh();
    expect(t.isValidLadderMember(m('a'))).toBe(true);
    expect(t.isValidLadderMember(m('a'.repeat(64)))).toBe(true);
    expect(t.isValidLadderMember(m('a'.repeat(65)))).toBe(false);
  });
});
