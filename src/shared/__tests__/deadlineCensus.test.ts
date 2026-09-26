import { describe, expect, it } from 'vitest';
import { join, relative, resolve, sep } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripNonCode } from './stripNonCode';

/*
 * **通信の締切に、名前の無い数を書かない。** (2026-09-15 · パス 282)
 *
 * ## 出発点 —— 判定 census が自分で認めていた穴
 *
 * `scripts/shared-judgement-census.cjs` の `httpLimits` の行はこう書いてある:
 *
 *     対称 (**部分実測**・パス 248) —— 呼び出し側の網は両ビルドに在る
 *     (パス 249 で訂正。…**ただし手で選んだ 3 経路だけで母集団の総当たりではない**)
 *
 * パス 282 でその総当たりをやったら、**認めていた穴の中に生きた欠陥が 1 件**在った。
 *
 * ## 実測した欠陥 (パス 282 で直した)
 *
 * `main/main.ts` の `app:checkUpdate` は `AbortSignal.timeout(10_000)` という
 * **裸の数**で、ブラウザ版の同じ口 (`web-shim.ts` の `checkUpdate` → `timedFetch`)
 * は `DEFAULT_HTTP_TIMEOUT_MS` (30 秒) を読んでいた —— **同じ問いに 3 倍違う締切**。
 *
 * | | 締切 | 出どころ |
 * | --- | ---: | --- |
 * | デスクトップ版 | 10 秒 | 裸の `10_000` |
 * | ブラウザ版 | 30 秒 | `DEFAULT_HTTP_TIMEOUT_MS` |
 *
 * **害の向き**: 遅い回線で先に諦めるのはデスクトップ版で、そちらは「新しい版が
 * 出た」を受けて実際に更新できる側である (ブラウザ版は自分自身を更新できない ——
 * `web-shim.ts` の注記がそう述べている)。**答えを要る方が 3 倍早く
 * 「判定不能」に倒れていた。**
 *
 * しかも同じ関数の 3 行下の注記は、2026-08-31 に**本文の上限**の食い違いを
 * 直したときのもので、そこにこう書いてある:
 *
 *     同じ問いに答えが 2 つある状態を残さない —— 実行対象が違うだけで
 *     判断が変わる理由が無い。
 *
 * **その直しは 1 行手前で止まっていた。** 原則を書いた人が、その原則を破る行を
 * 3 行上に残した形である (`controlChars.ts` の docblock が「2 つ目を作りかけた」と
 * 書いた真下に 2 つ目が在った、パス 280 と同じ形)。
 *
 * ## この検査が数えるもの
 *
 * 締切を作る 3 つの形 —— `AbortSignal.timeout(…)` / `withTimeout(…, ms, …)` /
 * `withBodyDeadline(ms, …)` —— の第 1 引数 (時間) が**名前**であること。
 * 数のリテラルは理由つきの台帳に載せる (今 0 件)。
 *
 * **名前であることしか要求しない** —— 値が両ビルドで同じかは要求しない。
 * 意図して違う締切は在る (`AI_CHAT_TIMEOUT_MS` は 2 分。通常の 30 秒では
 * 足りない、と両ビルドの注記が同じ理由を述べている)。名前が付いていれば
 * **その名前の定義に理由が書ける**し、両ビルドが同じ名前を読んでいるかは
 * 読めば分かる。裸の数にはそれができない。
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** 走査から外す枝 (検査と型定義)。 */
const SKIP_DIRS: ReadonlySet<string> = new Set(['__tests__', 'node_modules']);

/**
 * 理由つきの例外。`<file>:<行の綴り>` → 理由。
 *
 * **実測 0 件** (2026-09-15 · パス 282)。空のままにしておくのは、
 * 次に足す人が「載せる場所が在る」と分かるため —— 台帳が無いと、
 * 例外を作りたい人は走査そのものを緩める。
 */
const EXEMPT: Readonly<Record<string, string>> = {};

/**
 * 締切を作る形。**数から始まる式**が第 1 引数に来たら鳴る。
 *
 * 式の**全体**を掴む (`([0-9][0-9_.]*(?:\s*[*+]\s*[0-9][0-9_.]*)*)`) —— 最初は
 * 先頭の数だけを掴んでいて、`5 * 60_000` を `timeoutMs(5)` と報告した。
 * **5 ミリ秒に見える報せは、読む人を誤らせる** (実物は 5 分)。
 * 規則の当否は変わらないが、鳴ったときに何が起きているかが変わる。
 */
const DEADLINE_CALLS: readonly { readonly label: string; readonly re: RegExp }[] = [
  // `AbortSignal.timeout(30_000)` —— 第 1 引数が時間
  { label: 'AbortSignal.timeout', re: /AbortSignal\.timeout\(\s*(NUM)\s*\)/g },
  // `withBodyDeadline(30_000, …)` —— 第 1 引数が時間
  { label: 'withBodyDeadline', re: /withBodyDeadline\(\s*(NUM)\s*,/g },
  // `withTimeout(30_000, …)` —— shared の形 (第 1 引数が時間)
  { label: 'withTimeout', re: /\bwithTimeout\(\s*(NUM)\s*,/g },
  // `timeoutMs: 30_000` / `timeoutMs = 30_000` —— 引数と既定値
  { label: 'timeoutMs', re: /\btimeoutMs\s*[:=]\s*(NUM)/g },
].map(({ label, re }) => ({
  label,
  // `NUM` を「数から始まる算術式」へ展開する (綴りを 4 か所に写さないため)。
  re: new RegExp(re.source.replace('NUM', String.raw`[0-9][0-9_.]*(?:\s*[*+]\s*[0-9][0-9_.]*)*`), re.flags),
}));

interface Bare {
  readonly file: string;
  readonly line: number;
  readonly label: string;
  readonly value: string;
}

/** `src/**` の実装ファイル (検査と `.d.ts` を除く)。 */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (absDir: string): void => {
    for (const e of readOriginalDirEntries(absDir)) {
      const p = join(absDir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || /\.d\.ts$/.test(e.name)) continue;
      out.push(relative(REPO_ROOT, p).split(sep).join('/'));
    }
  };
  walk(join(REPO_ROOT, 'src'));
  return out;
}

/** 1 ファイルの中の「裸の締切」。コメントと文字列は落としてから見る。 */
export function bareDeadlines(rel: string, src: string): Bare[] {
  const code = stripNonCode(src);
  const found: Bare[] = [];
  const lineOf = (index: number): number => code.slice(0, index).split('\n').length;
  for (const { label, re } of DEADLINE_CALLS) {
    for (const m of code.matchAll(new RegExp(re.source, re.flags))) {
      found.push({ file: rel, line: lineOf(m.index), label, value: m[1]! });
    }
  }
  return found;
}

/** 締切を作る呼び出しの総数 (走査の生死を測るため — 名前でも数でも数える)。 */
export function deadlineCallSites(src: string): number {
  const code = stripNonCode(src);
  let n = 0;
  for (const re of [
    /AbortSignal\.timeout\(/g,
    /withBodyDeadline\(/g,
    /\bwithTimeout\(/g,
    /\btimeoutMs\s*[:=]/g,
  ]) {
    n += [...code.matchAll(re)].length;
  }
  return n;
}

describe('通信の締切', () => {
  const files = sourceFiles();

  it('走査は生きている (締切を作る呼び出しが見つかる)', () => {
    expect(files.length, '走査が死んでいる (.ts が見つからない)').toBeGreaterThanOrEqual(400);
    let sites = 0;
    for (const f of files) sites += deadlineCallSites(readOriginalSource(join(REPO_ROOT, f)));
    // 実測 24 件 (2026-09-15)。0 件を「裸の数なし」と読んではいけない。
    expect(sites, '締切を作る呼び出しが 1 つも見つからない (走査が壊れた)').toBeGreaterThanOrEqual(12);
  });

  it('★ 締切の第 1 引数はすべて名前である (裸の数は台帳のみ)', () => {
    const bare: Bare[] = [];
    for (const f of files) {
      for (const b of bareDeadlines(f, readOriginalSource(join(REPO_ROOT, f)))) {
        if (EXEMPT[`${b.file}:${b.label}(${b.value})`] !== undefined) continue;
        bare.push(b);
      }
    }
    expect(
      bare.map((b) => `${b.file}:${b.line} ${b.label}(${b.value})`),
      '締切に名前の無い数が在る —— 共有の定数を読むか、理由つきで EXEMPT に載せること',
    ).toEqual([]);
  });

  it('★ 更新確認は両ビルドが同じ締切の名前を読む (パス 282 の欠陥)', () => {
    const main = stripNonCode(readOriginalSource(join(REPO_ROOT, 'src/main/main.ts')));
    // 肯定形 —— 名前が消えれば必ず鳴る (「無いことの検査」だけにしない)。
    expect(main, 'main の更新確認が共有の締切を読んでいない').toContain(
      'AbortSignal.timeout(DEFAULT_HTTP_TIMEOUT_MS)',
    );
    /*
     * **`timedFetch` の本体だけを見る。** (対照 D で分かったこと)
     *
     * 最初は web-shim 全体に `toContain` を当てていた —— ところが
     * `withBodyDeadline(DEFAULT_HTTP_TIMEOUT_MS` は**このファイルに 2 か所**在り
     * (`:240` と `timedFetch` の `:417`)、`timedFetch` の側だけを裸の数に戻しても
     * もう一方が `toContain` を満たして**この検査は黙った**。
     * 「在ることの検査」でも、**在る場所を絞らないと空になる**。
     */
    const web = stripNonCode(readOriginalSource(join(REPO_ROOT, 'src/renderer/web-shim.ts')));
    const body = /function timedFetch\([\s\S]*?\n\}/.exec(web);
    expect(body, 'web-shim に timedFetch が見つからない (走査の死)').not.toBeNull();
    expect(body?.[0] ?? '', 'ブラウザ版の timedFetch が共有の締切を読んでいない').toContain(
      'withBodyDeadline(DEFAULT_HTTP_TIMEOUT_MS',
    );
  });

  it('規則は裸の数に当たる (空の検査になっていない)', () => {
    // ★ 実物ではなく標本に当てる —— 規則が「この形」を掴むことを示す。
    const samples: readonly [string, string][] = [
      ['a.ts', 'const r = fetch(u, { signal: AbortSignal.timeout(10_000) });'],
      ['b.ts', 'return withBodyDeadline(5000, init.signal, f);'],
      ['c.ts', 'await withTimeout(1_500, null, run);'],
      ['d.ts', 'const ctx = { timeoutMs: 250 };'],
    ];
    for (const [f, code] of samples) {
      expect(bareDeadlines(f, code).length, `規則が ${code} に当たらない`).toBe(1);
    }
    // 名前を読む形は拾わない (偽陽性を出さない)
    for (const code of [
      'AbortSignal.timeout(DEFAULT_HTTP_TIMEOUT_MS)',
      'withBodyDeadline(AI_CHAT_TIMEOUT_MS, init.signal, f)',
      'withTimeout(REQUEST_TIMEOUT_MS, null, run)',
      'const ctx = { timeoutMs: DEFAULT_HTTP_TIMEOUT_MS };',
      'timeoutMs?: number;',
    ]) {
      expect(bareDeadlines('x.ts', code), `名前を読む形を裸と読んだ: ${code}`).toEqual([]);
    }
    // コメントと文字列の中の数は拾わない
    expect(bareDeadlines('y.ts', '// AbortSignal.timeout(10_000) は裸だった')).toEqual([]);
    expect(bareDeadlines('z.ts', "const s = 'AbortSignal.timeout(10_000)';")).toEqual([]);
  });

  /*
   * 台帳が空でも**空のままであることを主張する** —— 次に誰かが例外を足したら
   * この検査が「台帳が増えた」と教える (黙って例外が生えない)。
   */
  it('例外の台帳は空で、載せるなら理由が要る', () => {
    expect(Object.keys(EXEMPT), '例外が足された —— 理由を読んでこの検査を更新すること').toEqual([]);
    for (const [k, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${k} の理由が空`).toBeGreaterThan(10);
    }
  });
});
