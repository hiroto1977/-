/**
 * **「独立 2 出典」の `独立` を数える規則は 1 つ。** (2026-09-26 · パス 478)
 *
 * ## 何が壊れていたか
 *
 * 同じ確証の規律に実装が **2 つ**在り、`独立` を持っていたのは片方だけだった。
 *
 * | 確証器 | 母集団 | `独立` を検めるか |
 * | --- | --- | --- |
 * | `sourceVerification.distinctSourceCount` | compliance / subsidy / support | **はい** (URL で重複を落とす。`EvidenceSource.url` の注記が「独立性の判定キー」と宣言) |
 * | `knowledgeProvenance.assessEvidence` | academic / econ-history | **いいえ** —— `sources.length` を素で数えていた |
 * | ゲート `scripts/verify-knowledge-provenance.cjs` の `assess` | 全 5 コレクション | **いいえ** —— 同じく `types.length` |
 *
 * ## 実測 (2026-09-26 · コーパス 4,039 項目)
 *
 * - 素の文字列で重複する出典を持つ項目: **0 件** (だから `distinctSourceCount` の
 *   欠落そのものは罠だった)
 * - **同じ文書を指す綴りの組を持つ項目: 1 件** ——
 *   `academic / bizlaw-equitable-set-off` の 2 出典は
 *   `…/wiki/Set-off_(law)` と `…/wiki/Set-off_(law)#Equitable_set-off` で、
 *   **フラグメントはサーバへ送られない**ので 1 つの文書である。
 *   ラベルは `Wikipedia: Set-off (law)` と `Wikipedia: Equitable set-off` で、
 *   読む側には 2 件に見えた。
 * - 隔離した写し (`git worktree`) で**同じ URL を 2 度**植えると、
 *   `verify:knowledge` / `lint:citations` / `lint:knowledge-refs` / `lint:doi-prefix`
 *   の **4 本すべてが exit 0**、単体検査も緑で、ゲートは
 *   「4039 項目（出典 2+・権威 1+）… ✅ すべての項目が確証ゲートを満たし」と刷った。
 *
 * ## だからここで見る 4 つ
 *
 * 1. **写しが割れないこと** —— `.cjs` は `.ts` を require できないので
 *    `scripts/lib/source-url.cjs` に写しが在る (前例: `scripts/lib/strip-non-code.cjs`
 *    · パス 452)。同じ標本を両方へ通す。
 * 2. **消費者が全部その規則を通ること** (両方向の台帳)。ゲートは
 *    **結果を使う形そのもの**を要求する —— 判定を*関数として*呼ぶだけの主張は、
 *    呼び手が結果を捨てても通る (パス 472 / 475 / 476 / 477 で 4 度踏んだ形)。
 * 3. **実物のコーパスが今日その規則を満たすこと** —— 針が的に当たることは
 *    直す前の組そのものを標本にして示す。
 * 4. **列挙した件数 = 独立した文書の数** —— 3 は「独立が下限以上」しか見ないので、
 *    **3 件並べて実は 2 件**という形 (実測 `infosoc-data-feminism`) は素通りする。
 *    数え方を直しても名乗りは直らないので、畳む前と後が等しいことを別に要求する。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizeSourceUrl, distinctSourceCount } from '../sourceVerification';
import { ADMISSION_RULE } from '../knowledgeProvenance';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const REPO = path.resolve(__dirname, '../../../..');
const req = createRequire(__filename);

/** 正規化の標本。**畳む物と畳まない物を同じ表に置く** (片側だけだと過剰に気づけない)。 */
const SAMPLES: readonly { readonly a: string; readonly b: string; readonly same: boolean; readonly why: string }[] = [
  // --- 畳む: 同じ文書であることが証明できる 4 つ ---
  { a: 'https://en.wikipedia.org/wiki/Set-off_(law)', b: 'https://en.wikipedia.org/wiki/Set-off_(law)#Equitable_set-off', same: true, why: 'フラグメントはサーバへ送られない (実物に在った形)' },
  { a: 'https://example.org/a', b: 'https://example.org/a', same: true, why: '同じ綴り' },
  { a: 'http://example.org/a', b: 'https://example.org/a', same: true, why: 'scheme は同じ資源の別の経路' },
  { a: 'https://EXAMPLE.org/a', b: 'https://example.org/a', same: true, why: 'ホスト名は大小を区別しない' },
  { a: 'https://example.org/a/', b: 'https://example.org/a', same: true, why: 'パス末尾の / ' },
  { a: 'https://example.org/a///', b: 'https://example.org/a', same: true, why: '末尾の / が複数でも同じ' },
  { a: 'https://example.org/', b: 'https://example.org', same: true, why: '根は末尾の / を落として空になる' },
  { a: 'https://example.org/A', b: 'https://example.org/a', same: true, why: 'パスの大小 (実物で割れた軸 —— 下の ★ を見よ)' },
  { a: 'https://en.wikipedia.org/wiki/Data_Feminism', b: 'https://en.wikipedia.org/wiki/Data_feminism', same: true, why: '★ 実物: infosoc-data-feminism の 2 件は 1 文字の大小だけが違う (実質同じ頁)' },
  { a: 'https://example.org:8443/a', b: 'https://example.org/a', same: true, why: 'ポートは hostname を使うので落ちる (コーパスに port つきは実測 0 件)' },
  // --- 畳まない: 別の文書を指しうる ---
  { a: 'https://example.org/p?id=1', b: 'https://example.org/p?id=2', same: false, why: 'クエリは別の文書を選ぶ' },
  { a: 'https://example.org/p?id=1', b: 'https://example.org/p', same: false, why: 'クエリの有無も別の文書' },
  { a: 'https://example.org/a', b: 'https://www.example.org/a', same: false, why: 'www の有無は別のホスト' },
  { a: 'https://example.org/a', b: 'https://example.org/b', same: false, why: '別のパス' },
  // --- 解析できない綴り ---
  { a: '  NOT A URL  ', b: 'not a url', same: true, why: '解析できなければ trim + 小文字化' },
  { a: '', b: '', same: true, why: '空も投げない' },
];

/**
 * `独立` の規則を通す消費者の台帳 (**両方向**)。
 *
 * `form` は**結果を使う形**を書く —— 関数名だけを見ると、呼び手が結果を捨てても通る。
 */
const CONSUMERS: readonly { readonly file: string; readonly form: string; readonly why: string }[] = [
  {
    file: 'src/renderer/data/sourceVerification.ts',
    form: 'for (const s of sources) urls.add(normalizeSourceUrl(s.url));',
    why: '規則の在り処。`verifyClaim` が `distinctSourceCount(claim.sources) < policy.minSources` で読む',
  },
  {
    file: 'src/renderer/data/knowledgeProvenance.ts',
    form: 'const distinct = distinctSourceCount(sources);',
    why: '学術コーパスの採用ゲート。2026-09-26 まで `sources.length` を素で数えていた',
  },
  {
    file: 'scripts/verify-knowledge-provenance.cjs',
    form: 'const distinct = distinctSourceCount(sources);',
    why: 'CI のゲート。`.cjs` なので共有モジュール (`scripts/lib/source-url.cjs`) を require する',
  },
  {
    file: 'scripts/lint-citations.cjs',
    form: "const { normalizeSourceUrl } = require('./lib/source-url.cjs');",
    why: '「同じ URL は同じ種別」を見る門。2026-09-05 から**自前の実装**を持っており、パス 478 でそちらの契約を採って共有モジュールへ畳んだ',
  },
];

describe('normalizeSourceUrl — 写しが割れない', () => {
  const cjs = req(path.join(REPO, 'scripts/lib/source-url.cjs')) as {
    normalizeSourceUrl: (u: string) => string;
    distinctSourceCount: (s: readonly { url: string }[]) => number;
  };

  it('★ 同じ標本で `.ts` と `.cjs` の出力が 1 字も違わない', () => {
    for (const { a, b } of SAMPLES) {
      for (const u of [a, b]) {
        expect(cjs.normalizeSourceUrl(u), `normalize(${JSON.stringify(u)})`).toBe(normalizeSourceUrl(u));
      }
    }
  });

  it('★ 独立数も両方で一致する', () => {
    for (const { a, b, same } of SAMPLES) {
      const srcs = [{ url: a }, { url: b }];
      const want = same ? 1 : 2;
      expect(distinctSourceCount(srcs), `.ts ${a} / ${b}`).toBe(want);
      expect(cjs.distinctSourceCount(srcs), `.cjs ${a} / ${b}`).toBe(want);
    }
  });

  it('畳む物と畳まない物が両方とも標本に在る (片側だけの表にしない)', () => {
    expect(SAMPLES.filter((s) => s.same).length).toBeGreaterThanOrEqual(7);
    expect(SAMPLES.filter((s) => !s.same).length).toBeGreaterThanOrEqual(4);
    for (const s of SAMPLES) expect(s.why.length, `${s.a} の理由`).toBeGreaterThanOrEqual(4);
  });
});

describe('消費者の台帳 (両方向)', () => {
  it('★ 台帳の各行が、結果を使う形そのものを持っている', () => {
    for (const c of CONSUMERS) {
      const src = readOriginalSource(path.join(REPO, c.file));
      expect(src, `${c.file} に ${c.form}`).toContain(c.form);
    }
  });

  it('★ `distinctSourceCount` を読む出荷コード / ゲートは台帳に在る (逆向き)', () => {
    const listed = new Set(CONSUMERS.map((c) => c.file));
    const candidates = [
      'src/renderer/data/knowledgeProvenance.ts',
      'scripts/verify-knowledge-provenance.cjs',
      'src/renderer/data/sourceVerification.ts',
      'scripts/lint-citations.cjs',
    ];
    for (const rel of candidates) {
      const src = readOriginalSource(path.join(REPO, rel));
      if (!src.includes('distinctSourceCount') && !src.includes('normalizeSourceUrl')) continue;
      expect(listed.has(rel), `${rel} が独立性の規則を読むのに台帳に無い`).toBe(true);
    }
  });

  /*
   * ★ **実装は `scripts/` に 1 つだけ** (2026-09-26 · パス 478)。
   *
   * パス 478 の最初の版はこの `.cjs` を「唯一の実装」と名乗ったが**偽だった** ——
   * `lint-citations.cjs` が同名の関数を、**しかも違う契約で**持っていた
   * (見つけたのはパス 325 の `parsedUrlGateCensus`)。名乗るなら数える。
   */
  it('★ `scripts/` に `normalizeSourceUrl` の実装は 1 つだけ (共有モジュール)', () => {
    const impls = globSync(['scripts/**/*.cjs'], { cwd: REPO, ignore: ['**/node_modules/**'] })
      .filter((rel) => stripComments(readOriginalSource(path.join(REPO, rel))).includes('function normalizeSourceUrl('))
      .sort();
    expect(impls).toEqual(['scripts/lib/source-url.cjs']);
  });

  it('★ ゲートは写しを require する (自前の正規化を持たない)', () => {
    const gate = readOriginalSource(path.join(REPO, 'scripts/verify-knowledge-provenance.cjs'));
    expect(gate).toContain("require('./lib/source-url.cjs')");
    // 自前の `new URL(...)` で独立性を数え直していないこと (針が当たる標本は下の describe)。
    expect(gate).not.toContain('function normalizeSourceUrl(');
  });
});

describe('実物のコーパスが今日その規則を満たす', () => {
  const kc = req(path.join(REPO, 'orchestration/knowledge-context.cjs')) as {
    loadEntries: () => readonly { collection: string; id: string; sources?: readonly { url: string; type: string }[] }[];
  };
  const entries = kc.loadEntries();

  it('走査が空でない (床)', () => {
    expect(entries.length).toBeGreaterThan(3000);
  });

  it('★ どの項目も独立した出典が下限以上 (同じ文書を 2 度と数えない)', () => {
    const offenders = entries
      .filter((e) => distinctSourceCount(e.sources ?? []) < ADMISSION_RULE.minSources)
      .map((e) => `${e.collection}/${e.id}: 独立 ${distinctSourceCount(e.sources ?? [])} 件 (出典 ${(e.sources ?? []).length} 件)`);
    expect(offenders).toEqual([]);
  });

  it('★ 針が的に当たる —— 直す前の組を渡すと 1 件に畳まれる', () => {
    const before = [
      { url: 'https://en.wikipedia.org/wiki/Set-off_(law)', type: 'reference' },
      { url: 'https://en.wikipedia.org/wiki/Set-off_(law)#Equitable_set-off', type: 'reference' },
    ];
    expect(distinctSourceCount(before)).toBe(1);
    expect(distinctSourceCount(before)).toBeLessThan(ADMISSION_RULE.minSources);
  });

  /*
   * ★★ **列挙した件数 = 独立した文書の数** (2026-09-26 · パス 478)。
   *
   * 上の `it` は「独立が下限以上」を見るので、**出典 3 件のうち 2 件が同じ頁**という
   * 形は通る (独立 2 件で下限を満たす)。実測でそれが 1 件在った ——
   * `academic / infosoc-data-feminism` は `…/wiki/Data_Feminism` と
   * `…/wiki/Data_feminism` を並べており、読む側には裏付けが 3 本に見えた。
   * **数え方を直しても、名乗りは直らない。**
   *
   * だからここは畳む前と後が等しいことを要求する。**失敗の向きは騒がしい** ——
   * 1 つの文書の 2 か所 (節のアンカー・版の違う綴り) を正当に引きたい編者は、
   * この検査が名指しで落ちるので理由つきの例外を書くことになる (今日 0 件)。
   */
  it('★ 列挙した出典の件数が、独立した文書の数と一致する (同じ頁を 2 行に分けない)', () => {
    const offenders = entries
      .map((e) => ({ e, listed: (e.sources ?? []).length, distinct: distinctSourceCount(e.sources ?? []) }))
      .filter((x) => x.listed !== x.distinct)
      .map((x) => `${x.e.collection}/${x.e.id}: 列挙 ${x.listed} 件 / 独立 ${x.distinct} 件 (${(x.e.sources ?? []).map((s) => s.url).join(' | ')})`);
    expect(offenders).toEqual([]);
  });

  it('★ 針が的に当たる —— 直す前の data-feminism は 3 件並べて独立 2 件だった', () => {
    const before = [
      { url: 'https://doi.org/10.7551/mitpress/11805.001.0001', type: 'academic' },
      { url: 'https://en.wikipedia.org/wiki/Data_Feminism', type: 'reference' },
      { url: 'https://en.wikipedia.org/wiki/Data_feminism', type: 'reference' },
    ];
    expect(before.length).toBe(3);
    expect(distinctSourceCount(before)).toBe(2);
    // 下限は満たすので「独立が下限以上」の検査では鳴らない —— 上の不変条件だけが見る。
    expect(distinctSourceCount(before)).toBeGreaterThanOrEqual(ADMISSION_RULE.minSources);
  });

  it('★ 直した後の data-feminism は列挙 2 件 = 独立 2 件', () => {
    const e = entries.find((x) => x.id === 'infosoc-data-feminism');
    expect(e, 'infosoc-data-feminism が在る').toBeDefined();
    const urls = (e?.sources ?? []).map((s) => s.url);
    expect(urls.length).toBe(2);
    expect(distinctSourceCount(e?.sources ?? [])).toBe(2);
  });

  it('★ 直した後の項目は独立 2 件 (別の頁を引いている)', () => {
    const e = entries.find((x) => x.id === 'bizlaw-equitable-set-off');
    expect(e, 'bizlaw-equitable-set-off が在る').toBeDefined();
    const urls = (e?.sources ?? []).map((s) => s.url);
    expect(urls.length).toBe(2);
    expect(distinctSourceCount(e?.sources ?? [])).toBe(2);
    // 節のアンカーへ戻っていないこと (この形が欠陥だった)。
    for (const u of urls) expect(u, `${u} にフラグメント`).not.toContain('#');
  });
});
