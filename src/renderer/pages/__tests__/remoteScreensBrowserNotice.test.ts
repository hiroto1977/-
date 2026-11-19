/** @vitest-environment jsdom */
/**
 * **ブラウザ版で実データを読めない連携先の画面は、どれも赤い「エラー」を出さない。**
 *
 * 2026-11-19 実測 (実 chromium · LITE): 連携先 22 画面のうち 14 (GitHub / WordPress / Atlassian / Notion /
 * Google Drive / Calendar / Gmail / Slack / Canva / Cloudflare / Microsoft 365 / BASE / YouTube / freee) は、
 * 「更新」を押すと赤い「エラー」+「表示中の数字は同梱のサンプルです」+「ブラウザ版では live fetch を行いません」を出した。
 * 資格情報を保存していると、開いただけで出た (鍵が在ると自動で取得する)。
 *
 * ここは母集団 (`SERVICE_DATA_ORIGIN` が 'remote' で `BROWSER_LIVE_READ_SERVICES` に無い画面) を導き、
 * 実物の画面を「資格情報を保存済み」の状態で描く —— 開いただけで取得が走る、いちばん重い場合。
 * 橋の答えは実物の shim と同じ形 (`not_implemented` + 案内の 1 文 · `browserRemoteFetchReach.test.ts` が実物で留める)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { BROWSER_FETCH_UNSUPPORTED_NOTE, BROWSER_LIVE_READ_SERVICES } from '../../../shared/browserFetchReach';
import { SERVICE_DATA_ORIGIN } from '../../../shared/dataOrigin';
import { SNAPSHOT } from '../../data/snapshot';
import { settleUntil } from '../../__tests__/jsdomWait';

const UNREADABLE = Object.entries(SERVICE_DATA_ORIGIN)
  .filter(([id, origin]) => origin === 'remote' && !BROWSER_LIVE_READ_SERVICES.includes(id))
  .map(([id]) => id)
  .sort();

let version = '0.1.0-web';
let configured: string[] = [];
let asked: string[] = [];
let versionAsked = 0;
const UNSUPPORTED = { ok: false, code: 'not_implemented', message: BROWSER_FETCH_UNSUPPORTED_NOTE };
let answer: unknown = UNSUPPORTED;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => {
      versionAsked += 1;
      return Promise.resolve(version);
    },
    listConfigured: () => Promise.resolve([...configured]),
    fetchSnapshot: (id: string) => {
      asked.push(id);
      return Promise.resolve(answer);
    },
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
beforeEach(() => {
  version = '0.1.0-web';
  // どの画面も「資格情報を保存済み」—— 開いただけで取得が走る。
  configured = [...UNREADABLE];
  asked = [];
  versionAsked = 0;
  answer = UNSUPPORTED;
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function open(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id}: サイドバーに画面が無い`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
}

const bar = (): Element | null => container.querySelector('.status-bar');
const badge = (): string => (bar()?.querySelector('.badge')?.textContent ?? '').trim();
const notes = (): string[] =>
  Array.from(container.querySelectorAll('.status-bar [data-fetch-unsupported]')).map((n) => (n.textContent ?? '').trim());
const hasRefresh = (): boolean =>
  Array.from(container.querySelectorAll('.status-bar button')).some((b) => (b.textContent ?? '').trim() === '更新');

describe('ブラウザ版で実データを読めない連携先の画面', () => {
  it('母集団は 14 画面で、どれもサイドバーに画面を持つ', () => {
    expect(UNREADABLE).toHaveLength(14);
    for (const id of UNREADABLE) expect(SERVICES.some((s) => s.id === id), id).toBe(true);
  });

  for (const id of UNREADABLE) {
    it(`★ ${id} —— 資格情報を保存済みで開いても、赤い「エラー」を出さず、案内を 1 つ出す`, async () => {
      await open(id);
      // 開いただけで取得が走り (鍵が在る)、その答えが画面に届くまで待つ。
      await settleUntil(() => asked.includes(id) && notes().length === 1, `${id}: 取得の答えの後に案内が出る`);
      expect(notes()).toEqual([BROWSER_FETCH_UNSUPPORTED_NOTE]);
      expect(badge()).toBe('サンプル（未連携）');
      expect(container.querySelector('.status-bar .badge.warn')).toBeNull();
      expect(container.querySelector('.status-bar [data-fetch-error]')).toBeNull();
      expect(container.querySelector('.status-bar [data-stale-note]')).toBeNull();
      expect(hasRefresh()).toBe(false);
    });
  }

  it('対照: デスクトップ版の同じ画面 (GitHub) は、資格情報を保存済みなら「更新」が在り、この案内は出ない', async () => {
    version = '0.1.0';
    configured = ['github'];
    // デスクトップ版の橋は取得できる —— ここでは同梱の内容をそのまま返す。
    answer = { ok: true, data: SNAPSHOT.github };
    await open('github');
    // 開いただけで取得が走り (鍵が在る)、その答えが届いて札が「ライブ」になるまで待つ。
    await settleUntil(() => versionAsked >= 1 && asked.includes('github') && badge() === 'ライブ', 'github: 取得の答えが届く');
    await act(async () => {
      await Promise.resolve();
    });
    expect(notes()).toEqual([]);
    expect(hasRefresh()).toBe(true);
  });
});
