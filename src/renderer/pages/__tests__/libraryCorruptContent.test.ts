/** @vitest-environment jsdom */
/**
 * **控えは在るが中身が取り出せないとき、画面が言う** (2026-09-13 · パス 193)。
 *
 * ## 直す前に測った形
 *
 * `library.get()` は `req.result as LibraryItem` と**無検査でキャスト**していた
 * (`list()` は 2026-09-12 · パス 188 で直したのに、双子の `get()` は残っていた
 * —— パス 66 の家系「3 か所のうち 1 か所しか直していない」)。だから中身が
 * Blob でない控えは「読めた」として返り:
 *
 * ```
 *   [1] 一覧にその行は普通に並ぶ (名前・大きさ・時刻はメタから読める)
 *   [2] 「ダウンロード」を押す → URL.createObjectURL(非Blob) が TypeError
 *   [3] onClick は async なので拒否は未処理のまま消える
 *       → ★ 画面は何も変わらない。押しても押しても無反応。
 * ```
 *
 * 隣の「開く」は同じ危険を `.catch(() => null)` で受けて
 * 「プレビューを生成できませんでした」と言えていた —— **同じ画面の双子で、
 * 片方だけが守られていた。**
 *
 * ## ここで確かめること
 *
 * 「無い」と「壊れている」は打ち手が違う (前者は諦める・後者は**その行を削除する**)。
 * だから `get()` は 3 択 (`found` / `missing` / `corrupt`) を返し、画面は
 * 壊れている控えに**名前を挙げて削除を促す**。
 *
 * **控えを壊す手口**: `put()` を通らず素の IndexedDB へ書く (手で直された控え・
 * 移行に失敗した控えの形)。なお `fake-indexeddb` は Blob 自体を保てないので、
 * 普通に `put()` した控えもこの層では「壊れている」になる —— それは代役の限界で、
 * `library.test.ts` の引き線が留めている。
 *
 * ## 待ちは回数ではなく条件で (2026-09-21 · パス 382)
 *
 * `audit:tick-sensitivity` の台帳はこのファイルを `text-with-message`
 * (`expect(text(), '説明').toContain(…)` の形) と分類していたが、**それは
 * 落ちる理由ではなかった**。周回数を 0 にして実測すると **5 件すべて**が
 * `mountLibrary()` の側で落ちる —— IndexedDB の一覧が届く前に
 * 行もボタンも無い状態で当てていたからで、`clickAttr` は
 * 「ボタンが無い: data-library-download=broken」と**押す前に**死ぬ。
 * 錠は `mountLibrary(waitFor)` が持ち、押した後に何を待つかは `it` ごとに
 * 呼び手が決める (パス 378)。
 *
 * ★ **第 2 引数の説明は待ちの label へ移す。** 説明が要る主張はたいてい
 * 「押しても画面が変わらない」で、それは**待ち切れなかったこと**として
 * 現れる —— `settleUntil` の label に書けば、いちばん要る場面
 * (時間切れ) でその説明が出る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetLibraryForTests } from '../../library/library';
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
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
});

let container: HTMLDivElement;
let root: Root | null = null;

/** 素の IndexedDB へ控えを直接書く (`put()` を通らない経路 = 壊れた控えの再現)。 */
async function writeRaw(records: readonly Record<string, unknown>[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('business-hub-library', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('items', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('serviceId', 'serviceId', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    for (const r of records) tx.objectStore('items').put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/**
 * 一覧を描いて、`waitFor` が出るまで待つ。
 *
 * 待つ物を引数で取るのは、**この `it` が真に見たい物**で待つため ——
 * 行の名前で待てば、行と一緒に描かれるボタンの在否はそのまま主張に残せる
 * (錠と主張を同じ物にすると、主張が待ちに飲み込まれる)。
 */
async function mountLibrary(waitFor: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'library');
  if (!def) throw new Error('library service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(text, waitFor);
}

/** 押す。**押した後は待たない** —— 何が出るかは `it` ごとに違う。 */
async function clickAttr(attr: string, id: string): Promise<void> {
  const b = await waitForElement<HTMLElement>(
    () => container.querySelector<HTMLElement>(`[${attr}="${id}"]`),
    `ボタン ${attr}=${id}`,
  );
  await act(async () => {
    b.click();
  });
}

beforeEach(async () => {
  _resetLibraryForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-library');
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

/** メタはそろっているが、中身 (`blob`) が Blob ではない控え。 */
const BROKEN = {
  id: 'broken',
  filename: '中身の壊れた書類.svg',
  mime: 'image/svg+xml',
  serviceId: 'templates',
  createdAt: 1_757_000_000_000,
  size: 1234,
  blob: { not: 'a blob' },
};

/** 壊れた控えの行。一覧が届いた印として、どの `it` もこれを錠にする。 */
const ROW = '中身の壊れた書類.svg';
const CORRUPT = '中身が取り出せません';

describe('ライブラリ — 中身が取り出せない控え', () => {
  it('走査の的が在る (行とボタン 2 つ)', async () => {
    await writeRaw([BROKEN]);
    // 行が出たことは `mountLibrary` の錠が持つ (待ちが落ちれば
    // 「5000ms 待っても『"中身の壊れた書類.svg"が出る』にならなかった」と言う)。
    await mountLibrary(ROW);
    // ボタンは行と同じ描画で出るので、**在否はここで当てたまま**にする ——
    // 錠を行にしておけば、ボタンを消す編集はこの 2 行が鳴らす。
    expect(container.querySelector('[data-library-download="broken"]')).not.toBeNull();
    expect(container.querySelector('[data-library-open="broken"]')).not.toBeNull();
  });

  it('★ ダウンロードを押すと「中身が取り出せません」と出る (無反応ではない)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary(ROW);
    expect(text(), '押す前から文が出ている (対照が成り立たない)').not.toContain(CORRUPT);

    await clickAttr('data-library-download', 'broken');
    // ★ 説明は待ちの label へ —— 押しても変わらないなら、ここで
    //   「5000ms 待っても『…が出る (押しても画面が変わらなければ落ちる)』」と落ちる。
    await settleUntil(
      () => text().includes(CORRUPT),
      `「${CORRUPT}」が出る (押しても画面が変わらなければ落ちる)`,
    );
    const t = text();
    // 名前を挙げる —— どの行を消せばよいか分かる (パス 136: 保存した物は消せる道が要る)。
    expect(t).toContain(ROW);
    expect(t, '打ち手 (削除) を言っていない').toContain('削除');
  });

  it('★ 開くを押しても同じ 1 文が出る (双子で文面が割れない)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary(ROW);
    await clickAttr('data-library-open', 'broken');
    await settleUntil(
      () => text().includes(CORRUPT),
      `「${CORRUPT}」が出る (開く側でも同じ 1 文になる)`,
    );
    const t = text();
    expect(t).toContain(ROW);
    // 「プレビューを生成できませんでした」ではない —— 壊れているのは控えであって、
    // 描き出しに失敗したのではない。理由が違うなら文も違う。
    expect(t, '壊れた控えを「プレビュー生成の失敗」と言っています').not.toContain(
      'プレビューを生成できませんでした',
    );
  });

  it('★ 壊れた控えは削除できる (出口が在る)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary(ROW);
    const del = container.querySelector('[data-library-delete="broken"]');
    expect(del, '削除ボタンが無い (消す道が無い)').not.toBeNull();
  });

  it('対照: 「無い」は「壊れている」と別の文になる', async () => {
    // 行を描いてから、画面の裏で控えを消す。ボタンは残っているので
    // 「削除済みの可能性」の枝に入る。
    await writeRaw([BROKEN]);
    await mountLibrary(ROW);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('business-hub-library', 1);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').delete('broken');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    await clickAttr('data-library-download', 'broken');
    // 否定 (「壊れている」と言っていない) を見る前に、肯定の文を待つ (パス 377 の 2 段)。
    await settleUntil(
      () => text().includes('ファイルが見つかりません'),
      '「ファイルが見つかりません」が出る (消えた控えの枝に入る)',
    );
    expect(text(), '消えている控えを「壊れている」と言っています').not.toContain(CORRUPT);
  });
});
