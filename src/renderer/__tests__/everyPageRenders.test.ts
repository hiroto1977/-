/** @vitest-environment jsdom */
/**
 * **全画面を 1 度は描く。** (2026-09-12)
 *
 * 2026-09-12 に初めて全域の行カバレッジを測ったところ、`test:cov` が
 * `src/main` だけを見ていたため **renderer は一度も測られていなかった**。
 * 実測: 行 89.90% (18,624/20,716) ＝ **未実行 2,092 行**、関数 81.41% ＝
 * **未呼出 1,044**。そのうち **22 ファイルは 0%** で、19 画面 + `CursorPage` +
 * `components/Charts.tsx` (33 行) が **一度も描かれたことがなかった**。
 *
 * 描かれたことが無い画面は「動くかどうか誰も知らない」画面である。壊れていても
 * CI は緑のままで、利用者がサイドバーで押した時に初めて分かる —— 2026-09-05 に
 * `PageErrorBoundary` を入れたので真っ白にはならないが、**枠の中がエラー文面**になる。
 *
 * ここでは `SERVICES` (サイドバーの唯一の真実) を**境界側から**回し、全画面を
 * 実際に描く。名前の一覧を手で持たないので、画面が増えれば自動で対象に入る。
 *
 * **1 回の実行で壊れている画面を全部挙げる** —— 最初の 1 件で止めると、直して
 * 走らせ直すたびに 1 件ずつしか見つからない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetRecordStoreForTests } from '../data/store';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';

/**
 * 実測 2026-09-12: サイドバーの画面は **73**。減ったら走査が痩せたので落とす。
 *
 * **`SERVICE_IDS` は 75 で、サイドバーは 73 である。** 差の 2 つ
 * (`uber-eats` / `demae-can`) は fetcher・`dataOrigin`('sample')・`SNAPSHOT` の
 * データまで在るが**画面が無い** —— `docs/ARCHITECTURE.md` が
 * 「画面が無いので今は呼ぶ物が無い」と明記している意図的な未完成である。
 * その関係は `sidebarCoverage.test.ts` が**理由つき・双方向の台帳**で既に留めている
 * (ここは「描ける画面の数」だけを見る)。
 */
const SERVICE_FLOOR = 73;

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
    // 設定画面が呼ぶ。**最初これを落としていて `settings` が投げた** —— アプリの欠陥ではなく
    // 私のスタブの欠落だった (橋の型は bridge.d.ts が preload から import するので tsc は通る)。
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
  // 描画中の警告は本題ではない (投げたかどうかだけを見る)。
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  _resetRecordStoreForTests();
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

/**
 * 1 画面を描いて、投げたら理由を返す (投げなければ null)。
 *
 * **境界で包まない。** `PageErrorBoundary` を被せると投げても文面になって
 * しまい、「描けた」と区別できない —— ここで見たいのは素の描画である。
 */
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
  }
}

describe('サイドバーの全画面が素で描ける (カバレッジ 0% だった画面を叩く · 2026-09-12)', () => {
  it('★ 走査が実物に当たる (画面の数が床を下回らない)', () => {
    expect(SERVICES.length).toBeGreaterThanOrEqual(SERVICE_FLOOR);
    // page がすべて関数であること (配線の抜けをここで見る)。
    expect(SERVICES.filter((s) => typeof s.page !== 'function').map((s) => s.id)).toEqual([]);
  });

  // 1 件ずつ `it` にすると、どの画面が落ちたか名前で分かる。
  for (const svc of SERVICES) {
    it(`描ける: ${svc.id} (${svc.label})`, async () => {
      const failure = await renderFailure(svc.page as () => unknown);
      expect(failure, `${svc.id} の描画が投げた`).toBeNull();
    });
  }
});
