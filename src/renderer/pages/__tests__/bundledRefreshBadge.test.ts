/** @vitest-environment jsdom */
/**
 * **端末を読めていない取得に、緑の「ローカル」を付けない。**
 *
 * ブラウザ版は単一 HTML で動くので、Linux の画面は OS を、Skills の画面は `~/.claude/skills` を
 * 読めない。「更新」を押すと `web-shim.ts` は同梱の内容に `isMock: true` を重ねて返す
 * (`data/browserBundledFetch.ts`)。緑の札は「実際に取ってきた」時だけの色
 * (`shared/dataOrigin.ts` の `describeOrigin`) なので、その中身には「同梱データ」の札を出す。
 *
 * 2026-11-19 まで、この 2 画面は `payloadIsMock` を状態バーへ渡していなかった —— デスクトップ版の
 * 取得は実物を読むので要らなかったが、ブラウザ版に取得の枝を足すと緑の「ローカル」が付く形だった。
 *
 * デスクトップ版 (中身が `isMock` を名乗らない) の札は今までどおり「ローカル」。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { SNAPSHOT } from '../../data/snapshot';
import { bundledPayloadForBrowser } from '../../data/browserBundledFetch';
import { settleUntil } from '../../__tests__/jsdomWait';

const SNAPSHOTS = SNAPSHOT as unknown as Readonly<Record<string, Record<string, unknown>>>;

type Hub = {
  getVersion: () => Promise<string>;
  listConfigured: () => Promise<string[]>;
  fetchSnapshot: (id: string) => Promise<unknown>;
};
const hub = (): Hub => (globalThis as unknown as { serviceHub: Hub }).serviceHub;

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

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
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

const badge = (): string => (container.querySelector('.status-bar .badge')?.textContent ?? '').trim();

/** 画面を描き、「更新」を押して、札が「読込中…」でも「スナップショット」でもなくなるまで待つ。 */
async function refreshOn(id: string, payload: unknown): Promise<void> {
  hub().fetchSnapshot = (asked: string) =>
    Promise.resolve(asked === id ? { ok: true, data: payload } : { ok: false, code: 'x', message: 'x' });
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settleUntil(() => badge() === 'スナップショット', `${id}: 取得前の札「スナップショット」`);
  const button = Array.from(container.querySelectorAll('.status-bar button')).find(
    (b) => (b.textContent ?? '').trim() === '更新',
  );
  if (!button) throw new Error(`${id}: 「更新」ボタンが無い`);
  await act(async () => {
    (button as HTMLButtonElement).click();
  });
  await settleUntil(
    () => badge() !== 'スナップショット' && badge() !== '読込中…',
    `${id}: 「更新」の後に札が変わる`,
  );
}

describe('端末を読めていない取得の札', () => {
  it('★ Linux —— ブラウザ版の取得 (同梱の内容 + isMock) の札は「同梱データ」で、緑にしない', async () => {
    await refreshOn('linux', bundledPayloadForBrowser('linux', SNAPSHOTS));
    expect(badge()).toBe('同梱データ');
    expect(container.querySelector('.status-bar .badge.ok')).toBeNull();
    expect(container.querySelector('.status-bar .badge.warn')).toBeNull();
  });

  it('★ Skills —— ブラウザ版の取得 (空の一覧 + isMock) の札は「同梱データ」で、読めない理由も出たまま', async () => {
    await refreshOn('skills', bundledPayloadForBrowser('skills', SNAPSHOTS));
    expect(badge()).toBe('同梱データ');
    expect(container.querySelector('.status-bar .badge.ok')).toBeNull();
    expect(container.querySelector('[data-skills-unavailable]')?.textContent ?? '').toContain('読み取れません');
  });

  it('対照: 中身が isMock を名乗らない取得 (デスクトップ版が端末を読んだ値) の札は、緑の「ローカル」のまま', async () => {
    await refreshOn('linux', { ...SNAPSHOTS.linux });
    expect(badge()).toBe('ローカル');
    expect(container.querySelector('.status-bar .badge.ok')).not.toBeNull();
  });

  it('対照: Skills も、isMock を名乗らない取得は緑の「ローカル」', async () => {
    await refreshOn('skills', { items: [] });
    expect(badge()).toBe('ローカル');
  });
});
