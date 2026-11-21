/** @vitest-environment jsdom */
/**
 * **手で置いた数値が在ることは、画面だけでなく書面とレポートにも travel する。**
 *
 * 経営サマリーの数値は `applyManualOverrides` で手入力に置き換えられる。
 * **置き換えは表示だけで、派生値は再計算しない** —— これは意図した設計である
 * (「どの派生値をどう直したいかは利用者にしか決められない」`overviewOverrides.ts`)。
 * その結果、**印刷した比率が同じ表に並ぶ金額どおりにならない**:
 *
 * | 行 | 刷った値 | 同じ表の金額から計算すると |
 * | --- | ---: | ---: |
 * | 売上総利益率 | 75.0% | 9,000 ÷ 50,000 = **18.0%** |
 * | 営業利益率 | 37.5% | 4,500 ÷ 50,000 = **9.0%** |
 *
 * 画面は 2026-09-08 まで**画面だけ**で「自動値のままの指標」を警告しており、
 * 金融機関等提出用の書面 (「上記のとおり相違ありません。」で代表者名つき) と
 * 経営レポート (「役員会・銀行・税理士への共有に」) には手入力の断りが
 * **1 文も無かった**。ここは**実物の record store** を通して 3 つの面を見る。
 *
 * ## 2026-09-21 (パス 382) に直した 2 つ
 *
 * ★ **① 画面の断りは条件を取り違えていた。** 門が `staleDerived.length > 0`
 * だったので、**誰の計算元でもない欄を置くと節ごと出なかった**。実測: 上書き
 * できる 45 欄のうち **28 欄**が `derivedFrom` で参照されていない。書面と
 * レポートは `manualOverrideNote` を `overridden.length > 0` で出すので
 * **45 欄すべてで断る** —— つまり**画面の断りだけが 28 欄で黙っていた**。
 * いちばん重いのは営業利益率のような比率で、画面の Tile は手で置いた
 * 99.9% を自動計算と見分けられない形で出していた。
 *
 * ★ **② 「手で置いた売上高」の錠は、消費税の注記で満たされていた。**
 * この検査は `expect(t).toContain('50,000,000')` に
 * `// 手で置いた売上高` と注記して置いていたが、実測すると画面 11,868 字の
 * うち `50,000,000` は**ちょうど 1 か所**で、それは
 * 「簡易課税は基準期間の課税売上高 ￥50,000,000 以下」 —— **上書きの有無で
 * 同じ**。しかも `overview.kpi.revenue` の描画は 0 件なので、
 * 置いた売上高は (この画面を単独で mount した限り) どこにも出ていない。
 * **落ちようがない錠で、見ていると称する物は画面に無かった。**
 * 今は `[data-placed-overrides]` の中の「売上高 50,000,000 円」を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { MANUAL_OVERRIDES_COLLECTION, type ManualOverrideEntry } from '../../data/manualData';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

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

/** 実績 3 か月 = 売上 1,200 万・営業利益 450 万。 */
const actual = (period: string): KpiActual => ({
  period, unit: '全社', revenue: 4_000_000, cogs: 1_000_000, advertising: 0, sga: 1_500_000, depreciation: 0,
});
/** 締め前の速報値を手で置く。 */
const OVERRIDE: ManualOverrideEntry = { scope: 'overview', path: 'kpi.revenue', value: 50_000_000 };
/**
 * **誰の計算元でもない欄**の代表 (実測 28 欄のうちの 1 つ)。これを置くと
 * `staleDerived` は空になるので、門が `staleDerived` だった頃は
 * **画面が何も言わなかった**。
 */
const RATIO_ONLY: ManualOverrideEntry = { scope: 'overview', path: 'kpi.operatingMarginPct', value: 99.9 };

/** KPI 実績が届いて損益のカードが描かれた印 (上書きの値に依らない)。 */
const KPI_READY = '損益分岐点 (BEP)';

let container: HTMLDivElement;
let root: Root | null = null;

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 「手入力の上書き」節の文。節ごと無ければ `null` (在否をそのまま返す)。 */
function placedBox(): string | null {
  const el = container.querySelector('[data-placed-overrides]');
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
}

/** 「自動値のままの指標」の小節の文。無ければ `null`。 */
function staleBox(): string | null {
  const el = container.querySelector('[data-stale-derived]');
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
}

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  // **固定回数ではなく条件で待つ** —— 保管層 (IndexedDB) の往復が済んで
  // KPI のカードが描かれたことを確かめる (法則 wait-for-condition-not-ticks)。
  await waitForText(text, KPI_READY);
}

async function seed(overrides: readonly ManualOverrideEntry[]): Promise<void> {
  const store = getRecordStore();
  for (const m of ['2026-04', '2026-05', '2026-06']) await store.insert(KPI_ACTUALS_COLLECTION, actual(m));
  for (const o of overrides) await store.insert(MANUAL_OVERRIDES_COLLECTION, o);
}

/**
 * 押す。**押した後は待たない** —— 何が出るかは `it` ごとに違うので、
 * 待つのは呼び手が自分の見たい物で待つ (パス 378 の教訓)。
 * 押す物が未だ無いことは在り得るので、そこだけは条件で待つ。
 */
async function click(label: string): Promise<void> {
  const b = await waitForElement<HTMLButtonElement>(
    () => Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label),
    `ボタン「${label}」`,
  );
  await act(async () => {
    b.click();
  });
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
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

describe('手入力の上書き — 断りが 3 つの面に出る', () => {
  it('★ 画面: 置いた値を名指しし、自動値のままの指標を警告する', async () => {
    await seed([OVERRIDE]);
    await mountOverview();
    await settleUntil(() => placedBox() !== null, '「手入力の上書き」の節が出る');
    // ★ ここが錠である。**画面の全文で `50,000,000` を探してはいけない** ——
    //   消費税の注記 (簡易課税の基準 ￥50,000,000) が満たしてしまう。
    expect(placedBox()).toContain('売上高 50,000,000 円');
    expect(placedBox()).toContain('実績の累計ではありません');
    expect(staleBox()).toContain('自動値のままの指標');
    expect(staleBox()).toContain('手で置いた数値から計算される指標が、自動値のままです');
  });

  it('★ 画面: 誰の計算元でもない欄を置いても断る (古い指標が無くても黙らない)', async () => {
    await seed([RATIO_ONLY]);
    await mountOverview();
    await settleUntil(() => placedBox() !== null, '「手入力の上書き」の節が出る');
    expect(placedBox()).toContain('営業利益率 99.9 %');
    // この欄は誰の計算元でもないので「自動値のままの指標」は出ない ——
    // **それでも断りは出る**。門を `staleDerived` に戻すとこの 2 行で落ちる。
    expect(staleBox()).toBeNull();
    // 画面の Tile 自身は手で置いた 99.9% を自動計算と同じ形で出している
    // (だから節が出ないと、手入力であることを知る手がかりが画面に無くなる)。
    expect(text()).toContain('99.9%');
  });

  it('★ 書面: 注記が手入力を述べ、「実績の累計」と断言しない', async () => {
    await seed([OVERRIDE]);
    await mountOverview();
    await click('金融機関等提出用の書式で表示');
    await waitForText(text, '下記の手入力を重ねたもの');
    const t = text();
    expect(t).toContain('売上高は手で置いた数値です');
    expect(t).toContain('は自動計算のままで');
    expect(t).toContain('同じ表に並ぶ金額どおりの値にならないことがあります');
  });

  it('★ 対照: 上書きが無ければ書面に手入力の断りは出ず、「累計。」で言い切る', async () => {
    await seed([]);
    await mountOverview();
    await click('金融機関等提出用の書式で表示');
    // 否定を見る前に、書面が描かれたことを肯定の文で待つ (パス 377 の 2 段)。
    await waitForText(text, 'の累計。');
    const t = text();
    expect(t).not.toContain('手で置いた数値');
    expect(t).not.toContain('自動計算のままで');
    expect(t).not.toContain('手入力を重ねたもの');
  });

  it('★ レポート: コピーした Markdown に手入力の節が入る', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
    });
    await seed([OVERRIDE]);
    await mountOverview();
    await click('経営レポートをコピー (Markdown)');
    await settleUntil(() => copied.length === 1, 'クリップボードへ 1 度書かれる');
    expect(copied[0]).toContain('## 手入力の上書き');
    expect(copied[0]).toContain('売上高は手で置いた数値です');
    expect(copied[0]).toContain('は自動計算のままで');
  });

  it('★ 対照: 上書きが無ければコピーした Markdown に節が無い', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
    });
    await seed([]);
    await mountOverview();
    await click('経営レポートをコピー (Markdown)');
    // 「書かれなかった」では待てないので、書かれたことを待ってから中身を見る。
    await settleUntil(() => copied.length === 1, 'クリップボードへ 1 度書かれる');
    expect(copied[0]).not.toContain('## 手入力の上書き');
    expect(copied[0]).not.toContain('手で置いた数値');
  });

  it('★ 対照: 上書きが無ければ画面にも断りの節が出ない', async () => {
    await seed([]);
    await mountOverview();
    expect(placedBox()).toBeNull();
    expect(staleBox()).toBeNull();
    expect(text()).not.toContain('自動値のままの指標');
  });
});
