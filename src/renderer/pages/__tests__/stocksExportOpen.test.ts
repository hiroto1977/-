/** @vitest-environment jsdom */
/**
 * **書き出したダッシュボードの「開く」が、実際に開く。** (2026-09-12 · パス 151)
 *
 * 2026-09-12 まで `StocksPage` は書き出し先の OS パスから `file:///…` を組んで
 * `window.serviceHub.openExternal(url)` へ渡していた。**その道は閉じている** ——
 * `shared/externalUrlGate.ts` の `EXTERNAL_URL_SCHEMES` は `http:` / `https:` だけで、
 * 同じファイルの散文が「`file:` はローカル読み出し」を拒む理由として挙げている。
 *
 * 実測 (2026-09-12): 組み上がる 3 通り
 *
 * | 書き出し先 | 組んだ URL | `externalUrlOrNull()` |
 * | --- | --- | --- |
 * | `/home/user/stocks-dashboard.html` | `file:///home/user/stocks-dashboard.html` | **null** |
 * | `C:\Users\x\stocks-dashboard.html` | `file:///C:/Users/x/stocks-dashboard.html` | **null** |
 * | `/tmp/out/My Reports/stocks.html` | `file:///tmp/out/My Reports/stocks.html` | **null** |
 *
 * main の handler は `null` なら `return;` するので、**押しても何も起きない
 * ボタン**だった。ブラウザ版も同じ関門を通り、`webShimBridge.test.ts` が
 * `file:///etc/passwd` を落とすことを検査している —— つまり**両ビルドで死んでいた**。
 *
 * **関門が正しく、呼ぶ側が間違っていた。** ローカルのファイルを開く口は
 * `openPath` で、他の書き出し画面 (テンプレート / チームレーダー / 経営ダッシュボード)
 * は最初から `components/ExportActions.tsx` を通していた。この画面だけが
 * 取り残されていた —— そして**カバレッジ 28.45% で、誰も 1 度も押していなかった。**
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

/** 書き出し先として action が返す道 (実物と同じ形の絶対パス)。 */
const EXPORT_PATH = '/home/user/.local/business-hub/data/dashboard.html';

interface Calls {
  readonly openPath: string[];
  readonly openExternal: string[];
  readonly reveal: string[];
}

let calls: Calls;
/** `openPath` の戻り値 (失敗を出す枝の検査で差し替える)。 */
let openPathResult: { ok: boolean; message?: string };

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_id: string, action: string) =>
      Promise.resolve(
        action === 'export-dashboard'
          ? { ok: true, data: { path: EXPORT_PATH, bytes: 40960 } }
          : { ok: false, code: 'x', message: 'x' },
      ),
    openExternal: (url: string) => {
      calls.openExternal.push(url);
      return Promise.resolve();
    },
    openPath: (p: string) => {
      calls.openPath.push(p);
      return Promise.resolve(openPathResult);
    },
    revealInFolder: (p: string) => {
      calls.reveal.push(p);
      return Promise.resolve({ ok: true });
    },
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountStocks(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'stocks');
  if (!def) throw new Error('stocks service missing from the sidebar');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found as HTMLButtonElement;
}

async function click(text: string): Promise<void> {
  const b = buttonByText(text);
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  calls = { openPath: [], openExternal: [], reveal: [] };
  openPathResult = { ok: true };
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('株式ダッシュボードの書き出しと「開く」(パス 151)', () => {
  it('★ 走査が実物に当たる (書き出す前は開く手立てが出ていない)', async () => {
    await mountStocks();
    expect(container.textContent).toContain('ダッシュボード書き出し');
    expect(() => buttonByText('ファイルを開く')).toThrow();
  });

  it('★ 「開く」は openPath を書き出し先の道で呼ぶ (openExternal は使わない)', async () => {
    await mountStocks();
    await click('ダッシュボードを書き出す');
    await click('ファイルを開く');

    expect(calls.openPath, 'openPath が書き出し先で呼ばれていない').toEqual([EXPORT_PATH]);
    // **ここが本題。** `file:` は関門が落とすので、`openExternal` へ渡すのは
    // 「押しても何も起きない」ボタンを作ることと同じである。
    expect(calls.openExternal, 'openExternal を使うと関門に落とされて何も起きない').toEqual([]);
  });

  it('★ 開けなかったら理由を出す (握り潰さない)', async () => {
    // 2026-08 の教訓: `shell.openPath` は失敗時にエラー文字列を返す契約なのに、
    // 戻り値を捨てていたので「押しても無反応」に見えていた。
    openPathResult = { ok: false, message: '対応するアプリがありません' };
    await mountStocks();
    await click('ダッシュボードを書き出す');
    await click('ファイルを開く');
    const err = container.querySelector('[data-os-op-error]');
    expect(err?.textContent).toContain('対応するアプリがありません');
  });

  it('★ 保存先フォルダを開く / 生の絶対パスは刷らない', async () => {
    await mountStocks();
    await click('ダッシュボードを書き出す');
    await click('保存先フォルダを開く');
    expect(calls.reveal).toEqual([EXPORT_PATH]);
    // `ExportActions` は意図してファイル名だけを出す (「never show the raw path」)。
    // 手書きだった頃は `<code>{exportPath}</code>` で絶対パスを刷っていた。
    expect(container.textContent).toContain('dashboard.html');
    expect(container.textContent, '絶対パスが画面に出ている').not.toContain(EXPORT_PATH);
  });

  it('★ 対照: 書き出しが失敗したら開く手立てを出さない', async () => {
    (globalThis as unknown as { serviceHub: { invoke: unknown } }).serviceHub.invoke = () =>
      Promise.resolve({ ok: false, code: 'action_failed', message: '書き出せませんでした' });
    await mountStocks();
    await click('ダッシュボードを書き出す');
    expect(container.textContent).toContain('書き出せませんでした');
    expect(() => buttonByText('ファイルを開く')).toThrow();
    expect(calls.openPath).toEqual([]);
  });
});

/*
 * **残りの操作も 1 度は押す。** この画面は 2026-09-12 の全域計測で **28.45%** ——
 * 5 つの非同期ハンドラ (登録 / 解除 / 戦略比較 / 助言 / 書き出し) はどれも
 * 1 度も走ったことがなかった。「開く」がそうだったように、走っていない道は
 * 動くかどうか誰も知らない。
 *
 * ここで見るのは**空入力の断りと、失敗の文面が画面に出ること**。
 * どちらも「押しても何も起きない」が起こりやすい形である。
 */
describe('株式画面の残りの操作 (カバレッジ 28.45% だった側 · パス 151)', () => {
  /** すべての action を失敗で返す橋に差し替える。 */
  function failAll(message: string): void {
    (globalThis as unknown as { serviceHub: { invoke: unknown } }).serviceHub.invoke = () =>
      Promise.resolve({ ok: false, code: 'action_failed', message });
  }

  it('★ 空入力は断り、IPC を呼ばない (登録 / 解除 / 戦略比較)', async () => {
    let invoked = 0;
    (globalThis as unknown as { serviceHub: { invoke: unknown } }).serviceHub.invoke = () => {
      invoked += 1;
      return Promise.resolve({ ok: false, code: 'x', message: 'x' });
    };
    await mountStocks();
    // 銘柄コードの欄は空 (既定)。
    await click('登録');
    expect(container.textContent).toContain('銘柄コードを入力してください');
    await click('解除');
    expect(container.textContent).toContain('銘柄コードを入力してください');
    // 質問の欄も空。
    await click('AI に聞く');
    expect(container.textContent).toContain('質問を入力してください');
    expect(invoked, '空入力で IPC を呼んでいる').toBe(0);
  });

  it('★ action の失敗は画面に出る (握り潰さない)', async () => {
    failAll('取引所に接続できませんでした');
    await mountStocks();
    // 戦略比較の欄には既定値 'AAPL' が入っているので、そのまま押せる。
    await click('3 戦略を比較');
    expect(container.textContent).toContain('取引所に接続できませんでした');
  });

  it('★ 銘柄の絞り込みは選択が動く (同梱の見本は空なので一覧は変わらない)', async () => {
    /*
     * **最初は「押したら表示が変わる」と書いて落ちた。** 実測すると
     * 同梱の `SNAPSHOT.stocks.watchlist` は **空** で、画面は
     * 「ウォッチリスト 0 件 / 該当する銘柄はありません」を出している ——
     * 絞り込む対象が無いので一覧は変わらない。**アプリではなく私の前提が
     * 間違っていた** (画面の散文「初期状態では mock 5 銘柄が表示されます」は
     * 端末内の state を読む fetcher の話で、静的な見本の話ではない)。
     *
     * 一覧を差し替えずに測れるのは「どの絞り込みが選ばれているか」なので、
     * 押した札が強調へ変わることを見る (`filterAction === opt` の分岐)。
     */
    await mountStocks();
    const label = (text: string): HTMLButtonElement => buttonByText(text);
    // 既定は「全て」が強調 (var(--accent))。
    expect(label('全て').style.background).toContain('accent');
    expect(label('見送り').style.background).not.toContain('accent');
    await click('見送り');
    expect(label('見送り').style.background, '絞り込みの選択が動かない').toContain('accent');
    expect(label('全て').style.background).not.toContain('accent');
  });
});
