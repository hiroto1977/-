/** @vitest-environment jsdom */
/**
 * **入力欄の文字列を数にする口は、アプリで 1 つ** (2026-09-21 · パス 375)。
 *
 * ## 見つけた物 (実測)
 *
 * `shared/readNumeric.ts` は自分の docblock で
 * 「入力欄の文字列を数にする口は **4 つ**あり、**全部ここを通す**」と述べ、
 * その 4 つを名指ししている。**測ると偽だった。**
 *
 * 数値入力 (`inputMode` を持つ `<input>` と `<GuardedNumber>`) を走査すると
 * **13 ファイル / 119 欄**。そこから読み手を辿ると、`readNumeric` を通らない
 * 口が **3 つ**、呼び出しが **7 か所**在った:
 *
 * ```
 *   parseAmountInput   (components/serviceActionUtils.ts)  TaxPage ×3 / WelfareSchemeCard / ServiceActionPanel
 *   parseNumericInput  (data/eligibility.ts)               EligibilityChecker ×2
 *   Number()           (pages/OverviewPage.tsx:861)        目標利益
 * ```
 *
 * ## ★ いちばん重いのは `TaxPage` —— **同じ画面が 2 つの読み手を使っていた**
 *
 * `TaxPage` は 61 か所を `readNumber` (= `readNumeric`) で読み、**関門
 * (`guardAll` → `GuardSummary`) もその読み手で判定する**。ところが
 * ①課税所得 / ②額面年収 / 目標手取り の 3 欄だけは `parseAmountInput` で読む。
 * しかも同じファイルの 275 行目に
 * 「読み取りは inputGuards に統一し、下の `GuardSummary` と同じ関数で判定する」
 * と**書いてある** —— 統一したと述べたまま、3 欄が残っていた。
 *
 * 2 つの読み手は同じ入力に別の答えを返す (実測・26 標本中 11 で不一致):
 *
 * ```
 *   入力          readNumeric   parseAmountInput
 *   '5,000,00'    null          500000        桁区切りの位置が違う
 *   '500円'        500           REFUSE        単位つき
 *   '30 000'      null          30000         空白区切り
 *   '1 2 3'       null          123           2 つの数の連結
 *   '50%'         50            REFUSE
 * ```
 *
 * **関門の文面が嘘になる。** `GuardSummary` は
 * 「読み取れなかった欄は **0 として計算されています**。下の数字はその前提の値です。」
 * と述べる。ところが `'5,000,00'` を課税所得に打つと ——
 *
 * | | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | `GuardSummary` | ⛔「0 として計算されています」 | ⛔ 同じ |
 * | 所得税のタイル | **¥25,525** | **¥0** |
 *
 * 逆向きも在る。`'5,000,000円'` は `readNumeric` が読めるので **⛔ が 1 つも
 * 出ず**、それでも計算は `parseAmountInput` が断って 0 に倒すので所得税は ¥0。
 * **関門が「問題ありません」と保証した欄を、計算は捨てていた。**
 *
 * どちらの向きも、法則 `escape-hatch-stays-open` が守る「利用者が気付ける」を
 * 壊す —— 画面は自信のある数字を出し、断りは別の欄について語っている。
 *
 * ## 直し —— 呼び出し側ではなく口を塞ぐ
 *
 * 7 か所を 1 つずつ書き換えるのではなく、`parseAmountInput` /
 * `parseNumericInput` の**中身**を `readNumeric` へ委ねた (返り値の形は各々の
 * 呼び手が要るので変えない: `AmountParse` は「未入力」と「読めない」を分け、
 * `parseNumericInput` は `number | null`)。`Number(targetProfit)` だけは
 * 口ではなく素の呼び出しなので `readNumberOrNull` に替えた。
 *
 * これで**どちらの向きにも緩くならない**: `parseAmountInput` が受けていた
 * `'1,23'` / `'30 000'` は断るようになり (`readNumeric.ts` が 2026-09-06 に
 * 「別の数になる」と実測した形)、`parseNumericInput` が受けていた
 * `'1e3'` / `'0x10'` / `'.5'` も断る。逆に `'500円'` / `'50%'` は読めるようになる。
 *
 * ## 機械
 *
 * 母集団は**走査で導く** (手書きの一覧を持たない)。読み手は台帳と**両方向**で、
 * どの読み手も `readNumeric` へ辿り着くことを要求する。
 *
 * ★ **最初に書いた走査は母集団の 1/3 を見ていなかった** —— `<input\b[^>]*?>` で
 * 要素を切っていたので `onChange={(e) => …}` の**矢印の `>`** で切れ、
 * `inputMode` がその後ろに在る欄が丸ごと映らなかった (EligibilityChecker と
 * ServiceActionPanel は 1 件も見えず、RealEstatePage は 13/17)。
 * 波括弧の深さを数える形に直し、**その形の標本**を下に置く (パス 334 / 348 と同じ家系)。
 */
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { readNumeric } from '../../shared/readNumeric';
import { parseAmountInput } from '../components/serviceActionUtils';
import { parseNumericInput } from '../data/eligibility';
import { waitForElement, waitForText } from './jsdomWait';
import { resetRecordStore } from './recordStoreHarness';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const SRC = join(__dirname, '..', '..');

/** 注記を落とす —— **綴りの言及は宣言ではない** (法則 `mention-vs-declaration`)。 */
/**
 * `<tag` から、**波括弧の外に在る**最初の `>` までを 1 要素として切り出す。
 *
 * 深さを数えるのが肝 —— JSX の属性値は `onChange={(e) => …}` のように
 * `>` を含むので、`[^>]*?>` だと**属性の途中で切れる**。
 */
export function elements(src: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`;
  for (let i = 0; (i = src.indexOf(open, i)) !== -1; i += 1) {
    if (/[A-Za-z0-9_]/.test(src[i + open.length] ?? '')) continue;
    let depth = 0;
    for (let j = i + open.length; j < src.length; j += 1) {
      const ch = src[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        out.push(src.slice(i, j + 1));
        i = j;
        break;
      }
    }
  }
  return out;
}

function tsxFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...tsxFiles(full));
    } else if (e.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

export type NumericInputFile = { readonly file: string; readonly fields: number; readonly readers: readonly string[] };

/** 数値入力を持つファイルと、その欄に当てられている読み手の名前。 */
export function numericInputFiles(): NumericInputFile[] {
  const out: NumericInputFile[] = [];
  for (const f of tsxFiles()) {
    const c = stripComments(readOriginalSource(f));
    const vars = new Set<string>();
    for (const el of elements(c, 'input')) {
      if (!/inputMode/.test(el)) continue;
      const v = /value=\{([A-Za-z0-9_.]+)\}/.exec(el);
      if (v?.[1] !== undefined) vars.add(v[1]);
    }
    for (const el of elements(c, 'GuardedNumber')) {
      const v = /value=\{([^}]+)\}/.exec(el);
      if (v?.[1] !== undefined) vars.add(v[1].trim());
    }
    if (vars.size === 0) continue;
    const readers = new Set<string>();
    for (const v of vars) {
      const re = new RegExp(`([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      for (const m of c.matchAll(re)) if (m[1] !== undefined) readers.add(m[1]);
    }
    out.push({
      file: f.slice(SRC.length + 1).split(/[\\/]/).join('/'),
      fields: vars.size,
      readers: [...readers].sort(),
    });
  }
  return out.sort((a, b) => b.fields - a.fields || a.file.localeCompare(b.file));
}

/**
 * 読み手の名前 → 何を通って `readNumeric` に届くか。
 *
 * **両方向**に検査する: 走査で出た読み手が台帳に無ければ落ち、台帳に在るのに
 * 走査から消えても落ちる (消えた行は、次に足された 1 つを隠す)。
 */
const READER_LEDGER: Readonly<Record<string, string>> = {
  guardNumber: 'inputGuards.guardNumber → readNumeric (関門そのもの)',
  n: 'OverviewPage の別名 = readNumberOr0 → readNumeric',
  num: 'TaxPage / WelfareSchemeCard の局所ヘルパ。どちらも readNumeric を読む',
  parseAmountInput: 'components/serviceActionUtils.ts。中身を readNumeric へ委ねた (パス 375)',
  parseNumericInput: 'data/eligibility.ts。中身を readNumeric へ委ねた (パス 375)',
  readNumber: 'inputGuards が re-export する readNumeric そのもの',
  readNumberOr0: 'inputGuards.readNumberOr0 → readNumeric ?? 0',
  readNumberOrNull: 'inputGuards.readNumberOrNull → readNumeric',
  reNum: 'RealEstatePage の別名 = readNumberOr0 → readNumeric',
  reNumOrNull: 'RealEstatePage の別名 = readNumberOrNull → readNumeric',
};

/** 走査に出た欄のうち、読み手が 1 つも当たらないファイル (値を丸ごと下へ渡す形)。 */
const NO_LOCAL_READER: Readonly<Record<string, string>> = {
  'renderer/components/ManualDataSection.tsx':
    'draft オブジェクトごと businessUnits.ts へ渡す (そちらが readNumeric を読む)',
  'renderer/pages/HydroponicsPage.tsx':
    '欄は HYDROPONICS_CONTROL_SPECS / 作物の下書きへ渡り、readControlRecord と parseCropNumber が読む',
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

beforeEach(async () => {
  // **隔離は `resetRecordStore()` で行う** —— `_resetRecordStoreForTests()` は
  // singleton を捨てるだけで IndexedDB は残る (パス 170 の経緯)。
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const says = (needle: string): boolean => text().includes(needle);

async function mountTax(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'tax');
  if (!def) throw new Error('tax service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(text, '課税所得 (年, 円)');
}

/** ① 課税所得の欄に打つ。`placeholder` で引く (この欄は `aria-label` を持たない)。 */
async function typeIncome(value: string): Promise<void> {
  const input = await waitForElement<HTMLInputElement>(
    () => container.querySelector<HTMLInputElement>('input[placeholder="例: 5,000,000"]'),
    '課税所得の入力欄',
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 「所得税 (速算表 …)」のタイルの値。形で拾う (`Stat` は印を持たない)。 */
function incomeTaxTile(): string {
  for (const el of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(el.children);
    const [head, tail] = kids;
    if (kids.length !== 2 || head === undefined || tail === undefined) continue;
    if (head.children.length !== 0 || tail.children.length !== 0) continue;
    if ((head.textContent ?? '').startsWith('所得税 (速算表')) return tail.textContent ?? '';
  }
  throw new Error('所得税のタイルが見つからない');
}

describe('入力欄の文字列を数にする口は 1 つ (パス 375)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    const files = numericInputFiles();
    expect(files.length, '数値入力を持つファイルを集められていない').toBeGreaterThanOrEqual(10);
    expect(files.reduce((a, b) => a + b.fields, 0), '欄の総数が少なすぎる').toBeGreaterThanOrEqual(100);
  });

  it('★ 要素の切り出しが矢印関数の `>` で切れない (最初の針が落とした形)', () => {
    const sample = '<input\n  value={x}\n  onChange={(e) => setX(e.target.value)}\n  inputMode="decimal"\n/>';
    const [el] = elements(sample, 'input');
    expect(el, '要素を切り出せていない').toBeDefined();
    expect(el ?? '', '矢印の > で切れている (inputMode が見えない)').toContain('inputMode');
    // 対照: 深さを数えない素朴な針だと、同じ標本で inputMode が見えない。
    expect(/<input\b[^>]*?>/s.exec(sample)?.[0] ?? '', '素朴な針が当たってしまう').not.toContain('inputMode');
  });

  it('★ 注記の中の言及は数えない', () => {
    expect(elements(stripComments('/* <input inputMode="decimal" value={x} /> */'), 'input')).toEqual([]);
  });

  it('★ 読み手の台帳は双方向 (走査 ↔ 台帳)', () => {
    const seen = new Set(numericInputFiles().flatMap((f) => f.readers));
    expect([...seen].filter((r) => !Object.hasOwn(READER_LEDGER, r)).sort(), '台帳に無い読み手').toEqual([]);
    expect(Object.keys(READER_LEDGER).filter((r) => !seen.has(r)).sort(), '台帳の古い行').toEqual([]);
    for (const [r, why] of Object.entries(READER_LEDGER)) {
      expect(why.length, `${r}: 理由が無い`).toBeGreaterThan(10);
    }
  });

  it('★ 読み手が 1 つも当たらないファイルは台帳どおり (双方向)', () => {
    const none = numericInputFiles().filter((f) => f.readers.length === 0).map((f) => f.file).sort();
    expect(none.filter((f) => !Object.hasOwn(NO_LOCAL_READER, f)), '台帳に無い「読み手なし」').toEqual([]);
    expect(Object.keys(NO_LOCAL_READER).filter((f) => !none.includes(f)).sort(), '台帳の古い行').toEqual([]);
  });

  it('★ どの読み手も readNumeric へ辿り着く (素の Number / parseFloat / parseInt で読まない)', () => {
    const offenders: string[] = [];
    for (const f of numericInputFiles()) {
      for (const r of f.readers) {
        if (r === 'Number' || r === 'parseFloat' || r === 'parseInt') offenders.push(`${f.file}: ${r}`);
      }
    }
    expect(offenders, '入力欄を素のパーサで読んでいる').toEqual([]);
  });

  it('★ 3 つの入口が同じ答えを出す (口を塞いだので分岐しない)', () => {
    const samples = ['5,000,00', '500円', '30 000', '1 2 3', '1e3', '0x10', '.5', '1,23', '50%', '1,000', '-5', '12.5.6'];
    for (const s of samples) {
      const want = readNumeric(s);
      const p = parseAmountInput(s);
      expect(p.ok ? (p.value ?? null) : null, `parseAmountInput が readNumeric と違う答え: ${JSON.stringify(s)}`).toBe(want);
      expect(parseNumericInput(s), `parseNumericInput が readNumeric と違う答え: ${JSON.stringify(s)}`).toBe(want);
    }
    // 対照: 標本が実際に「読めない」側を含む (全部読めるなら何も測っていない)。
    expect(samples.filter((s) => readNumeric(s) === null).length, '読めない標本が無い').toBeGreaterThanOrEqual(6);
  });

  it('★ 「未入力」と「読めない」は分けたまま (parseAmountInput の返り値の形)', () => {
    expect(parseAmountInput(''), '空欄が「読めない」に倒れている').toEqual({ ok: true });
    expect(parseAmountInput('   '), '空白だけの欄が「読めない」に倒れている').toEqual({ ok: true });
    expect(parseAmountInput('1億'), '読めない入力が通っている').toEqual({ ok: false });
  });

  it('★ 関門が ⛔ と言ったら、計算も 0 で行う (TaxPage ①)', async () => {
    await mountTax();
    await typeIncome('5,000,00'); // 桁区切りの位置が違う —— readNumeric は読まない
    await waitForText(text, '読み取れなかった欄は 0 として計算されています');
    expect(
      incomeTaxTile(),
      '⛔ を出しながら別の数 (parseAmountInput が読んだ 500000) で計算している',
    ).toBe('¥0');
  });

  it('★ 関門が黙ったら、計算もその数で行う (TaxPage ①)', async () => {
    await mountTax();
    await typeIncome('5,000,000円'); // 単位つき —— readNumeric は 5,000,000 と読む
    expect(says('読み取れなかった欄は 0 として計算されています'), '読める欄に ⛔ が出ている').toBe(false);
    expect(
      incomeTaxTile(),
      '関門が「問題なし」と言った欄を、計算が捨てて 0 にしている',
    ).not.toBe('¥0');
  });

  it('★ 対照: 素直な入力は今までどおり (門が広すぎない)', async () => {
    await mountTax();
    await typeIncome('5,000,000');
    expect(says('読み取れなかった欄は 0 として計算されています'), '正当な入力に ⛔ が出ている').toBe(false);
    expect(incomeTaxTile()).not.toBe('¥0');
  });
});
