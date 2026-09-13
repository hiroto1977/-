/** @vitest-environment jsdom */
/**
 * **⛔ の欄から「別の数」を作らない** —— 全画面・全ガード欄の総当たり (パス 210)。
 *
 * パス 206〜209 は同じ欠陥を 4 回直した:「画面が `guardNumber` で赤く断っている
 * 値を、計算がそのまま読んで判定を作る」。毎回**私が書いた spec の表**から欄を
 * 数えたので、毎回取りこぼした —— パス 209 は `RE_SPECS` / `ZONING_SPECS` を見て
 * 「動くのは 7 件」と結論したが、同じファイルの**水循環プランナー 10 欄**が
 * 表に無かったため節ごと母集団から落ちていた (`地下水基準比 40倍 → 0倍` など)。
 *
 * **母集団は走査で採る。** ここは `SERVICES` の全画面を jsdom で描き、
 * `input[data-guard]` を 1 つずつ ⛔ にして `.stat-grid` のタイルを前後で比べる。
 * 手で書いた一覧はどこにも無いので、**新しい画面・新しい欄が黙って増えない**。
 *
 * ## 不変条件
 *
 * 欄が ⛔ (`data-guard="fatal"`) のとき、その画面のタイルは
 *   1. 変わらない (その欄を読んでいない)、
 *   2. 消える (段ごと断った —— `RefusedFieldsNote` の形)、
 *   3. `—` になる (値の側で断った —— `jpyOrDash` / `pct1OrDash` の形)
 * のいずれかでなければならない。**別の数に変わってはいけない。**
 *
 * 3 つを等しく認めるのは、どちらの直し方も「算定していない」と述べているから。
 * 逆に `¥0` / `0%` / `0倍` / `∞` は**測定値のふり**をするので許さない。
 *
 * ## 既知の未修理 (台帳)
 *
 * `KNOWN` は**まだ直していない**組。0 に倒れる `nonNeg` の契約どおりの欄が
 * 主だが、「⛔ は出ているのに何を計算したかを言わない」点はパス 206 と同じ形で、
 * defect ではないとは言えない (パス 209 で「契約どおり」と書いたのは甘かった ——
 * `売り戻し後の円 ¥1,490,033 → ¥1,500,000` や `実質価値 → ¥10,000,000` は
 * **より good な方向**である)。**台帳は縮める方向にしか動かさない。**
 *
 * 台帳は**双方向**に検査する —— 載っているのに動かなくなった組があれば
 * 「直したのに台帳に残っている」ので落とす (パス 117 が片方向だった教訓)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';

// 橋と DOM の代役は、同じ「全画面を描く」検査 (`guardedDefaults.test.ts`・パス 206)
// と同じ物。痩せた代役だと画面が effect で落ち、走査は**空振りしたまま緑になる**。
beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ available: false, plaintextCount: 0 }),
    eraseAll: () => Promise.resolve({ ok: true, erased: [], failed: [] }),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/**
 * **まだ直していない `<画面>/<欄>` の組** (パス 210 で実測)。
 *
 * 欄の単位で持つ (タイルの単位にすると、直した途中で台帳が嘘になる)。
 * それぞれ**なぜ残っているか**を書く —— 理由の無い除外は
 * 「測っていない範囲を 100% と報告する」形になる (パス 25 / 145)。
 */
const KNOWN: Readonly<Record<string, string>> = {
  // `nonNeg` の契約 (「負は無意味なので 0」) どおり 0 に倒れる。⛔ は出ているが
  // 画面が「何を計算したか」を言わない。うち 2 件は**より good な方向**:
  //   達成年数 −9999 → 実質価値 ¥8,203,483 → ¥10,000,000
  //   為替手数料 −9999 → 売り戻し後の円 ¥1,490,033 → ¥1,500,000 (手数料が消える)
  'mutual-funds/毎月の積立額 (円)': '0 倒し (取得口数・評価額・評価損益)。段の断りを足す (次のパス)',
  'mutual-funds/積立年数': '0 倒し (将来評価額・累計拠出額)',
  'mutual-funds/達成年数': '0 倒し。ただし実質価値は **増える** 向き —— 優先して直す',
  'mutual-funds/毎月の生活費 (円)': '0 倒し (緊急予備資金)',
  'mutual-funds/現在の積立額 (円)': '0 倒し (到達見込み・必要な追加積立)',
  'mutual-funds/手元資金 (円)': '0 倒し (予備資金 充足率・まかなえる月数)',
  'mutual-funds/外貨額': '0 倒し (円換算額・為替損益・両替コスト)',
  'mutual-funds/為替手数料 (片道・円)': 'TTS/TTB が一致して「両替無料」になる。**より good な方向**',
  // 課税価格が refused な金額を 0 として再計算される (¥535,000 → ¥35,000)。
  // 税額は減る側なので申告には不利に働かないが、税関に出す数字が変わる。
  'tax/商品代金 (輸入・円)': '0 倒し (課税価格から下流すべて)。段の断りを足す (次のパス)',
  'tax/国際運賃 (輸入・円)': '0 倒し (課税価格から下流すべて)',
  'tax/保険料 (輸入・円)': '0 倒し (課税価格から下流すべて)',
  'tax/商品代金 (輸出・円)': '0 倒し (仕向国の課税価格から下流すべて)',
  'tax/国際運賃 (輸出・円)': '0 倒し (仕向国の課税価格から下流すべて)',
  'tax/保険料 (輸出・円)': '0 倒し (仕向国の課税価格から下流すべて)',
};

/** ⛔ を作る 2 種。負の値と、上限/桁を超える値。 */
const PROBES = ['-9999', '9999999999'] as const;

/** 「算定していない」と読める値。これらへの変化は不変条件を破らない。 */
const DASHES = new Set(['—', '-', '']);

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  }
}

function setVal(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * `.stat-grid` のタイルを読む。
 *
 * 鍵は **ラベル + 同名タイルの何番目か**。2 つの間違いを両方避けるため:
 *   - 値を鍵に混ぜると、値が変わったタイルが別物として数えられ差分が空になる
 *     (パス 209 で 1 度やった)。
 *   - **通し番号を鍵にすると、段が断りに差し替わって消えた分だけ後続の番号がずれ、
 *     その先の変化がすべて見えなくなる。** これは対照 D2 が教えた —— 地下水基準比の
 *     門を外しても鳴らなかったのは、隣の段 (排出量 3 タイル) が同時に消えて
 *     番号が 3 つずれていたから。**まさに直し方が引き起こすずれ**なので、
 *     この鍵でなければ検査は自分の直し方に対して盲になる。
 * 同名ラベルが同じ画面に 2 つ在る例は実在する (パス 61 の「限界利益率」)。
 */
function tiles(): Map<string, string> {
  const m = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const grid of Array.from(container.querySelectorAll('.stat-grid'))) {
    for (const card of Array.from(grid.children)) {
      const kids = Array.from(card.children);
      const label = (kids[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const value = (kids[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (label === '') continue;
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      m.set(`${label}#${n}`, value);
    }
  }
  return m;
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

interface Moved { readonly key: string; readonly field: string; readonly detail: readonly string[] }

/** 1 画面ぶん走査し、「別の数に変わった」組を返す。 */
async function sweepPage(def: (typeof SERVICES)[number]): Promise<{ moved: Moved[]; fatalCount: number }> {
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  await settle();

  const labels = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-guard]'))
    .map((e) => e.getAttribute('aria-label') ?? '')
    .filter((s) => s !== '');
  const moved: Moved[] = [];
  let fatalCount = 0;

  for (const label of labels) {
    for (const probe of PROBES) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      if (!input) continue;
      const original = input.value;
      const before = tiles();
      await act(async () => { setVal(input, probe); });
      await settle();
      if (input.getAttribute('data-guard') === 'fatal') {
        fatalCount += 1;
        const after = tiles();
        const detail: string[] = [];
        for (const [k, was] of before) {
          const now = after.get(k);
          // 消えた (undefined) / `—` になった = 「算定していない」。それ以外の変化は破り。
          if (now !== undefined && now !== was && !DASHES.has(now)) detail.push(`${k}: ${was} → ${now}`);
        }
        if (detail.length > 0) moved.push({ key: `${def.id}/${label}`, field: label, detail });
      }
      await act(async () => { setVal(input, original); });
      await settle();
    }
  }
  return { moved, fatalCount };
}

describe('⛔ の欄から「別の数」を作らない (パス 210・全画面の走査)', () => {
  const allMoved: Moved[] = [];
  let totalFatal = 0;

  for (const def of SERVICES) {
    it(`${def.id} (${def.label})`, async () => {
      const { moved, fatalCount } = await sweepPage(def);
      totalFatal += fatalCount;
      allMoved.push(...moved);
      const unexpected = moved.filter((m) => !(m.key in KNOWN));
      expect(
        unexpected.map((m) => `${m.key}\n      ${m.detail.join('\n      ')}`),
        `${def.id}: ⛔ の欄から別の数が出ている (段ごと断るか、値を「—」にする)`,
      ).toEqual([]);
    }, 120000);
  }

  it('★ 走査が実際に欄を踏んでいる (空振りしていない)', () => {
    // **鳴らない走査は「合格」ではない。** ⛔ を 1 つも作れていなければ、
    // 上の 76 件は何も確かめていない。実測 114 組 (2026-09-13・パス 210)。
    expect(totalFatal).toBeGreaterThanOrEqual(100);
  });

  it('★ 台帳は双方向 — 直したのに残っている項目があれば落ちる', () => {
    const stillMoving = new Set(allMoved.map((m) => m.key));
    const stale = Object.keys(KNOWN).filter((k) => !stillMoving.has(k));
    expect(
      stale,
      '台帳に載っているが、もう別の数を出していない —— 直したなら台帳から消すこと',
    ).toEqual([]);
  });

  it('★ 台帳の各項目に理由が書かれている', () => {
    // 無言の除外は「測っていない範囲を 100% と報告する」形 (パス 25 / 145)。
    const wordless = Object.entries(KNOWN).filter(([, why]) => why.trim().length < 8);
    expect(wordless.map(([k]) => k)).toEqual([]);
  });
});
