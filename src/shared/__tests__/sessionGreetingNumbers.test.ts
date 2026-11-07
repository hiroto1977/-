/**
 * **セッション開始の greeting が名乗る数は、ゲートが数えた物と同じ**
 * (2026-09-26 · パス 481)。
 *
 * ## 見つけた物 (実測)
 *
 * SessionStart hook (`scripts/session-context.cjs`) は新しいセッションが**最初に
 * 読む**物で、`CLAUDE.md` の冒頭がそこを指している。その行は
 * `static it() tests: N` と名乗る。ところが実測 (2026-09-26):
 *
 * ```
 *   greeting                       16065
 *   verify:arch (countStaticIts)   16064
 *   docs/ARCHITECTURE.md の表        16064
 * ```
 *
 * `countStaticIts` の docblock は「**2 か所から参照される** … 数え方を写すと、
 * 片方だけ直したときに『どちらが正しいのか分からない 2 つの数』になる」と
 * **警告していたのに export されていなかった**ので、hook は必然的に写しを持ち、
 * その写しは契約が **2 つの軸で**違っていた:
 *
 * ```
 *   母集団   ゲート .test.ts  /  hook .ts|.tsx
 *   針       ゲート /^\s+it\(/ /  hook /^\s*it\(/
 * ```
 *
 * 差を軸ごとに分けると (実測) —— **針の軸は 0 件** (列 0 の `it(` はどこにも無い)、
 * **母集団の軸が 1 件**: `src/renderer/__audits__/malformedFieldSweep.audit.ts` は
 * `vitest.audit.config.ts` だけが拾うので **`npm test` も CI も 1 度も走らせない**
 * (`audit:malformed-fields` はどの workflow にも無い)。
 *
 * つまり greeting は**過大に**名乗っていた —— CI が守っている検査の集合を実物より
 * 大きく見せ、しかも greeting を信じて表を 16065 に直したセッションは `verify:arch`
 * を壊す。**2026-09-26 に実際に踏みかけた** (compaction 後の要約が「verify:arch が
 * 落ちるかもしれない」と旗を立て、測って初めて greeting の側が誤りだと分かった)。
 *
 * パス 370 は hook の**コマンドの形**と**script の実在**を守ったが、**その script が
 * 何を刷るか**は誰も見ていなかった —— パス 370 自身の「守る順番の逆転」の、
 * もう 1 段外側である。
 *
 * ## ここが見る物
 *
 * ① greeting の数 == ゲートの数 (**実際に hook を走らせて**読む) ② hook が**自分の針を
 * 持たない** (綴り・標本つき) ③ ゲートの母集団が `npm test` の母集団である
 * (`__audits__` を数えない・**独立に**数え直して確かめる)。
 *
 * ★ ③ の数え直しは**借りない** —— ゲートの述語を借りると、述語を骨抜きにしても
 * 通る (パス 475 の自戒)。だから母集団はこの検査が自分で歩く。
 *
 * ★ **「表 == ゲート」はここに置かない** —— `verify:arch` が既に毎回照合している
 * (実測: 表を 1 動かすと `doc says N, source says M` で落ちる)。greeting == ゲートと
 * ゲート == 表で環は閉じるので、同じ事実を 2 つの門で見ない (パス 347 の判断)。
 * しかも置くと**この検査を 1 件足すたびに期待値が動く**ので、表の更新が
 * 「ゲートに訊く」ではなく「自分の検査数を足す」になってしまう。
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

const gate = req('../../../scripts/verify-architecture.cjs') as {
  countStaticIts?: () => number;
};

const HOOK = 'scripts/session-context.cjs';
const AUDIT_FILE = 'src/renderer/__audits__/malformedFieldSweep.audit.ts';

/** greeting を**実際に走らせて** `static it() tests: N` を読む。 */
function greetingCount(): number {
  const out = execFileSync(process.execPath, [join(REPO, HOOK)], {
    cwd: REPO,
    encoding: 'utf8',
  });
  const m = /static it\(\) tests: (\d+|\?)/.exec(out);
  expect(m, `greeting が数を名乗っていない:\n${out}`).not.toBeNull();
  expect(m![1], 'greeting が「?」を刷った —— ゲートを読めていない').not.toBe('?');
  return Number(m![1]);
}

/** この検査が**独立に**歩く。ゲートの述語は借りない。 */
function walk(rel: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  const rec = (dir: string) => {
    for (const e of readOriginalDirEntries(join(REPO, dir))) {
      const next = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        rec(next);
      } else if (keep(e.name)) out.push(next);
    }
  };
  rec(rel);
  return out;
}

function countIts(files: readonly string[]): number {
  let n = 0;
  for (const f of files) n += [...readOriginalSource(join(REPO, f)).matchAll(/^\s*it\(/gm)].length;
  return n;
}

describe('greeting の数はゲートが数えた物と同じ (パス 481)', () => {
  it('★ ゲートが数え方を export している (hook が写しを持たずに読める)', () => {
    expect(typeof gate.countStaticIts, 'countStaticIts が export されていない').toBe('function');
    const n = gate.countStaticIts!();
    expect(Number.isInteger(n) && n > 0, `数になっていない: ${String(n)}`).toBe(true);
  });

  it('★ greeting の数 == ゲートの数 (実際に hook を走らせて読む)', () => {
    expect(greetingCount(), 'greeting とゲートが違う数を名乗っている').toBe(gate.countStaticIts!());
  });

  it('★ hook は自分の針を持たない (数え方を 2 つ持たない)', () => {
    const src = readOriginalSource(join(REPO, HOOK));
    // 肯定形 —— ゲートを読んでいること。
    expect(src, 'hook がゲートを読んでいない').toContain("require('./verify-architecture.cjs')");
    expect(src, 'hook がゲートの数え方を呼んでいない').toContain('countStaticIts');
    // 不在 —— 自分の `it(` の針を持たないこと。
    const needle = /\/\^\\s[*+]it\\\(\//;
    const body = src.replace(/^\s*\*.*$/gm, ''); // docblock の引用は数えない
    expect(needle.test(body), 'hook が自分の `it(` の針を持っている').toBe(false);
    // 標本: その針が、直す前に在った綴りへ実際に当たる (針が死んでいない)。
    expect(needle.test("const testCount = count('src', /^\\s*it\\(/gm);"), '針が当たらない').toBe(true);
    expect(needle.test("const testCount = count('src', /^\\s+it\\(/gm);"), '針が当たらない').toBe(true);
  });

  it('★ 読めなければ「?」—— 推測した数を名乗らない (標本つき)', () => {
    const src = readOriginalSource(join(REPO, HOOK));
    const fn = /function staticItCount\(\)[\s\S]*?\n}/.exec(src);
    expect(fn, 'staticItCount が読めない').not.toBeNull();
    const body = fn![0];
    expect(body, '読めなかったときに「?」を返していない').toContain("return '?'");
    // 不在 —— 推測した数を返す枝が無いこと。
    const guessed = /return '\d{3,}'/;
    expect(guessed.test(body), 'hook が推測した数を返している').toBe(false);
    // 標本: その針が、実際に推測を返す形へ当たる (針が死んでいない)。
    expect(guessed.test("    return '16064';"), '針が当たらない').toBe(true);
    expect(guessed.test("    return '?';"), '針が広すぎる').toBe(false);
  });

  it('★ 母集団は `npm test` が走らせる物 (__audits__ は数えない・独立に数え直す)', () => {
    const tests = walk('src', (n) => /\.test\.ts$/.test(n));
    const everyTs = walk('src', (n) => /\.(ts|tsx)$/.test(n));
    expect(tests.length, '走査が空 —— 歩き方が壊れている').toBeGreaterThanOrEqual(500);
    expect(everyTs.length, '走査が空').toBeGreaterThan(tests.length);
    expect(countIts(tests), 'ゲートの母集団が `.test.ts` ではない').toBe(gate.countStaticIts!());
    // 逆向き —— 広い母集団との差が在ること (この検査が自明に真になっていない)。
    expect(
      countIts(everyTs),
      '`.test.ts` の外に `it(` が 1 件も無い —— この不変条件は今日拘束していない',
    ).toBeGreaterThan(countIts(tests));
  });

  it('★ 数えない理由: __audits__ は `npm test` の include の外 (実在も確かめる)', () => {
    const audit = readOriginalSource(join(REPO, AUDIT_FILE));
    expect([...audit.matchAll(/^\s*it\(/gm)].length, `${AUDIT_FILE} に it( が無い`).toBeGreaterThanOrEqual(1);
    const vitest = readOriginalSource(join(REPO, 'vitest.config.ts'));
    expect(vitest, '`npm test` の include が読めない').toContain("include: ['src/**/__tests__/**/*.test.ts']");
    const auditCfg = readOriginalSource(join(REPO, 'vitest.audit.config.ts'));
    expect(auditCfg, '別の config が __audits__ を拾っていない').toContain('__audits__');
  });
});
