/** @vitest-environment jsdom */
/**
 * **収まらなかった先が、書き出した画面に出る。**
 *
 * ブラウザ版の書き出しは 1 回の操作で 3 か所へ置こうとする (端末のダウンロード /
 * アプリ内のライブラリ / 設定で選んだ PC のフォルダ)。2026-09-06 まで、どこが
 * 失敗しても画面は「✓ 保存しました」「✓ 出来上がりました!」だけを出していた
 * (`web-shim.ts` の `catch {}` と、誰も読まない `downloaded`)。
 *
 * ここで測るのは**画面**。action の戻り値を差し替えて、警告が出ること・
 * 全部収まったときは出ないこと (対照) を、同じ操作で見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { FOLDER_PERMISSION_TEXT, LIBRARY_FAILED_TEXT } from '../../data/exportOutcome';

type Sinks = Record<string, unknown>;

/** 書き出し action の戻り値を丸ごと差し替えた serviceHub を置く。 */
function stubHub(data: Sinks): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: true, data }),
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
}

const SAVED: Sinks = { path: 'x.svg', bytes: 2048, downloaded: true, libraryCopy: 'saved', folderCopy: 'saved' };

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
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

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function warningText(): string | null {
  const el = container.querySelector('[data-export-warning]');
  return el ? (el.textContent ?? '') : null;
}

beforeEach(async () => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub(SAVED);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('書き出しの結果に、収まらなかった先が出る', () => {
  it('★ テンプレート: フォルダの許可が切れていると、保存した旨と一緒に理由が出る', async () => {
    stubHub({ ...SAVED, folderCopy: 'permission' });
    await mount('templates');
    await click(buttonByText('SVG を保存'));
    expect(warningText()).toContain(FOLDER_PERMISSION_TEXT);
    // 出来上がった物への案内は残す (警告で置き換えてしまうと、書き出した物に辿れない)
    expect(container.textContent).toContain('保存しました');
  });

  it('★ テンプレート: ライブラリに残せなかったことも出る', async () => {
    stubHub({ ...SAVED, libraryCopy: 'failed' });
    await mount('templates');
    await click(buttonByText('SVG を保存'));
    expect(warningText()).toContain(LIBRARY_FAILED_TEXT);
  });

  it('対照: テンプレート — 3 か所とも収まったら警告は出ない', async () => {
    await mount('templates');
    await click(buttonByText('SVG を保存'));
    expect(container.textContent).toContain('保存しました');
    expect(warningText()).toBeNull();
  });

  it('★ ホームの「今すぐ作る」: 出来上がっても、フォルダに置けていないなら言う', async () => {
    stubHub({ ...SAVED, folderCopy: 'permission' });
    await mount('home');
    await click(buttonByText('今すぐ作る'));
    expect(warningText()).toContain(FOLDER_PERMISSION_TEXT);
    // done の表示 (ファイル名と「ファイルを開く」) は残る
    expect(container.textContent).toContain('出来上がりました');
    expect(container.textContent).toContain('x.svg');
  });

  it('対照: ホーム — 収まったら警告は出ない', async () => {
    await mount('home');
    await click(buttonByText('今すぐ作る'));
    expect(container.textContent).toContain('出来上がりました');
    expect(warningText()).toBeNull();
  });

  it('対照: フォルダ未設定 (off) では警告を出さない —— 連携していない人に毎回出さない', async () => {
    stubHub({ ...SAVED, folderCopy: 'off' });
    await mount('templates');
    await click(buttonByText('SVG を保存'));
    expect(warningText()).toBeNull();
  });
});
