/** @vitest-environment jsdom */
/**
 * **預けた AI の API キーを消す口 —— 在ること、効くこと、失敗を黙らないこと。**
 *
 * ## 直す前の実測 (2026-09-24 · パス 453 · jsdom で実物の `AssistantPage` を描いて押す)
 *
 * | 測った物 | 実測 |
 * | --- | --- |
 * | `AssistantPage` が書く所 | `hub.setToken('assistant', JSON.stringify(creds))` (**画面から書ける**) |
 * | 資格情報パネルの削除らしいボタン | **0 件** (「🗑 消去」は `clearChat` = 会話履歴) |
 * | 空のフォームで「保存」 | **断られる** (「少なくとも 1 つの API キー / URL を入力してください」) |
 * | `unusedStoredCredentials(['assistant'])` | **`[]`** (`collectsCredential` が true だから) |
 * | 設定画面の掃除の節 | **描かれない** |
 * | この画面の `tokenSetup` | **無い** → `StatusBar` の「削除」も出ない |
 *
 * つまり **API キーを預けた利用者には「すべてのデータを削除」以外の消す手段が 1 つも
 * 無かった**。法則 `escape-hatch-stays-open` そのもので、対象はこのアプリが預かるうちで
 * 最も価値の高い資格情報 (使うと課金される) である。
 *
 * ## この検査が背骨である理由
 *
 * 母集団の側 (`renderer/__tests__/credentialDeletePathCensus.test.ts`) は「消す口が
 * 在ると名乗っているか」を綴りで数える。**名乗りは在っても効かないことがある**
 * (法則 `mention-vs-declaration`) ので、ここは実物を描いて実際に押し、
 * 保管層へ `clearToken('assistant')` が届くことを見る。
 *
 * ## 「分からない」は出す側へ倒す
 *
 * 消す口を出すかは `listConfigured()` が決める。**読めなかったときに隠すと、
 * 保管庫が施錠されている利用者から逃げ口が消える** —— それは直している欠陥そのもの
 * なので、`false` と分かったときだけ隠す。`★ 読めなくても消す口は出る` がその向きを留める。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement } from '../../__tests__/jsdomWait';
import { deleteCredentialConfirm, deletedCredentialMessage } from '../../data/credentialSaveMessage';

type ClearResult = { ok: true } | { ok: false; code: string; message: string };

let configured: string[] = [];
let listThrows = false;
let clearResult: ClearResult = { ok: true };
const cleared: string[] = [];
const confirmed: string[] = [];
let confirmAnswer = true;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () =>
      listThrows ? Promise.reject(new Error('金庫が施錠されています')) : Promise.resolve(configured),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: (id: string) => {
      cleared.push(id);
      return Promise.resolve(clearResult);
    },
    storageProtection: () =>
      Promise.resolve({ mechanism: 'os-keychain', encrypted: true, plainCount: 0, file: '/x' }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * 実物のパネルを開く。**錠は構造で取る** —— 「API キーを削除」という綴りは
 * 押す前から確認文にも出ないが、パネル自身が畳まれて出るので、開くボタンを押した
 * **後に現れる入力欄**で待つ (パス 442 / 445 / 449 / 450 / 452 で踏んだ罠)。
 */
async function mountPanel(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'assistant');
  if (!def) throw new Error('assistant service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  const toggle = await waitForElement<HTMLButtonElement>(
    () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('エージェント'),
      ) ?? null,
    'エージェント設定を開くボタン',
  );
  await act(async () => toggle.click());
  await waitForElement(
    () => container.querySelector('input[type="password"]'),
    '資格情報パネルの伏せ字の欄 (パネルが開いた印)',
  );
  // 預かりの有無は別の読みなので、その答えが届くまで待つ (ボタンの有無がそれで決まる)。
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

const deleteButton = (): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>('button[data-clear-agent-creds]');

beforeEach(async () => {
  // jsdom は `Element.scrollTo` を持たない (環境の穴で、製品の欠陥ではない)。
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  configured = ['assistant'];
  listThrows = false;
  clearResult = { ok: true };
  cleared.length = 0;
  confirmed.length = 0;
  confirmAnswer = true;
  stubHub();
  vi.stubGlobal('confirm', (msg?: string) => {
    confirmed.push(msg ?? '');
    return confirmAnswer;
  });
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = null;
  }
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('アシスタントの API キーを消す口', () => {
  it('★ 預けていれば削除の口が在り、押すと保管層へ届く', async () => {
    await mountPanel();
    const btn = deleteButton();
    expect(btn).not.toBeNull();
    await act(async () => btn!.click());
    expect(cleared).toEqual(['assistant']);
    expect(container.textContent ?? '').toContain(deletedCredentialMessage());
  });

  it('★ 確認を断れば 1 件も消さない', async () => {
    confirmAnswer = false;
    await mountPanel();
    await act(async () => deleteButton()!.click());
    expect(cleared).toEqual([]);
  });

  it('★ 確認文は「まとめて消える」「元に戻せない」を押す前に言う', async () => {
    await mountPanel();
    await act(async () => deleteButton()!.click());
    expect(confirmed).toHaveLength(1);
    // 標本: この文が実際に両方を述べていること (針が的に当たることを示す)。
    expect(confirmed[0]).toContain('すべて消えます');
    expect(confirmed[0]).toContain('元に戻せません');
    expect(confirmed[0]).toBe(deleteCredentialConfirm());
  });

  it('★ 削除の失敗を黙らない', async () => {
    clearResult = { ok: false, code: 'write_failed', message: '金庫が施錠されています' };
    await mountPanel();
    await act(async () => deleteButton()!.click());
    const t = container.textContent ?? '';
    expect(t).toContain('削除できませんでした: 金庫が施錠されています');
    expect(t).not.toContain(deletedCredentialMessage());
  });

  it('★ 預けていなければ削除の口は出さない', async () => {
    configured = [];
    await mountPanel();
    expect(deleteButton()).toBeNull();
  });

  it('★ 読めなくても消す口は出る (分からないときは出す側へ倒す)', async () => {
    listThrows = true;
    await mountPanel();
    expect(deleteButton()).not.toBeNull();
  });
});
