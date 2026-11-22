/** @vitest-environment jsdom */
/**
 * **資格情報が無い連携先の画面は、どれも「更新」を出さず、灰色の案内を 1 つ出す。**
 *
 * 2026-11-19 実測 (実 chromium · LITE): ブラウザ版で実データを読める 8 画面 (Cursor / Stripe / Asana / LINE /
 * Linear / Sentry / Discord / Dropbox) は、資格情報を入れずに「更新」を押すと、赤い「エラー」+
 * 「表示中の数字は同梱のサンプルです」+「資格情報が未登録です。登録すると実データに切り替わります。」を出した。
 * デスクトップ版は連携先 22 画面すべてが同じ扱いだった (「トークン未設定」)。
 *
 * ここは母集団 (`SERVICE_DATA_ORIGIN` が 'remote' の画面) を導き、実物の画面を「資格情報なし」で描く。
 * 状態バーの判定は、画面が渡す 3 つ (登録の欄・登録済みか・「更新」の口) が揃って初めて働く ——
 * どれか 1 つを渡し忘れた画面は、ここで名指しで落ちる。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { BROWSER_LIVE_READ_SERVICES } from '../../../shared/browserFetchReach';
import { FETCH_NEEDS_CREDENTIAL_NOTE } from '../../../shared/fetchNeedsCredential';
import { SERVICE_DATA_ORIGIN } from '../../../shared/dataOrigin';
import { SNAPSHOT } from '../../data/snapshot';
import { settleUntil } from '../../__tests__/jsdomWait';

const REMOTE = Object.entries(SERVICE_DATA_ORIGIN)
  .filter(([, origin]) => origin === 'remote')
  .map(([id]) => id)
  .sort();
const READABLE_IN_BROWSER = REMOTE.filter((id) => BROWSER_LIVE_READ_SERVICES.includes(id));

let version = '0.1.0';
let configured: string[] = [];
let asked: string[] = [];
let versionAsked = 0;
let listAsked = 0;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => {
      versionAsked += 1;
      return Promise.resolve(version);
    },
    listConfigured: () => {
      listAsked += 1;
      return Promise.resolve([...configured]);
    },
    fetchSnapshot: (id: string) => {
      asked.push(id);
      return Promise.resolve({ ok: true, data: (SNAPSHOT as unknown as Record<string, unknown>)[id] });
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
  version = '0.1.0';
  configured = [];
  asked = [];
  versionAsked = 0;
  listAsked = 0;
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
  // 実行形態と登録済みの一覧を訊き終えてから見る (済む前と後で「更新」の出方が変わる)。
  await settleUntil(() => versionAsked >= 1 && listAsked >= 1, `${id}: 実行形態と登録済みの一覧を訊き終える`);
  await act(async () => {
    await Promise.resolve();
  });
}

const bar = (): Element | null => container.querySelector('.status-bar');
const badge = (): string => (bar()?.querySelector('.badge')?.textContent ?? '').trim();
const needNotes = (): string[] =>
  Array.from(container.querySelectorAll('.status-bar [data-fetch-needs-credential]')).map((n) => (n.textContent ?? '').trim());
const labels = (): string[] =>
  Array.from(container.querySelectorAll('.status-bar button')).map((b) => (b.textContent ?? '').trim());

describe('資格情報が無い連携先の画面', () => {
  it('母集団は 24 画面で、どれもサイドバーに画面を持つ。ブラウザ版で読めるのはそのうち 10', () => {
    expect(REMOTE).toHaveLength(24); // google-analytics (2026-11-22)
    expect(READABLE_IN_BROWSER).toHaveLength(10);
    for (const id of REMOTE) expect(SERVICES.some((s) => s.id === id), id).toBe(true);
  });

  for (const id of REMOTE) {
    it(`★ デスクトップ版 · ${id} —— 「更新」を出さず、案内を 1 つ出す。登録の欄は出る`, async () => {
      await open(id);
      expect(needNotes()).toEqual([FETCH_NEEDS_CREDENTIAL_NOTE]);
      expect(labels()).not.toContain('更新');
      // 登録の欄へ入る口が 1 つ以上在る (「…を設定」ほか —— 文面は画面ごとに違うので、数だけ見る)。
      expect(labels().length).toBeGreaterThanOrEqual(1);
      expect(badge()).toBe('サンプル（未連携）');
      expect(container.querySelector('.status-bar .badge.warn')).toBeNull();
      expect(container.querySelector('.status-bar [data-fetch-error]')).toBeNull();
      expect(container.querySelector('.status-bar [data-stale-note]')).toBeNull();
      expect(asked).toEqual([]); // 資格情報が無ければ、開いただけでは取得しない
    });
  }

  for (const id of READABLE_IN_BROWSER) {
    it(`★ ブラウザ版 · ${id} —— 「更新」を出さず、案内を 1 つ出す`, async () => {
      version = '0.1.0-web';
      await open(id);
      expect(needNotes()).toEqual([FETCH_NEEDS_CREDENTIAL_NOTE]);
      expect(labels()).not.toContain('更新');
      expect(badge()).toBe('サンプル（未連携）');
      expect(container.querySelector('.status-bar .badge.warn')).toBeNull();
      expect(container.querySelector('.status-bar [data-fetch-error]')).toBeNull();
      expect(asked).toEqual([]);
    });
  }

  for (const id of ['stripe', 'github']) {
    it(`対照: デスクトップ版 · ${id} —— 資格情報を保存済みなら「更新」が在り、案内は出ない`, async () => {
      configured = [id];
      await open(id);
      // 開いただけで取得が走り (鍵が在る)、その答えが届いて札が「ライブ」になるまで待つ。
      await settleUntil(() => asked.includes(id) && badge() === 'ライブ', `${id}: 取得の答えが届く`);
      expect(labels()).toContain('更新');
      expect(needNotes()).toEqual([]);
    });
  }
});
