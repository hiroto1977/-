/** @vitest-environment jsdom */
/**
 * **関門の無い数値の欄は、読めない値を黙って「空欄」「0」「読めた数」として扱わない**
 * (2026-09-27 · パス 493q)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 関門 (`GuardedNumber` —— `input[data-guard]`) を通らない**素の数値入力**が、読めない値を
 * 黙って読んでいた。どれも画面は自信のある答えを出し、読めなかったことを 1 文も言わない:
 *
 * | 画面 | 欄 | 打った物 | 画面が言ったこと |
 * | --- | --- | --- | --- |
 * | 経営サマリー | 養液 EC | `1,2` / `1.0mS` | **「範囲外です — EC は 0.8〜1.2 mS/cm が目安」** (EC 0 として判定) |
 * | 経営サマリー | 目標営業利益 | `100万` | 何も言わずに逆算を出さない |
 * | 制度判定 (funding) | 年齢 | `66歳` | **「年齢が未入力」** —— 答えそのものが 6 制度ぶん動く |
 * | 同上 | 年齢 | `-5` | 「年齢 -5 歳は要件（49歳以下）を満たす」 |
 *
 * 4 つとも関門へ移した (`nutrientCheckGuard.test.ts` / `sensitivityMarginOnScreen.test.ts` /
 * `eligibilityGuard.test.ts`)。**この検査は、残りの素の欄が同じ形をしていないことを全画面で見る。**
 *
 * ## 振る舞いで判じる (綴りでは判じない)
 *
 * 素の欄が「どの読み手で読むか」は `numericInputReaderCensus.test.ts` が静的に数える。だが
 * 読み手が正しくても、**読めなかったことを画面が言うか**は読み手の外 (呼ぶ側) で決まる ——
 * `readNumberOrNull` は正しい読み手で、それでも制度判定は「未入力」と言っていた。だから描いて打つ:
 *
 * 1. 読めない値 (`7x` —— 読める数 `7` の後ろに語が付いた形。素の `parseFloat` は 7 と読む) を打つ。
 *    画面がその値を**引用する** (「「7x」を数値として読み取れません」) か、欄が自分に
 *    `aria-invalid="true"` を立てれば、その欄は**言っている** (`speaks`)。
 * 2. 言っていなければ、読める値 (`7`)・空欄・`0` の画面と比べる。読める値で画面が動く欄
 *    (= 打った値が答えに効く欄) で、読めない値の画面が空欄 / `0` / 読める値のどれかと
 *    **同じ**なら、その欄は読めない値を黙ってそれとして読んでいる (`silent-as-*`)。
 * 3. 読める値でも画面が動かない欄は、同じ画面の他の素の欄を埋めて (`7`) もう 1 度測る ——
 *    養液 EC は pH が空だと判定そのものを出さないので、1 欄ずつでは効きが見えない。
 *    それでも動かない欄は**押したときに書き手が読む下書き** (`inert`) で、台帳が書き手を名指しする。
 *
 * ## 母集団と、見えない欄
 *
 * 母集団は**描いた直後に在る**素の数値入力 (`inputmode` を持つか `type="number"` で、
 * `data-guard` を持たない物) を全画面 (`SERVICES`) から採る —— 手で並べない。空の保管層では
 * 描かれない欄 (目標営業利益は KPI 実績が在るときだけ出る) はこの走査に映らないので、
 * それぞれの画面の検査が持つ。待ちは**条件で**行う (`quiesce` —— パス 369)。
 */
import 'fake-indexeddb/auto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { installPageRenderGlobals } from './pageRenderHarness';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil } from './jsdomWait';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

/** 1 つの欄に読めない値を打った後の姿と、比べる画面。 */
export interface RawScreens {
  /** 打った読めない値。 */
  readonly token: string;
  readonly tokenText: string;
  /** 読めない値を打った後の `aria-invalid`。 */
  readonly tokenInvalid: boolean;
  /** 言っていないときだけ測る (言っていれば比べる必要が無い)。 */
  readonly readableText?: string;
  readonly emptyText?: string;
  readonly zeroText?: string;
}

export type RawVerdict = 'speaks' | 'silent-as-blank' | 'silent-as-zero' | 'silent-as-readable' | 'third' | 'inert';

/**
 * **その欄が読めない値をどう扱ったかを判じる。** 純関数なので、下の対照が標本を食わせて確かめる。
 *
 * - `speaks` —— 値を引用するか、欄が `aria-invalid` を立てた
 * - `silent-as-*` —— 打った値が答えに効く欄で、読めない値の画面が空欄 / 0 / 読める値の画面と同じ
 * - `inert` —— 読める値でも画面が動かず、読めない値でも動かない (押したときに読む下書き)
 * - `third` —— 言わずに、どの画面とも違う画面を出した (読めない値を別の何かとして読んだ)
 */
export function classifyRaw(s: RawScreens): RawVerdict {
  if (s.tokenText.includes(s.token) || s.tokenInvalid) return 'speaks';
  const { readableText, emptyText, zeroText } = s;
  if (readableText === undefined || emptyText === undefined || zeroText === undefined) {
    throw new Error('言っていない欄は、読める値・空欄・0 の画面と比べる');
  }
  const live = readableText !== emptyText;
  const asBlank = s.tokenText === emptyText;
  const asZero = s.tokenText === zeroText;
  const asReadable = s.tokenText === readableText;
  if (!live) return asBlank || asZero || asReadable ? 'inert' : 'third';
  if (asBlank) return 'silent-as-blank';
  if (asZero) return 'silent-as-zero';
  if (asReadable) return 'silent-as-readable';
  return 'third';
}

interface RawProbe {
  readonly key: string;
  readonly type: string;
  /** 他の素の欄を埋めて測り直したか。 */
  readonly context: 'original' | 'filled';
  readonly verdict: RawVerdict;
  readonly screens: RawScreens;
}

/**
 * **打っても画面が変わらない欄** —— 押したときに書き手が読む下書き。鍵は `画面|欄`。
 * 書き手は `file` の中で呼ばれていることを原文で確かめる (名前だけの台帳にしない)。
 * 両方向: 走査で `inert` に出た欄 ⇔ 台帳の行。
 */
interface DraftRow {
  readonly file: string;
  readonly writer: string;
  readonly why: string;
}

const AMOUNT_ROW: DraftRow = {
  file: 'renderer/components/ServiceActionPanel.tsx',
  writer: 'parseAmountInput',
  why: '「メモを記録」を押したときに読み、読めなければ「amount は数値で入力してください」と断って送らない',
};
const FUND_ROW: DraftRow = {
  file: 'renderer/pages/MutualFundsPage.tsx',
  writer: 'parseHoldingEntry',
  why: '「追加」を押したときに書き手が読み、読めない欄を名指しして断る (保存しない)',
};
const CROP_ROW: DraftRow = {
  file: 'renderer/pages/OverviewPage.tsx',
  writer: 'parseCropNumber',
  why: '品目の「追加」を押したときに読む (読めなければ NaN → `addCrop` の `cropIssues` が欄を名指しして断る)',
};
const READING_ROW: DraftRow = {
  file: 'renderer/pages/HydroponicsPage.tsx',
  writer: 'parseReading',
  why: '「記録」を押したときに読み、読めない欄を名指しして断る (保存しない)',
};

const DRAFT_LEDGER: Readonly<Record<string, DraftRow>> = Object.freeze({
  'real-estate|(placeholder) 金額 (任意)': AMOUNT_ROW,
  'mutual-funds|(placeholder) 金額 (任意)': AMOUNT_ROW,
  'mutual-funds|口数': FUND_ROW,
  'mutual-funds|基準価額 (1万口)': FUND_ROW,
  'mutual-funds|評価額 (円)': FUND_ROW,
  'mutual-funds|取得額 (任意・円)': FUND_ROW,
  'mutual-funds|YTD % (任意)': FUND_ROW,
  'overview|育苗日数 (日)': CROP_ROW,
  'overview|定植後日数 (日)': CROP_ROW,
  'overview|収穫重量 (g/株)': CROP_ROW,
  'overview|養液 EC 下限 (mS/cm)': CROP_ROW,
  'overview|養液 EC 上限 (mS/cm)': CROP_ROW,
  'overview|養液 pH 下限': CROP_ROW,
  'overview|養液 pH 上限': CROP_ROW,
  'overview|パネル穴数 (株/枚)': CROP_ROW,
  'hydroponics|養液 EC (mS/cm)': READING_ROW,
  'hydroponics|養液 pH': READING_ROW,
  'hydroponics|養液温度 (℃)': READING_ROW,
  'hydroponics|室温 (℃)': READING_ROW,
  'hydroponics|相対湿度 (%)': READING_ROW,
  'hydroponics|CO₂ 濃度 (ppm)': READING_ROW,
  'hydroponics|溶存酸素 (mg/L)': READING_ROW,
  'hydroponics|養液タンク液位 (%)': READING_ROW,
  'hydroponics|パネル枚数': {
    file: 'renderer/pages/HydroponicsPage.tsx',
    writer: 'parseBatch',
    why: 'ロットの「追加」を押したときに読み、1 以上の整数でなければ断る (保存しない)',
  },
});

/**
 * **黙って読む欄のうち、理由があって残す物** (両方向)。今日は 0 件 —— 増やすなら、
 * なぜ黙ってよいか (その答えが利用者を誤らせない理由) を書く。
 */
const SILENT_LEDGER: Readonly<Record<string, string>> = Object.freeze({});

// --- 走査 -----------------------------------------------------------------

let container: HTMLDivElement;
let root: Root | null = null;
const probes: RawProbe[] = [];
/** どの画面にも `NaN` / `Infinity` が出ていないこと (欄を打った後の全画面)。 */
const nanScreens: string[] = [];

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 画面が落ち着くまで待つ —— DOM が `stable` 周続けて変わらないこと (条件の待ち)。 */
async function quiesce(label: string, stable = 3): Promise<void> {
  let last = '';
  let same = 0;
  await settleUntil(
    () => {
      const now = container.innerHTML;
      same = now === last ? same + 1 : 0;
      last = now;
      return same >= stable;
    },
    label,
    { stepMs: 0, timeoutMs: 10_000 },
  );
}

function squash(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** 画面の文。時計の数字は打った値と無関係に動くので除く (`data-live-clock`)。 */
function screenText(): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const n of Array.from(clone.querySelectorAll('[data-live-clock]'))) n.remove();
  return squash(clone.textContent);
}

/** 素の数値入力 —— 関門 (`data-guard`) を持たず、数を打つ欄として描かれた物。 */
function rawInputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input')).filter(
    (el) => !el.hasAttribute('data-guard') && (el.hasAttribute('inputmode') || el.type === 'number'),
  );
}

/** 欄の名前 —— `aria-label`・包む `<label>`・直前の `<label>`・placeholder の順。 */
function nameOf(el: HTMLInputElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const wrap = el.closest('label');
  const wrapText = squash(wrap?.textContent);
  if (wrapText) return wrapText.slice(0, 60);
  const prev = el.previousElementSibling;
  if (prev?.tagName === 'LABEL') {
    const t = squash(prev.textContent);
    if (t) return t.slice(0, 60);
  }
  const ph = el.getAttribute('placeholder');
  return ph ? `(placeholder) ${ph}` : '(名前なし)';
}

async function type(index: number, value: string, label: string): Promise<{ text: string; invalid: boolean }> {
  const el = rawInputs()[index];
  if (!el) throw new Error(`欄 ${index} (${label}) が消えた`);
  await act(async () => {
    setValue(el, value);
  });
  await quiesce(`${label} に ${JSON.stringify(value)} を打った画面`);
  const text = screenText();
  if (/\bNaN\b|Infinity/.test(text)) nanScreens.push(`${label} = ${JSON.stringify(value)}`);
  return { text, invalid: rawInputs()[index]?.getAttribute('aria-invalid') === 'true' };
}

/** 1 欄を測る。元の値へ戻すかは呼び手が決める (埋めた画面は測り終えたら捨てる)。 */
async function measure(index: number, label: string, restore: boolean): Promise<RawScreens> {
  const original = rawInputs()[index]?.value ?? '';
  const readable = original === '7' ? '8' : '7';
  const token = `${readable}x`;
  const t = await type(index, token, label);
  let screens: RawScreens = { token, tokenText: t.text, tokenInvalid: t.invalid };
  if (classifyRawOrNull(screens) !== 'speaks') {
    const r = await type(index, readable, label);
    const e = await type(index, '', label);
    const z = await type(index, '0', label);
    screens = { ...screens, readableText: r.text, emptyText: e.text, zeroText: z.text };
  }
  if (restore) await type(index, original, label);
  return screens;
}

/** 言っているかだけを見る (比べる画面がまだ無いとき)。 */
function classifyRawOrNull(s: RawScreens): 'speaks' | null {
  return s.tokenText.includes(s.token) || s.tokenInvalid ? 'speaks' : null;
}

beforeAll(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  for (const def of SERVICES) {
    await resetRecordStore();
    _resetCollectionSubscribersForTests();
    _resetNavigationIntentForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    try {
      const r = root;
      await act(async () => {
        r.render(createElement(def.page));
      });
      await quiesce(`${def.id} を描いた画面`, 5);
      const count = rawInputs().length;
      const keys: string[] = [];
      const seen = new Map<string, number>();
      for (let i = 0; i < count; i += 1) {
        const el = rawInputs()[i];
        if (!el) throw new Error(`${def.id}: 欄 ${i} が消えた`);
        const base = nameOf(el);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        keys.push(`${def.id}|${n === 1 ? base : `${base} #${n}`}`);
      }
      const inert: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const key = keys[i]!;
        const screens = await measure(i, key, true);
        const verdict = classifyRaw(screens);
        if (verdict === 'inert') inert.push(i);
        else probes.push({ key, type: rawInputs()[i]?.type ?? '?', context: 'original', verdict, screens });
      }
      if (inert.length > 0) {
        // 他の素の欄を読める値で埋めてから測り直す —— 2 欄そろって初めて答えが出る判定
        // (養液 EC と pH) は、1 欄ずつでは効きが見えない。
        for (let i = 0; i < count; i += 1) await type(i, '7', `${keys[i]!} を埋める`);
        for (const i of inert) {
          const key = keys[i]!;
          const screens = await measure(i, key, false);
          probes.push({ key, type: rawInputs()[i]?.type ?? '?', context: 'filled', verdict: classifyRaw(screens), screens });
        }
      }
    } finally {
      if (root !== null) {
        const rr = root;
        root = null;
        await act(async () => {
          rr.unmount();
        });
      }
      container.remove();
    }
  }
}, 600_000);

afterAll(() => {
  vi.restoreAllMocks();
});

// --- 主張 -----------------------------------------------------------------

const SRC = join(__dirname, '..', '..');
const keysOf = (v: RawVerdict | readonly RawVerdict[]): string[] => {
  const want = new Set(Array.isArray(v) ? v : [v]);
  return probes.filter((p) => want.has(p.verdict)).map((p) => p.key).sort();
};
const SILENT: readonly RawVerdict[] = ['silent-as-blank', 'silent-as-zero', 'silent-as-readable'];

describe('関門の無い数値の欄は、読めない値を黙って読まない (パス 493q)', () => {
  it('★ 走査が痩せていない (欄の数・画面の数・言っている欄の数)', () => {
    // 実測 (2026-09-27): 6 画面 235 欄 —— 言っている 211 (設定の数値パラメータ 150 は `aria-invalid`、
    // 税金の画面 56 と決算書の 5 欄は関門のまとめ表示が値を引用する) / 下書き 24 (どれも埋め直しの段で判じた) /
    // 黙る 0 / 別の何か 0。
    // 床は実測に張り付けない (直した日に落ちる門にしない) —— 走査が死んでいないことだけを見る。
    expect(probes.length).toBeGreaterThanOrEqual(150);
    expect(new Set(probes.map((p) => p.key.split('|')[0])).size).toBeGreaterThanOrEqual(4);
    expect(keysOf('speaks').length).toBeGreaterThanOrEqual(150);
    // 言っている欄の両方の形が母集団に在る (片方だけなら、もう片方の判じ方は測っていない)
    expect(probes.filter((p) => p.verdict === 'speaks' && p.screens.tokenInvalid).length).toBeGreaterThanOrEqual(20);
    expect(probes.filter((p) => p.verdict === 'speaks' && !p.screens.tokenInvalid).length).toBeGreaterThanOrEqual(20);
    // 埋め直しの段が実際に走っている (下書きはそこでしか判じられない)
    expect(probes.filter((p) => p.context === 'filled').length).toBeGreaterThanOrEqual(10);
  });

  it('★ 打った値が答えに効く欄で、読めない値を黙って空欄 / 0 / 読めた数として読む欄が無い (台帳の外)', () => {
    const silent = probes
      .filter((p) => SILENT.includes(p.verdict) && !Object.hasOwn(SILENT_LEDGER, p.key))
      .map((p) => `${p.key} [${p.context}] ${p.verdict}`);
    expect(silent).toEqual([]);
  });

  it('★ 黙る欄の台帳は両方向 (走査 ⇔ 台帳)', () => {
    expect(keysOf(SILENT)).toEqual(Object.keys(SILENT_LEDGER).sort());
  });

  it('★ 言わずに別の画面を出す欄 (読めない値を何か別の物として読んだ) が無い', () => {
    expect(keysOf('third')).toEqual([]);
  });

  it('★ 下書きの台帳は両方向 (走査で動かなかった欄 ⇔ 台帳の行)', () => {
    expect(keysOf('inert')).toEqual(Object.keys(DRAFT_LEDGER).sort());
  });

  it('★ 下書きの台帳が名指す書き手は、その画面の原文で実際に呼ばれている', () => {
    for (const [key, row] of Object.entries(DRAFT_LEDGER)) {
      const src = readOriginalSource(join(SRC, row.file));
      expect(new RegExp(`\\b${row.writer}\\s*\\(`).test(src), `${key}: ${row.file} が ${row.writer}( を呼ばない`).toBe(true);
      expect(row.why.length, `${key}: 理由が短すぎる`).toBeGreaterThan(20);
    }
  });

  it('★ どの画面にも NaN / Infinity が出ない (欄を打った後の全画面)', () => {
    expect(nanScreens).toEqual([]);
  });
});

describe('判じる関数そのものの対照 (標本を食わせる)', () => {
  const base: RawScreens = {
    token: '7x',
    tokenText: 'A',
    tokenInvalid: false,
    readableText: 'R',
    emptyText: 'E',
    zeroText: 'Z',
  };

  it('値を引用するか、欄が aria-invalid を立てれば「言っている」', () => {
    expect(classifyRaw({ token: '7x', tokenText: '「7x」を数値として読み取れません', tokenInvalid: false })).toBe('speaks');
    expect(classifyRaw({ token: '7x', tokenText: '数値で入力してください', tokenInvalid: true })).toBe('speaks');
  });

  it('打った値が効く欄で、読めない値の画面が空欄 / 0 / 読めた数と同じなら「黙る」', () => {
    expect(classifyRaw({ ...base, tokenText: 'E' })).toBe('silent-as-blank');
    expect(classifyRaw({ ...base, tokenText: 'Z' })).toBe('silent-as-zero');
    expect(classifyRaw({ ...base, tokenText: 'R' })).toBe('silent-as-readable');
  });

  it('標本: 直す前の制度判定 —— 「66歳」の画面は空欄の画面と同じで、値を引用しない', () => {
    const empty = '要件を満たす 1 件 ／ 入力が足りない 8 件 ／ 対象外 0 件 年齢が未入力（要件: 18歳以上45歳未満）';
    const typed = '要件を満たす 1 件 ／ 入力が足りない 2 件 ／ 対象外 6 件 年齢 7 歳は要件（18歳以上45歳未満）を満たさない';
    expect(classifyRaw({ token: '7x', tokenText: empty, tokenInvalid: false, readableText: typed, emptyText: empty, zeroText: typed })).toBe(
      'silent-as-blank',
    );
  });

  it('打った値が効かない欄 (下書き) は「動かない」、読めない値だけが画面を動かせば「別の何か」', () => {
    const still: RawScreens = { ...base, tokenText: 'E', readableText: 'E', emptyText: 'E', zeroText: 'E' };
    expect(classifyRaw(still)).toBe('inert');
    expect(classifyRaw({ ...still, tokenText: 'X' })).toBe('third');
    expect(classifyRaw({ ...base, tokenText: 'X' })).toBe('third');
  });

  it('言っていない欄を比べる画面なしで判じない (測り忘れを黙って通さない)', () => {
    expect(() => classifyRaw({ token: '7x', tokenText: 'A', tokenInvalid: false })).toThrow('比べる');
  });
});
