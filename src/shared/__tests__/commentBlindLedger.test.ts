/**
 * **「注記が答えになっている検査」の台帳を、実物と突き合わせる** (2026-09-25 · パス 465)。
 *
 * ## なぜ綴りでは数えられないか
 *
 * このリポジトリの検査は**原文を読んで**母集団や台帳を導く物が多い
 * (2026-09-25 実測: `readFileSync` / `readOriginalSource` を読む検査 228 本のうち、
 * 注記を落とすのは 106 本)。原文には注記も入るので、「宣言が在る」と主張している
 * つもりで**散文が在るだけ**という形が生まれうる (法則 `mention-vs-declaration`)。
 * それは**綴りに現れない** —— 「この検査は注記に騙されているか」は、
 * 検査のソースを何度読んでも書いていない。
 *
 * だから振る舞いで測る: `npm run audit:comment-blind` が `.ts` / `.cjs` / `.js` の
 * **注記の本文だけ**を無意味にして (長さと改行は保つ・pragma と JSDoc のタグは残す)、
 * 全件を走らせ、落ちた検査を理由つきの台帳と**双方向**に突き合わせる。
 * 自己検査は `stripComments(書き換え後) === stripComments(原文)` で、
 * 「触ったのは注記だけ」を全件で証明してから走らせる。
 *
 * ## 2026-09-25 の初回実測
 *
 * 隔離した写し (直す前) で 1,428 本を書き換えて `npm test` を走らせると
 * **13 ファイル / 15 件**が落ちた。仕分けると **11 本は設計どおり**
 * (注記を読むのが仕事 / 内容ハッシュ) で、**2 本が「散文が答えになっていた」**:
 *
 * | 検査 | 散文で満たされていた物 |
 * | --- | --- |
 * | `lawCoverageLedger` | `shell-open-gate` が「母集団を走査する検査を持つ」—— 根拠は `exportSymlinkContainment.test.ts:49` の**注記 1 行**で、しかもその注記は「一時の道に使うと的が外れる」と**使っていないこと**を述べていた |
 * | `limitCoverageCensus` | `MAX_STOCK_ADVISOR_RISK_CHARS` が「検査から名前で参照されている」—— 根拠は `ceilingLiteralCensus.test.ts` の docblock の**例示 1 行**で、その文は「同じ数だが別物」と述べていた |
 *
 * ## ここが見る物 (走らせはしない)
 *
 * 判定のために**ソースを書き換える**道具なので CI では走らせない
 * (`audit:tick-sensitivity` / `audit:survivors` / `audit:regex-poly` と同じ定期点検の道具)。
 * ここは毎回の `npm test` で決定的な物だけを見る —— 台帳の形・理由・
 * 行が実在の検査を指すこと・`kind` が説明済みの語であること・
 * 走査器が**共有の 1 つ**であること (5 つ目の写しを作っていないこと)・
 * 書き換えを `finally` で戻し**内容で照合する**こと・
 * そして**道具が CI の門に混ざっていないこと**。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO = join(__dirname, '..', '..', '..');
const AUDIT = 'scripts/audit-comment-blind.cjs';

/** 台帳の 1 行。`why` は**その行だけで読める**こと (「同上」は前の行が消えると壊れる)。 */
export interface LedgerRow {
  readonly file: string;
  readonly kind: string;
  readonly why: string;
}

/** 台帳を綴りから読む (`require` せず原文を読む —— 変異体を読まないため)。 */
export function ledgerRows(src: string): LedgerRow[] {
  const out: LedgerRow[] = [];
  const re = /\{\s*file: '([^']+)',\s*kind: '([^']+)',\s*\n?\s*why: '((?:[^'\\]|\\.)*)'\s*\},/g;
  for (const m of src.matchAll(re)) out.push({ file: m[1]!, kind: m[2]!, why: m[3]! });
  return out;
}

/** 台帳が使ってよい `kind`。**docblock がこの語を説明していること**を下で要求する。 */
const KINDS = [
  'sample-in-comment',
  'reads-docblock',
  'counts-comments',
  'prose-in-population',
  'content-hash',
] as const;

describe('注記への依存は、綴りではなく振る舞いで測る (パス 465)', () => {
  const audit = readOriginalSource(join(REPO, AUDIT));
  const rows = ledgerRows(audit);
  const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
    scripts: Record<string, string>;
  };

  it('★ 針が実物の台帳に当たる (標本 — 空の台帳で通っていない)', () => {
    const sample = "  { file: 'src/x.test.ts', kind: 'reads-docblock',\n    why: 'なぜ注記を読むのが仕事なのかの説明' },\n";
    expect(ledgerRows(sample), '標本を読めていない').toHaveLength(1);
    expect(ledgerRows(sample)[0]!.file).toBe('src/x.test.ts');
    expect(rows.length, '実物の台帳が読めていない').toBeGreaterThanOrEqual(10);
  });

  it('★ 台帳の行はすべて実在の検査を指す', () => {
    for (const r of rows) {
      expect(/\.test\.tsx?$/.test(r.file), `${r.file} は検査ファイルでない`).toBe(true);
      expect(existsSync(join(REPO, r.file)), `${r.file} が実在しない`).toBe(true);
    }
  });

  it('★ kind は既知の語で、道具の docblock がその語を説明している', () => {
    for (const r of rows) expect(KINDS as readonly string[], `${r.file}: ${r.kind}`).toContain(r.kind);
    for (const k of KINDS) {
      expect(audit.includes(`\`${k}\``), `docblock が ${k} を説明していない`).toBe(true);
    }
    // 使われていない語を放置しない (説明だけ残ると次に読む人が母集団を誤る)。
    const used = new Set(rows.map((r) => r.kind));
    expect([...KINDS].filter((k) => !used.has(k)), '説明だけ在って 1 行も使っていない kind').toEqual([]);
  });

  it('★ 理由はその行だけで読める (「同上」を置かない)', () => {
    for (const r of rows) {
      expect(r.why.trim().length, r.file).toBeGreaterThan(20);
      expect(/^(同上|同じ|上と同じ)/.test(r.why.trim()), `${r.file}: 省略形の理由`).toBe(false);
    }
  });

  it('★ 台帳に重複が無い', () => {
    expect(new Set(rows.map((r) => r.file)).size, '同じファイルが 2 行').toBe(rows.length);
  });

  /*
   * ★ **走査器は共有の 1 つ** —— 範囲を採るために 2 つ目の字句解析器を書くと、
   * それは「同じ算法の 5 つ目の綴り」になる (パス 461 / 463 が数えた当の家系)。
   * この道具は `scripts/lib/strip-non-code.cjs` の `commentSpans` を読むだけである。
   */
  it('★ 道具は共有の走査器を読み、自前の写しを持たない', () => {
    const code = stripComments(audit);
    expect(code).toContain("require('./lib/strip-non-code.cjs')");
    expect(code).toContain('commentSpans');
    expect(/function\s+(scan|stripNonCode|stripComments)\s*\(/.test(code), '自前の走査器が生えている').toBe(false);
  });

  it('★ 書き換えは finally で戻し、戻したことを内容で照合する', () => {
    const code = stripComments(audit);
    expect(code).toContain('} finally {');
    expect(code).toContain('restoreAll(saved)');
    // 「書いた物を読み直して比べる」行が在る (戻し損ねたまま緑を返さない)。
    expect(/readFileSync\(s\.abs, 'utf8'\) !== s\.src/.test(code), '戻しの照合が無い').toBe(true);
  });

  it('★ 自己検査を先に走らせる形で登録されている', () => {
    const cmd = pkg.scripts['audit:comment-blind'];
    expect(cmd, 'package.json に登録されていない').toBeDefined();
    expect(cmd).toContain('--self-test');
    expect(cmd!.indexOf('--self-test'), '自己検査が後ろに在る (壊れた道具で本走行してしまう)')
      .toBeLessThan(cmd!.lastIndexOf('audit-comment-blind.cjs'));
  });

  /*
   * ★ **道具は門ではない。** ソースを書き換えるので `verify:all` にも CI にも入れない
   * (`audit:tick-sensitivity` と同じ判断)。混ざると、他の作業と同時に走った日に
   * 書き換えたソースを掴んで別の検査が落ちる。
   */
  it('★ 道具は verify:all にも ci.yml にも入っていない', () => {
    expect(pkg.scripts['verify:all']).not.toContain('audit:comment-blind');
    const ci = readOriginalSource(join(REPO, '.github/workflows/ci.yml'));
    expect(ci).not.toContain('audit:comment-blind');
    // 標本: 針は当たる (同じ綴りを足せば見つかる)。
    expect(`${ci}\naudit:comment-blind`).toContain('audit:comment-blind');
  });

  /*
   * ★ **予測は外れた (2026-09-25 · パス 465)。**
   * 直した 2 本は台帳から抜けると書いて commit したが、実物で走らせたら**抜けなかった** ——
   * 直しの一部として「注記の中にしか無い言及」そのものを木から採って標本に留めたので、
   * **今度は意図して注記を読む**からである (`sample-in-comment`)。
   * ここは「抜けたか」ではなく **直しが効いていること**と**正しい種類で載っていること**を見る。
   */
  it('★ 2026-09-25 に閉じた 2 件は、直った上で sample-in-comment として台帳に居る', () => {
    const fixed = [
      'src/shared/__tests__/lawCoverageLedger.test.ts',
      'src/shared/__tests__/limitCoverageCensus.test.ts',
    ];
    for (const f of fixed) {
      const row = rows.find((r) => r.file === f);
      expect(row, `${f} が台帳に無い`).toBeDefined();
      expect(row!.kind, f).toBe('sample-in-comment');
      // 直しが効いていること —— どちらも `stripComments` を通してから針を当てる。
      expect(stripComments(readOriginalSource(join(REPO, f))), f).toContain('stripComments(readOriginalSource(');
    }
  });
});
