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
 * `input[data-guard]` を 1 つずつ ⛔ にして、画面が刷る**ラベルと数字の組**を
 * 前後で比べる。手で書いた一覧はどこにも無いので、**新しい画面・新しい欄が
 * 黙って増えない**。
 *
 * ## 読む物 —— `.stat-grid` だけでは足りなかった (パス 213)
 *
 * パス 210〜212 は `.stat-grid` のカードだけを読んでいた。**画面が数字を刷る形は
 * それだけではない**: 人材ページの給与計算は局所の `stat()` が素の div を 2 つ
 * 重ねて描くので、走査から丸ごと外れており、⛔ から次の物が出ていた ——
 * `源泉徴収税率 8.168% → 0%`・`源泉徴収税額 ¥34,713 → ¥40,839`
 * (**源泉徴収は預かって納める税なので、少なく出る方が重い**)。
 *
 * そこで母集団を**形で定める**: 「葉の要素 2 つだけを子に持ち、1 つ目が語・
 * 2 つ目が数字を含む要素」。`.stat-grid` のカードもこの形なので、同じ規準 1 つで
 * 両方を覆う。実測 2026-09-13 —— `.stat-grid` のカード **121** に対し、
 * この規準では **619 組**。走査が見ていなかったのは 5 倍あった。
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
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
  // **空である。** パス 210 で 14 件、パス 211 で 6 件、パス 212 で 0 件になった。
  // ここに項目を足すのは「まだ直していない」という記録で、**理由を必ず書く**
  // (無言の除外は「測っていない範囲を 100% と報告する」形・パス 25 / 145)。
  // 台帳は双方向なので、直したのに残せば落ちる。
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
 * **画面が刷る「ラベルと数字の組」を読む。**
 *
 * 鍵は **ラベル + 同名の何番目か**。2 つの間違いを両方避けるため:
 *   - 値を鍵に混ぜると、値が変わった組が別物として数えられ差分が空になる
 *     (パス 209 で 1 度やった)。
 *   - **通し番号を鍵にすると、段が断りに差し替わって消えた分だけ後続の番号がずれ、
 *     その先の変化がすべて見えなくなる。** これは対照 D2 が教えた —— 地下水基準比の
 *     門を外しても鳴らなかったのは、隣の段 (排出量 3 タイル) が同時に消えて
 *     番号が 3 つずれていたから。**まさに直し方が引き起こすずれ**なので、
 *     この鍵でなければ検査は自分の直し方に対して盲になる。
 * 同名ラベルが同じ画面に 2 つ在る例は実在する (パス 61 の「限界利益率」)。
 *
 * 母集団は 2 通りで採る:
 *   1. `.stat-grid` のカード (子の 1 つ目がラベル・2 つ目が値)。
 *   2. **葉の要素 2 つだけを子に持つ要素** —— 局所の `stat()` が描く素の div が
 *      これ (パス 213)。`.stat-grid` を使っていない画面もこれで覆える。
 *
 * 外す物は 3 つだけで、どれも理由が在る:
 *   - `[data-live-clock]` の中 —— 数字が入力ではなく**壁時計**から来るので、
 *     どの欄を踏んでも必ず動く (`RealtimeTicker`)。印の実在は下で検査する。
 *   - `[data-refused-fields]` の中 —— 断りの文面そのもの。**天井の値を引用する**
 *     ので (「100 以下で入力してください」)、数字が「現れた」ように見える。
 *   - `label` の中 —— 入力欄の見出しも天井を述べる。同じ理由。
 */
function readings(): Map<string, string> {
  const m = new Map<string, string>();
  const seen = new Map<string, number>();
  const txt = (e: Element | undefined): string => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const add = (label: string, value: string): void => {
    // ラベルが空/長すぎる物は見出しでなく本文なので採らない。値に数字が無ければ
    // 比べる意味が無い (「—」になった側は鍵が消えるだけで、消失として扱われる)。
    if (label === '' || label.length > 80) return;
    if (!/[0-9]/.test(value)) return;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    m.set(`${label}#${n}`, value);
  };
  const done = new Set<Element>();
  for (const grid of Array.from(container.querySelectorAll('.stat-grid'))) {
    for (const card of Array.from(grid.children)) {
      done.add(card);
      const kids = Array.from(card.children);
      add(txt(kids[0]), txt(kids[1]));
    }
  }
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (done.has(el)) continue;
    if (el.children.length !== 2) continue;
    const a = el.children[0];
    const b = el.children[1];
    if (a === undefined || b === undefined) continue;
    if (a.children.length !== 0 || b.children.length !== 0) continue;
    if (el.closest('[data-live-clock]') !== null) continue;
    if (el.closest('[data-refused-fields]') !== null) continue;
    if (el.closest('label') !== null) continue;
    if (el.querySelector('input, select, textarea, button') !== null) continue;
    add(txt(a), txt(b));
  }
  return m;
}

interface Moved { readonly key: string; readonly field: string; readonly detail: readonly string[] }

interface Sweep {
  readonly moved: readonly Moved[];
  /** ⛔ を作れた回数。**0 なら上の主張は何も確かめていない。** */
  readonly fatalProbes: number;
  /** 踏んだ欄の総数 (走査が痩せたら落ちる床のため)。 */
  readonly fields: number;
  /** 比べている「ラベルと数字の組」の総数 (母集団が痩せたら落ちる床のため)。 */
  readonly readings: number;
  /** 壁時計の印 `[data-live-clock]` を見つけた回数 (綴りが変わったら落ちる)。 */
  readonly liveClock: number;
}

/** 1 画面ぶん走査する。器の用意と後片付けはここで完結させる。 */
async function sweepPage(def: (typeof SERVICES)[number]): Promise<Sweep> {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const moved: Moved[] = [];
  let fatalProbes = 0;
  let fields = 0;
  let readingCount = 0;
  let liveClock = 0;
  try {
    await act(async () => { root!.render(createElement(def.page)); });
    await settle();

    // **欄は「何番目か」で取る。ラベルで引き直してはいけない** —— 同じ `aria-label` を
    // 持つ欄が実在する (`毎月の積立額 (円)` は積立シミュレーションとドルコスト平均法に
    // 1 つずつ・`想定年率 (%)` は 3 つ)。`querySelector` は最初の 1 つを返すので、
    // ラベルで引くと**2 つ目以降は 1 度も踏まれない**まま緑になる (D2 と同じ形の盲点)。
    // 入力欄は断りに差し替わる段より上に在るので、番号は描き直しても動かない。
    readingCount = readings().size;
    liveClock = container.querySelectorAll('[data-live-clock]').length;
    const count = container.querySelectorAll('input[data-guard]').length;
    for (let idx = 0; idx < count; idx += 1) {
      const at = (): HTMLInputElement | undefined =>
        container.querySelectorAll<HTMLInputElement>('input[data-guard]')[idx];
      const label = at()?.getAttribute('aria-label') ?? '';
      if (label === '') continue;
      fields += 1;
      for (const probe of PROBES) {
        const input = at();
        if (!input) continue;
        const original = input.value;
        const before = readings();
        await act(async () => { setVal(input, probe); });
        await settle();
        if (input.getAttribute('data-guard') === 'fatal') {
          fatalProbes += 1;
          const after = readings();
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
  } finally {
    if (root) {
      const r = root;
      root = null;
      await act(async () => { r.unmount(); });
    }
    container.remove();
  }
  return { moved, fatalProbes, fields, readings: readingCount, liveClock };
}

/**
 * **走査は 1 度だけ回し、すべての主張が同じ結果を読む。**
 *
 * 最初は画面ごとに `it` を立て、件数を `let` に足していった。その形だと
 * `-t` で 1 本だけ走らせたとき件数が 0 のまま「空振り検査」が落ち、**対照が
 * 狙いとは別の理由で鳴る** (実際に D4 がそうだった —— 走査を盲にした変異では
 * なく、絞り込みそのもので 0 になっていた)。1 つの `beforeAll` に寄せれば
 * 主張の間に順序の依存が無くなる。
 */
const RESULT = { moved: [] as Moved[], fatalProbes: 0, fields: 0, readings: 0, liveClock: 0 };

beforeAll(async () => {
  for (const def of SERVICES) {
    const r = await sweepPage(def);
    RESULT.moved.push(...r.moved);
    RESULT.fatalProbes += r.fatalProbes;
    RESULT.fields += r.fields;
    RESULT.readings += r.readings;
    RESULT.liveClock += r.liveClock;
  }
}, 600000);

describe('⛔ の欄から「別の数」を作らない (パス 210・全画面の走査)', () => {
  it('★ 走査が実際に欄を踏んでいる (空振りしていない)', () => {
    // **鳴らない走査は「合格」ではない。** ⛔ を 1 つも作れていなければ、
    // 下の主張は何も確かめていない。実測 2026-09-13 (パス 211): 欄 **89**・⛔ **110 組**。
    //
    // 89 は `guardedDefaults.test.ts` の `GUARDED_FIELD_FLOOR` (パス 206 が別途
    // 数えた値) と一致する —— **2 つの走査が独立に同じ母集団を数えている**ので、
    // どちらかが痩せれば差が出る。
    //
    // ★ 番号で引く前 (パス 210) はここが 114 と出ていた。ラベルで引き直していたため
    // 同名の欄 (`毎月の積立額 (円)` ×2・`想定年率 (%)` ×3) で**同じ 1 つ目を
    // 何度も踏み**、件数だけが増えていた。110 が 89 欄に対する正直な数である。
    // パス 216 で **89 → 91**: 工場プランの 2 欄 (`作業場の法定上限` / `希望する作業場面積`)
    // は素の `<input>` だったので走査の外に在った。⛔ は負の値でのみ立つ (`area` に
    // `max` は無く、巨大な値は `sane` 超えの ⚠️) ので ⛔ の組は 110 → 112。
    expect(RESULT.fields, '関門つきの欄を踏んでいない').toBeGreaterThanOrEqual(91);
    expect(RESULT.fatalProbes, '⛔ を 1 つも作れていない').toBeGreaterThanOrEqual(112);
  });

  it('★ 比べている母集団が痩せていない (ラベルと数字の組)', () => {
    // 実測 2026-09-13 (パス 213): **619 組** (`.stat-grid` のカードは 121)。
    // 床を 600 に置くのは、期限や年度で段が 1 つ増減する画面が在るため ——
    // **5 倍の差 (121 → 619) を守るのが目的**で、1 桁の揺れは追わない。
    // ここが 121 付近まで落ちたら、走査が `.stat-grid` だけに戻っている。
    expect(RESULT.readings, '読んでいる組が減っている (走査が痩せた)').toBeGreaterThanOrEqual(600);
  });

  it('★ 壁時計の印が実在する (除外が空振りしていない)', () => {
    // `[data-live-clock]` は `RealtimeTicker` に付いている (パス 213)。
    // **綴りが変わると除外が黙って効かなくなり**、どの欄を踏んでも時刻が動くので
    // 上の主張が偽の違反で埋まる —— あるいは印が消えた画面を誰も気付かない。
    // 実測: 税金の「いま この瞬間 (秒単位)」が 1 つ (経営サマリー側は実績が
    // 無いと描かれないので、空の保管庫では 0 個)。
    //
    // **この主張が要るのは、時計のずれが散発的だから。** 対照 D10 (印の綴りを
    // 変える) を回すと、上の「別の数が出ていない」は**通ってしまった** ——
    // jsdom の走査は 1 組あたり数ミリ秒なので、秒が変わる組だけが違反になり、
    // その回は当たらなかった。**除外の空振りは、除外そのものを検査しないと
    // 気付けない** (当たった回だけ赤くなる検査は、原因を指さない)。
    expect(RESULT.liveClock, '[data-live-clock] が 1 つも見つからない').toBeGreaterThanOrEqual(1);
  });

  it('★ ⛔ の欄から別の数が出ていない (台帳の分を除く)', () => {
    const unexpected = RESULT.moved.filter((m) => !(m.key in KNOWN));
    expect(
      unexpected.map((m) => `${m.key}\n      ${m.detail.join('\n      ')}`),
      '⛔ の欄から別の数が出ている (段ごと断るか、値を「—」にする)',
    ).toEqual([]);
  });

  it('★ 台帳は双方向 — 直したのに残っている項目があれば落ちる', () => {
    const stillMoving = new Set(RESULT.moved.map((m) => m.key));
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
