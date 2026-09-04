import { describe, expect, it, vi } from 'vitest';
import {
  achievementGap,
  diagnoseOrg,
  isValidLadderMember,
  isValidProbability,
  MAX_LADDER_MEMBERS,
  ORGAN_DISEASES,
  reviewLadder,
  sanitizeInitiatives,
  sanitizeReports,
  sanitizeTalentState,
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
  /*
   * **定数と比べない。字面で比べる。**
   *
   * 最初は `toEqual(EMPTY_TALENT_STATE)` と書いた。**効かなかった** ——
   * 変異が `EMPTY_TALENT_STATE` そのものを書き換えるので、
   * **変異した定数を変異した定数と比べる**ことになり、常に一致する
   * (実測: `reports: []` を潰しても 5 件とも生存)。
   *
   * 同じ形を本 PR の `vault.ts` でも踏んでいる (奥の文言と接頭辞を共有する
   * `toThrow` を書いた)。**検査の期待値が、検査対象から来てはいけない。**
   */
  it('★ オブジェクトでなければ空の状態 (期待値は字面で置く)', async () => {
    // `EMPTY_TALENT_STATE` は**モジュール直下の定数**なので、静的 import の
    // ままでは変異が届かない (実測: 字面で比べる形に直しても 5 件生存した)。
    // 読み直す —— 本 PR で 4 度目の同じ手当てである。
    vi.resetModules();
    const m = await import('../talent');
    for (const v of [null, undefined, 'x', 42, true]) {
      expect(m.sanitizeTalentState(v)).toEqual({
        reports: [],
        initiatives: [],
        members: [],
        updatedAt: '',
      });
    }
  });

  it('★ EMPTY_TALENT_STATE 自体の中身も字面で留める', async () => {
    vi.resetModules();
    const m = await import('../talent');
    expect(m.EMPTY_TALENT_STATE).toEqual({
      reports: [],
      initiatives: [],
      members: [],
      updatedAt: '',
    });
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

/**
 * **測れていなかった 17 件を問い直した (2026-08-31 実測)。**
 *
 * 変異検査で `src/shared/talent.ts` の 16 件が生存 + 1 件が未到達だった。
 * どれも「壊れた/悪意ある localStorage を読んだとき」の振る舞いである。
 *
 * ## 内訳を正直に書く
 *
 * 最初、下の検査群を「17 件を撃墜する」つもりで書いた。**そうではなかった。**
 * 変異体の位置を実物で読み直すと、多くは条件式**全体**ではなく
 * `typeof x === 'number'` のような**片方の項**に当たっており、残った項が
 * 同じように弾くので観測できる差が無い:
 *
 *   - `Number.isFinite(x)` / `Number.isInteger(x)` は `typeof x === 'number'`
 *     を**含意する** → 先行する typeof の項は実行時には冗長 (型のために要る)
 *   - `Set.has` は非文字列に対して常に false → 先行する typeof の項は冗長
 *   - 非オブジェクトへの添字は例外にならず `undefined` → `typeof r !== 'object'`
 *     の項は冗長 (`r === null` のほうは**必要**。null への添字は投げる)
 *
 * 実装側に理由つきの pragma を置き、**残った 8 件**を下で撃墜する。
 * 「17 件のテストを書いた」ではなく「17 件のうち 9 件は等価だと分かった」が
 * 起きたことである —— **対照が鳴らなかったところから逆算した**
 * (最初に書いた「合計ちょうど 100」の検査も、対照が鳴らずに等価と判明して
 *  実装のほうを `Math.max(0, …)` へ直した)。
 *
 * 等価と分かった項に当たる検査も**残してある**。撃墜はしないが、
 * 「非数値・NaN・範囲外を受け付けない」は独立に正しい主張だからである。
 */
describe('talent —— 測れていなかった境界', () => {
  /*
   * `DISEASE_IDS` はモジュール本体で一度だけ評価される静的な集合なので、
   * 先頭の静的 import では変異が効く前に評価が済む。読み直して問う。
   */
  it('★ 病名の許可リストは中身を持つ (静的な集合を読み直して問う)', async () => {
    vi.resetModules();
    const m = await import('../talent');
    const known = m.ORGAN_DISEASES[0]!.id;
    const [r] = m.sanitizeReports([{ department: '営業', diseases: [known, 'no-such-disease'] }]);
    // 許可リストが空になっていれば known も落ちる。
    expect(r?.diseases).toEqual([known]);
  });

  it('★ 失格条項の一覧は中身を持つ (静的な表を読み直して問う)', async () => {
    vi.resetModules();
    const m = await import('../talent');
    const id = m.LEADER_DISQUALIFIERS[0]!.id;
    const v = m.judgeLeaderFitness([id]);
    expect(v.eligible).toBe(false);
    expect(v.hits.map((h) => h.id)).toEqual([id]);
    // 知らない札は拾わない (構造そのものが許可リストである)。
    expect(m.judgeLeaderFitness(['no-such-flag']).eligible).toBe(true);
  });

  // --- diagnoseOrg -------------------------------------------------------

  it('★ 部署名が空の申告は数えない (集計に無名の欄を作らない)', () => {
    const known = ORGAN_DISEASES[0]!.id;
    const d = diagnoseOrg([
      { department: '', diseases: [known] },
      { department: '営業', diseases: [known] },
    ]);
    expect(d.reportedDepartments).toBe(1);
    expect(d.tallies.find((t) => t.id === known)?.departments).toEqual(['営業']);
  });

  it('★ 部署の一覧は並べ替えて返す (入力順に依らない)', () => {
    const known = ORGAN_DISEASES[0]!.id;
    const d = diagnoseOrg([
      { department: '営業', diseases: [known] },
      { department: 'カスタマー', diseases: [known] },
      { department: 'あ', diseases: [known] },
    ]);
    const depts = d.tallies.find((t) => t.id === known)?.departments ?? [];
    expect([...depts]).toEqual([...depts].sort());
    expect(depts.length).toBe(3);
  });

  // --- isValidProbability / achievementGap --------------------------------

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['負の値', -1],
    ['100 超', 101],
    ['文字列', '50'],
    ['null', null],
    ['undefined', undefined],
  ])('★ 達成確率として受け付けない: %s', (_label, v) => {
    expect(isValidProbability(v)).toBe(false);
  });

  it.each([0, 0.5, 50, 99.99, 100])('★ 達成確率として受け付ける: %s', (v) => {
    expect(isValidProbability(v)).toBe(true);
  });

  /*
   * 境界ちょうどと、その両側。
   *
   * ここは最初 `rounded >= 100 ? 0 : …` の `>=` を `>` にする変異を狙って
   * 書いたが、**対照が鳴らなかった** —— 100 ちょうどでは else 側も
   * `Math.round((100-100)*100)/100 = 0` を返すので、差が観測できない。
   * 実装のほうを `Math.max(0, …)` に変えて比較ごと消した (等価変異を
   * pragma で黙らせない)。この 3 本は下限で切っていることを留める。
   */
  it('★ 合計ちょうど 100 は不足なし (境界)', () => {
    const g = achievementGap([
      { name: 'a', probability: 60 },
      { name: 'b', probability: 40 },
    ]);
    expect(g.total).toBe(100);
    expect(g.shortfall).toBe(0);
    expect(g.ok).toBe(true);
  });

  it('★ 99.99 は不足あり (境界の反対側)', () => {
    const g = achievementGap([{ name: 'a', probability: 99.99 }]);
    expect(g.shortfall).toBe(0.01);
    expect(g.ok).toBe(false);
  });

  // --- isValidLadderMember ------------------------------------------------

  const member = (over: Record<string, unknown>): unknown => ({
    id: 'm1',
    name: '山田',
    step: 1,
    yearsInStep: 2,
    ...over,
  });

  it.each([
    ['step が 0', { step: 0 }],
    ['step が 5', { step: 5 }],
    ['step が整数でない', { step: 1.5 }],
    ['step が文字列', { step: '1' }],
    ['step が NaN', { step: Number.NaN }],
    ['years が負', { yearsInStep: -1 }],
    ['years が 60 超', { yearsInStep: 61 }],
    ['years が Infinity', { yearsInStep: Number.POSITIVE_INFINITY }],
    ['years が文字列', { yearsInStep: '2' }],
  ])('★ ロードマップの一員として受け付けない: %s', (_label, over) => {
    expect(isValidLadderMember(member(over))).toBe(false);
  });

  it.each([
    ['step の下端', { step: 1 }],
    ['step の上端', { step: 4 }],
    ['years の下端', { yearsInStep: 0 }],
    ['years の上端', { yearsInStep: 60 }],
  ])('★ 受け付ける境界: %s', (_label, over) => {
    expect(isValidLadderMember(member(over))).toBe(true);
  });

  it('★ 段ごとの人数を実際に数える', () => {
    const r = reviewLadder([
      member({ id: 'a', step: 1 }),
      member({ id: 'b', step: 1 }),
      member({ id: 'c', step: 3 }),
      'ゴミ',
    ]);
    expect(r.members).toHaveLength(3);
    expect(r.byStep).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0 });
  });

  // --- sanitize* ----------------------------------------------------------

  it('★ null が混ざった配列でも落ちない (申告)', () => {
    expect(sanitizeReports([null, { department: '営業', diseases: [] }, 42])).toEqual([
      { department: '営業', diseases: [] },
    ]);
  });

  it('★ null が混ざった配列でも落ちない (施策)', () => {
    expect(sanitizeInitiatives([null, { name: 'a', probability: 10 }, 'x'])).toEqual([
      { name: 'a', probability: 10 },
    ]);
  });

  it('★ diseases が配列でなければ空にする (未到達だった枝)', () => {
    expect(sanitizeReports([{ department: '営業', diseases: 'delete' }])).toEqual([
      { department: '営業', diseases: [] },
    ]);
    expect(sanitizeReports([{ department: '営業' }])).toEqual([{ department: '営業', diseases: [] }]);
  });

  it('★ 知らない病名と非文字列は落とす', () => {
    const known = ORGAN_DISEASES[0]!.id;
    expect(
      sanitizeReports([{ department: '営業', diseases: [known, 'unknown', 1, null] }]),
    ).toEqual([{ department: '営業', diseases: [known] }]);
  });

  /*
   * **上限で切るのと、形を確かめるのは別の仕事。**
   * 下の検査は全部正しい形の member を渡すので、`.filter(isValidLadderMember)`
   * を落としても長さが変わらない (実測 2026-08-31: その変異体が生存)。
   * 壊れた要素を混ぜて、**切った後に選り分けている**ことを見る。
   */
  it('★ members は上限で切ったうえで、形の合わないものを落とす', () => {
    const state = sanitizeTalentState({
      members: [member({ id: 'ok1' }), 'ゴミ', null, member({ id: 'bad', step: 9 }), 42],
    });
    expect(state.members.map((m) => m.id)).toEqual(['ok1']);
  });

  it('★ members は上限で切る', () => {
    const many = Array.from({ length: MAX_LADDER_MEMBERS + 10 }, (_, i) =>
      member({ id: `m${i}` }),
    );
    expect(sanitizeTalentState({ members: many }).members).toHaveLength(MAX_LADDER_MEMBERS);
  });

  it('★ members が配列でなければ空にする', () => {
    expect(sanitizeTalentState({ members: 'nope' }).members).toEqual([]);
    expect(sanitizeTalentState({}).members).toEqual([]);
  });
});

describe('talent —— 不足は下限で切る', () => {
  it('★ 合計が 100 を超えても不足は 0 (負にしない)', () => {
    const g = achievementGap([
      { name: 'a', probability: 80 },
      { name: 'b', probability: 40 },
    ]);
    expect(g.total).toBe(120);
    expect(g.shortfall).toBe(0);
    expect(g.ok).toBe(true);
  });
});
