/** @vitest-environment jsdom */
/**
 * **形の合わない行が 1 件入った状態で、全画面を描く** (2026-09-21 · パス 360)。
 *
 * `everyPageRenders.test.ts` (パス 170) は**空の**保管層で 74 画面を描く。
 * 壊れた行が入った状態は誰も描いていなかった —— そしてそれは想像上の状態ではない:
 * 復元の入口 `store.importAll` が中身の形を見るのは 2026-09-05 からで、
 * それ以前に復元した・古い版が書いた行は既に保存されている
 * (`recordShapeAudit.ts` がその母集団のために在る)。
 *
 * ## 設計はこうなっている (穴ではない)
 *
 * `store.list()` は読みで落とさない —— `recordShapeAudit.ts` の docblock が理由を書く:
 *
 * > 形の違うレコードが 1 件あると、その画面は描画で投げて境界 (`PageErrorBoundary`) が
 * > 受ける —— 画面は開けず、開けないので画面からは消せない。ここが唯一の出口になる
 *
 * 読みで落とすと**壊れた行が UI から触れなくなる** (`library.ts` の
 * 「行そのものは落とさない」= パス 136 と同じ理由)。だから入口で検め、既に
 * 入っている物は設定画面の `RecordShapeAuditPanel` で消す 2 段構えである。
 *
 * ## その設計が含意する不変条件に、機械が無かった
 *
 * 1. **抜け出す道が塞がってはいけない。** 逃げ口 (設定画面) 自身が壊れた行で
 *    投げたら、利用者は**自分のデータから永久に締め出される** —— 全ゲートは緑のまま。
 *    今日は通る (実測) が、設定画面に `useCollection` を 1 つ足せば静かに崩れる。
 * 2. **投げる画面の数は数えられていなかった。** 20 画面に増えても何も鳴らない。
 *
 * ## 実測 (2026-09-21 · パス 360 の直し前)
 *
 * | 壊し方 | 投げた画面 |
 * | --- | --- |
 * | 必須の欄が**無い** (`{}`) | **2** —— `sales` (`monthlyTotals`) と `kpi` (`salesKpiBridge.monthOf`) |
 * | 欄は在るが**型が違う** (`date: 'bad'`) | **0** |
 *
 * どちらも `TypeError: Cannot read properties of undefined (reading 'slice')` で、
 * **投げるのは欄が無いときだけ** (`'bad'.slice` は通る)。`sales.ts` は 57 行上の
 * `salesPeriod` で「読める日付 = 暦に在る日」と絞っているのに、`monthlyTotals` は
 * 素で `.slice` していた —— **同じファイルの中で同じ問いが 2 通りに答えられていた。**
 * パス 360 で両方を `readableSalesRows` に通し、落とした件数を画面が言う。
 *
 * ## ここで見るもの
 *
 * - ★ 逃げ口 (設定画面の点検パネル) が**壊れた行の下でも描ける** —— 両方の壊し方で。
 * - ★ 投げる画面は台帳と**両方向**に一致する (増えたら落ち、直ったら「台帳から消せ」と落ちる)。
 * - 壊した行が実際に形の判定に落ちること (走査が死んで「0 件だから健全」にならない床)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { COLLECTION_SHAPES, hasCollectionShape } from '../data/collectionShapes';
import { getRecordStore } from '../data/store';
import { RecordShapeAuditPanel } from '../components/RecordShapeAuditPanel';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';

/**
 * 投げる画面の台帳。**空であること自体が主張**である ——
 * パス 360 の直し前は `kpi` と `sales` が居た。
 */
const THROWING_PAGES: Readonly<Record<string, string>> = {};

/** 形の判定が拒む行 —— 2 通りの壊し方。 */
type Family = 'missing' | 'wrong-type';

/**
 * 欄が在って型が違う行を、**形自身の欄の一覧から導く** (手書きの候補表だと、
 * たまたま当たらなかった collection が「拒めない」に見える —— パス 360 の
 * 最初の計測がそれで `highlight-settings` を取り違えた)。
 *
 * `Symbol` は入れない —— IndexedDB の structured clone が通さないので、
 * **保存値として存在し得ない** (実測: `DataCloneError`)。
 */
export function wrongTypedRow(collection: string): Record<string, unknown> | null {
  const shape = COLLECTION_SHAPES[collection];
  if (shape === undefined) return null;
  const sentinels: unknown[] = ['bad', -1 / 0, null, true, { z: 1 }, [1]];
  for (const field of shape.fields) {
    for (const v of sentinels) {
      const row = { [field]: v } as Record<string, unknown>;
      if (!hasCollectionShape(collection, row)) return row;
    }
  }
  return null;
}

/** その壊し方で実際に拒まれる行 (拒まれないなら `null` = その collection は対象外)。 */
export function malformedRow(collection: string, family: Family): Record<string, unknown> | null {
  if (family === 'missing') return hasCollectionShape(collection, {}) ? null : {};
  return wrongTypedRow(collection);
}

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
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
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
  // 描画中の警告は本題ではない (投げたかどうかだけを見る)。
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  host.remove();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 台帳のすべての collection に 1 件ずつ壊れた行を入れ、入れた数を返す。 */
async function seedMalformed(family: Family): Promise<number> {
  const store = getRecordStore();
  let seeded = 0;
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    const bad = malformedRow(collection, family);
    if (bad === null) continue;
    await store.insert(collection, bad);
    seeded += 1;
  }
  return seeded;
}

/** 1 画面を素で描いて、投げたら理由を返す (境界で包まない —— 包むと文面になって区別できない)。 */
async function renderFailure(page: () => unknown): Promise<string | null> {
  try {
    root = createRoot(host);
    const r = root;
    await act(async () => {
      r.render(createElement(page as never));
    });
    await settle();
    return null;
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    if (root) {
      const r = root;
      root = null;
      act(() => {
        r.unmount();
      });
    }
  }
}

describe('壊れた行の下で全画面を描く (パス 360)', () => {
  it('★ 壊し方 2 通りがどちらも実際に形の判定へ当たる (走査が死んでいない)', () => {
    const missing = Object.keys(COLLECTION_SHAPES).filter((c) => malformedRow(c, 'missing') !== null);
    const wrong = Object.keys(COLLECTION_SHAPES).filter((c) => malformedRow(c, 'wrong-type') !== null);
    // 実測 (2026-09-21): 台帳 23 件のうち `{}` が拒まれるのは 19 件
    // (残り 4 件は欄が全部 optional な形 —— 読む側が欄ごとに既定へ倒すと
    // docblock が書いている `bank-submission-settings` / `parameter-overrides` /
    // `hydroponics-crops` / `highlight-settings`)。型違いは全件拒まれる。
    expect(missing.length).toBeGreaterThanOrEqual(19);
    expect(wrong.length).toBe(Object.keys(COLLECTION_SHAPES).length);
    // 針の標本 —— 合う行は拒まれない (どの行でも拒む判定になっていないこと)。
    expect(hasCollectionShape('sales-entries', { date: '2026-04-01', channel: 'amazon', amount: 1, orders: 1 })).toBe(true);
    expect(hasCollectionShape('sales-entries', {})).toBe(false);
  });

  it.each(['missing', 'wrong-type'] as const)(
    '★ 逃げ口 (点検パネル) は壊れた行の下でも描ける — %s',
    async (family) => {
      const seeded = await seedMalformed(family);
      expect(seeded).toBeGreaterThan(0);
      const failure = await renderFailure(RecordShapeAuditPanel as unknown as () => unknown);
      expect(failure, '点検パネルが投げた — 壊れた行を消す道が無くなる').toBeNull();
      // 逃げ口が「押せる」ことまで見る (描けても調べるボタンが無ければ出口ではない)。
      root = createRoot(host);
      const r = root;
      await act(async () => {
        r.render(createElement(RecordShapeAuditPanel));
      });
      await settle();
      expect(host.querySelector('[data-shape-audit-scan]')).not.toBeNull();
    },
    120_000,
  );

  it.each(['missing', 'wrong-type'] as const)(
    '★ 投げる画面は台帳と両方向に一致する — %s',
    async (family) => {
      await seedMalformed(family);
      const threw: Record<string, string> = {};
      for (const svc of SERVICES) {
        _resetCollectionSubscribersForTests();
        const failure = await renderFailure(svc.page as () => unknown);
        if (failure !== null) threw[svc.id] = failure;
      }
      // 増えたら落ちる / 台帳に在るのに投げなくなっても落ちる (消化したら台帳から消す)。
      expect(Object.keys(threw).sort()).toEqual(Object.keys(THROWING_PAGES).sort());
    },
    300_000,
  );
});
