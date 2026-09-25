/** @vitest-environment jsdom */
/**
 * **入力の読み取りはアプリで 1 つ** (2026-09-21 · パス 374)。
 *
 * ## 見つけた物 (実測)
 *
 * `shared/readNumeric.ts` は自分の docblock で
 * 「入力欄の文字列を数にする口は 4 つあり、**全部ここを通す**」と述べている。
 * ところが `FinancialAnalysis.tsx` の**法人税・消費税の 5 欄**はその 4 つに入らず、
 * `parseFloat(x.replace(/,/g, ''))` で直接読んでいた。
 *
 * `parseFloat` は**読めた所まで読んで残りを捨てる**:
 *
 * ```
 *   '1億'     parseFloat → 1           Number → NaN
 *   '1000万'  parseFloat → 1000        Number → NaN
 *   '12abc'   parseFloat → 12          Number → NaN
 *   '12.5.6'  parseFloat → 12.5        Number → NaN
 * ```
 *
 * 下流には `isFinite` と `Math.max(0, …)` が在るが、**1 は有限で非負**なので素通りする。
 *
 * ## ★ 到達可能性は正直に測って書く (私は最初これを取り違えた)
 *
 * 最初に書いたこの docblock は「**「1億」と打つと資本金 1 円として法人税を計算する**」と
 * 述べていた。**それは偽だった。** この 5 欄は `type="number"` で、ブラウザ (と jsdom) が
 * 数字でない文字を捨てるので `'1億'` は `capitalStr` まで届かない —— **到達不能**である。
 * 気付いたのは**この検査を書いて落ちたから**で、実測すると jsdom でも
 * `type=number` の `value` に `'1億'` を入れると `''`、`type=text` なら `'1億'` だった。
 *
 * 穴を塞いでいたのは読み取りではなく**入力欄の型**で、アプリの他の 62 の数値欄は
 * `type="text" inputMode="decimal"` である —— **揃える編集を 1 つ入れた瞬間に生きる形**だった。
 * 資本金 1 億円は外形標準課税と均等割の区分が変わる境目なので、生きれば税の区分ごと変わる。
 *
 * だから直しは 2 つを同時に: ① 読み取りを共有の 1 つへ ② 入力欄を他の 62 欄と同じ形へ。
 * 読めない入力は**捨てられるのではなく ⛔ として見える**。
 *
 * 単位語を解釈しないのは方針どおり (`.cursor/rules/30-conventions.mdc`:
 * 「`万` `億` などの単位語は解釈しない」) —— 方針でないのは**黙って別の数にする**ことで、
 * `guardNumber` は同じ入力に「単位付きのため読み取れません」という文を既に持っていた。
 *
 * 法則 `center-then-count-callers` の形である ——
 * **その関数を使っている場所ではなく、同じことをしている場所を数える。**
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { readNumberOrNull } from '../../data/inputGuards';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const SRC = join(__dirname, '..', '..', '..');

/** 注記を落とす —— **綴りの言及は宣言ではない** (パス 369 と同じ理由)。 */
/**
 * `parseFloat` を出荷コードで使ってよい所。
 *
 * `chatCalc.ts` は**先に厳しい正規表現で数字だけを切り出して**から渡すので、
 * 途中で切れる余地が無い (`[0-9][0-9,]*(?:\.[0-9]+)?`)。しかも `Number.isFinite` で
 * 受け直している。**入力欄の文字列を直接渡している訳ではない。**
 */
const PARSE_FLOAT_ALLOWED: Readonly<Record<string, string>> = {
  'renderer/data/chatCalc.ts':
    '数字だけを正規表現で切り出してから渡す (途中で切れる余地が無い) + Number.isFinite で受け直す',
};

function shippingSources(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...shippingSources(full));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function parseFloatUsers(): string[] {
  return shippingSources()
    .filter((f) => /parseFloat\s*\(/.test(stripComments(readOriginalSource(f))))
    .map((f) => f.slice(SRC.length + 1).split(/[\\/]/).join('/'))
    .sort();
}

function makeUnit(): FinancialUnit {
  return {
    id: 'p374',
    label: 'パス 374 の事業',
    current: { revenue: 50_000_000, variableCost: 20_000_000, fixedCost: 15_000_000, profit: 10_000_000, profitMargin: 20 },
    history: [],
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

function typeInto(sel: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(sel);
  if (!input) throw new Error(`${sel} not found`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FinancialAnalysis, { units: [makeUnit()] }));
  });
}

describe('入力の読み取りはアプリで 1 つ (パス 374)', () => {
  it('★ 見つけた形そのもの: parseFloat は途中で切るが、共有の読み取りは切らない', () => {
    // **これは JavaScript の仕様であって、直したのは呼び方のほう。**
    expect(parseFloat('1億'), 'parseFloat が「1億」を 1 と読まない環境になった').toBe(1);
    expect(parseFloat('1000万')).toBe(1000);
    expect(parseFloat('12abc')).toBe(12);
    // 共有の読み取りは**読めないと言う** (0 や別の数に倒さない)。
    expect(readNumberOrNull('1億'), '単位語を黙って読み替えている').toBeNull();
    expect(readNumberOrNull('1000万')).toBeNull();
    expect(readNumberOrNull('12abc')).toBeNull();
    // 正当な入力は今までどおり読める。
    expect(readNumberOrNull('10000000')).toBe(10_000_000);
    expect(readNumberOrNull('10,000,000')).toBe(10_000_000);
  });

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(shippingSources().length, '出荷ソースを集められていない').toBeGreaterThan(200);
    // 標本: 針が実際の綴りに当たる。
    expect(/parseFloat\s*\(/.test(stripComments('const n = parseFloat(x);')), '針が当たらない').toBe(true);
    // 標本: 注記の中の言及は数えない。
    expect(/parseFloat\s*\(/.test(stripComments('/** ここは parseFloat(x) だった */')), '注記を数えている').toBe(false);
  });

  it('★ 出荷コードで parseFloat を使う所は台帳どおり (双方向)', () => {
    const users = parseFloatUsers();
    expect(users.filter((f) => !Object.hasOwn(PARSE_FLOAT_ALLOWED, f)), '台帳に無い parseFloat').toEqual([]);
    expect(Object.keys(PARSE_FLOAT_ALLOWED).filter((f) => !users.includes(f)), '台帳の古い行').toEqual([]);
    for (const [f, why] of Object.entries(PARSE_FLOAT_ALLOWED)) {
      expect(why.length, `${f}: 理由が無い`).toBeGreaterThan(10);
    }
  });

  it('★ 「1億」を打つと ⛔ が出る (黙って 1 円にしない)', async () => {
    await mount();
    await act(async () => {
      typeInto('#ctax-capital', '1億');
    });
    const issue = container.querySelector('[data-ctax-issue="資本金"]');
    expect(issue, '⛔ が出ていない').not.toBeNull();
    expect(issue?.textContent ?? '', '理由を言っていない').toContain('単位');
    expect(issue?.getAttribute('role'), '読み上げに乗らない').toBe('alert');
  });

  it('★ 対照: 読める値なら ⛔ は出ない (門が広すぎない)', async () => {
    await mount();
    await act(async () => {
      typeInto('#ctax-capital', '10000000');
    });
    expect(container.querySelector('[data-ctax-issue="資本金"]'), '正当な値に ⛔ が出ている').toBeNull();
  });

  it('★ 5 欄はアプリの他の数値欄と同じ形 (type=number へ戻すと ⛔ が見えなくなる)', async () => {
    await mount();
    for (const id of ['ctax-capital', 'ctax-employees', 'ctax-carryforward', 'ct-sales', 'ct-purchases']) {
      const input = container.querySelector<HTMLInputElement>(`#${id}`);
      expect(input, `${id} が無い`).not.toBeNull();
      expect(input?.getAttribute('type'), `${id}: type=number はブラウザが読めない字を捨てるので ⛔ が出せない`).toBe('text');
      expect(input?.getAttribute('inputmode'), `${id}: スマホで数字キーボードが出ない`).toBe('decimal');
    }
  });

  it('★ 消費税の 2 欄も同じ読み取りを通る', async () => {
    await mount();
    await act(async () => {
      typeInto('#ct-sales', '1000万');
    });
    expect(container.querySelector('[data-ctax-issue="課税売上"]'), '課税売上が素通りしている').not.toBeNull();
  });
});
