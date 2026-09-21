/**
 * **「固定回数の待ちに寄りかかっている検査」の台帳を、実物と突き合わせる**
 * (2026-09-21 · パス 369)。
 *
 * ## パス 368 で私が書いた針は、両方向に外れていた
 *
 * `fixedTickAssertionCensus.test.ts` は「固定回数で待ったあとに**文が出ている**と
 * 主張する検査」を**綴り**で数えた:
 *
 * ```js
 * /expect\([^)]*textContent[^)]*\)\s*\.toContain\(|expect\(text\)\.toContain\(/
 * ```
 *
 * 2026-09-21 に周回数を 0 にして全件を走らせたところ (`npm run audit:tick-sensitivity`)、
 * **この針が最も多い危ない形を 1 件も見ていなかった**ことが分かった:
 *
 * | 形 | 例 | 針は |
 * | --- | --- | --- |
 * | `expect(text()).toContain(…)` | 15 ファイル / 148 か所 | **見えない** (`expect(text)` は裸の識別子だけ) |
 * | `expect(q.sheet()!.textContent).toContain(…)` | `overviewBankSheet` | **見えない** (`[^)]*` が入れ子の括弧を跨げない) |
 * | `expect(el?.textContent).toBe('確認できません')` | `settingsUnreadableCards` | **見えない** (matcher が `toContain` だけ) |
 * | `expect(q.cell('売上高')).toBe(…)` | `overviewBankSheet` | **見えない** (読むのが helper で `textContent` の綴りが無い) |
 *
 * 逆向きにも外れる —— **条件で待ったあと**の `expect(…).toContain(…)` はもう
 * 当て物ではないのに、針はその区別ができない。針を広げると 30 ファイル /
 * 116 か所が挙がるが、実測ではその大半が **0 周でも通る**。
 *
 * ## だから測る側を振る舞いへ移した
 *
 * 知りたいのは綴りではなく「**この主張は settle の回数に依っているか**」で、
 * それは**回数を 0 にして走らせれば直接答えが出る**。
 * `scripts/audit-tick-sensitivity.cjs` がそれを測り、落ちたファイルを
 * 理由つきの台帳と**双方向**に突き合わせる。パス 356 の `audit:survivors` と
 * 同じ家系である (静的な報告が偽だったので、報告ではなく当て直して確かめた)。
 *
 * ## ここが見る物 (走らせはしない)
 *
 * 判定のために**ソースを書き換える**道具なので CI では走らせない
 * (`audit:floors` / `audit:survivors` / `audit:regex-poly` と同じ定期点検の道具)。
 * ここは毎回の `npm test` で決定的な物だけを見る: 台帳の形・理由・
 * 行が実在の検査を指すこと・`kind` が説明済みの語であること・
 * そして**道具が CI の門に混ざっていないこと**。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const AUDIT = 'scripts/audit-tick-sensitivity.cjs';
const CENSUS = 'src/renderer/__tests__/fixedTickAssertionCensus.test.ts';

/** 台帳の 1 行。`why` は**その行だけで読める**こと (「同上」は前の行が消えると壊れる)。 */
export interface LedgerRow {
  readonly file: string;
  readonly kind: string;
  readonly why: string;
}

/** 台帳を綴りから読む (`require` せず原文を読む —— 変異体を読まないため)。 */
export function ledgerRows(src: string): LedgerRow[] {
  const out: LedgerRow[] = [];
  const re = /\{\s*file: '([^']+)',\s*kind: '([^']+)',\s*why: '((?:[^'\\]|\\.)*)',\s*\}/g;
  for (const m of src.matchAll(re)) out.push({ file: m[1]!, kind: m[2]!, why: m[3]! });
  return out;
}

/** 台帳が使ってよい `kind`。**docblock がこの語を説明していること**を下で要求する。 */
const KINDS = [
  'store-roundtrip',
  'setup-flush',
  'text-captured',
  'text-helper',
  'text-with-message',
  'attribute',
  'element-presence',
  'hook-state',
  'mock-call',
] as const;

describe('固定回数の待ちへの依存は、綴りではなく振る舞いで測る (パス 369)', () => {
  const audit = readOriginalSource(join(REPO, AUDIT));
  const rows = ledgerRows(audit);
  const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
    scripts: Record<string, string>;
  };

  it('★ 針が実物の台帳に当たる (標本 — 空の台帳で通っていない)', () => {
    const sample = "  {\n    file: 'src/x.test.ts',\n    kind: 'mock-call',\n    why: 'なぜそれでよいかの説明',\n  },\n";
    expect(ledgerRows(sample), '標本を読めていない').toHaveLength(1);
    expect(ledgerRows(sample)[0]!.file).toBe('src/x.test.ts');
    expect(rows.length, '実物の台帳が読めていない').toBeGreaterThanOrEqual(20);
  });

  it('★ 台帳の行はすべて実在する検査を指す', () => {
    for (const r of rows) {
      expect(() => readOriginalSource(join(REPO, r.file)), `${r.file} が無い`).not.toThrow();
    }
  });

  it('★ 台帳の行はすべて固定回数の待ちを実際に持つ (母集団の外を載せていない)', () => {
    for (const r of rows) {
      const src = readOriginalSource(join(REPO, r.file));
      expect(
        /for \(let \w+ = 0; \w+ < \d+; \w+ \+= 1\)[\s\S]{0,200}?setTimeout/.test(src),
        `${r.file} に固定回数の待ちが無い —— 台帳から消す`,
      ).toBe(true);
    }
  });

  it('★ 理由はその行だけで読める (「同上」は前の行が消えると壊れる)', () => {
    for (const r of rows) {
      expect(r.why.length, `${r.file}: 理由が短すぎる`).toBeGreaterThan(10);
      expect(r.why, `${r.file}: 「同上」は他の行に依存している`).not.toContain('同上');
    }
  });

  it('★ kind は説明済みの語だけ (docblock が意味を書いている)', () => {
    for (const r of rows) {
      expect(KINDS as readonly string[], `${r.file}: 未知の kind「${r.kind}」`).toContain(r.kind);
    }
    for (const k of KINDS) {
      if (!rows.some((r) => r.kind === k)) continue;
      expect(audit, `kind「${k}」の意味が docblock に無い`).toContain(`\`${k}\``);
    }
  });

  it('★ 道具は npm から呼べて、自己検査も走る', () => {
    const cmd = pkg.scripts['audit:tick-sensitivity'];
    expect(cmd, 'audit:tick-sensitivity が package.json に無い').toBeDefined();
    expect(cmd).toContain('audit-tick-sensitivity.cjs');
    expect(cmd, '自己検査を走らせていない (在るのに誰も走らせない検査になる)').toContain('--self-test');
  });

  it('★ 定期点検の道具は CI の門に混ざらない (ソースを書き換えるため)', () => {
    expect(pkg.scripts['verify:all'], 'verify:all に混ざっている').not.toContain('tick-sensitivity');
    const ci = readOriginalSource(join(REPO, '.github/workflows/ci.yml'));
    expect(ci, 'ci.yml が走らせている').not.toContain('tick-sensitivity');
    // 対照: 同じ読み方で、実際に在る門は見つかる (針が死んでいない)。
    expect(ci, '針が死んでいる —— 実在する門も見えていない').toContain('lint:forbidden');
  });

  it('★ 道具は必ず元へ戻す (戻したことを内容で確かめている)', () => {
    expect(audit, 'finally で戻していない').toContain('} finally {');
    expect(audit, '戻したことを照合していない').toContain("fs.readFileSync(s.abs, 'utf8') !== s.src");
  });

  it('★ パス 368 の census は、自分の針の限界を書いている', () => {
    const census = readOriginalSource(join(REPO, CENSUS));
    expect(census, '針の限界が書かれていない').toContain('audit:tick-sensitivity');
  });
});
