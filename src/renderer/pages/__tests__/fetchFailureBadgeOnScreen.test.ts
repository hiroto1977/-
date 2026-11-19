/** @vitest-environment jsdom */
/**
 * **取得が断られたとき、どの画面の札も失敗の種類を言う (「レート制限」「認証エラー」)。**
 *
 * 2026-11-19 実測 (jsdom · 実物の全画面): 取得を 429 で断らせると、取得する 50 画面のうち 32 画面
 * (連携先 9 = Dropbox / Discord / Asana / Linear / Sentry / Stripe / LINE / BASE / Cursor、端末内 23 =
 * 株式・事業ダッシュボード・士業 8 画面ほか) の札が「エラー」だった。資格情報なしで断らせても同じ 32 画面が
 * 「エラー」だった (残る 18 画面は「レート制限」「認証エラー」)。画面が状態バーへ失敗の種類を渡していなかった。
 *
 * ここは母集団 (サイドバーの全画面) を導き、実物の画面で取得を断らせて札を読む。
 * 渡し忘れの綴りは `__tests__/statusBarErrorKindCensus.test.ts` が構文木で数える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { credentialUseOf } from '../../../shared/credentialUse';
import { isRefreshable, originOf } from '../../../shared/dataOrigin';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

type Answer = { ok: false; code: string; message: string };
const RATE_LIMITED: Answer = { ok: false, code: 'http_error', message: 'HTTP 429 Too Many Requests' };
const NOT_CONFIGURED: Answer = { ok: false, code: 'not_configured', message: 'トークン未設定' };
const UNAUTHORIZED: Answer = { ok: false, code: 'http_error', message: 'HTTP 401 Unauthorized' };

/**
 * 取得できる (見本でない) のに、取得の失敗の札を出さない画面。理由つき・両方向。
 *
 *   - `no-status-bar` —— 状態バーを持たない (端末内の記録や計算だけを描く)
 *   - `bar-without-fetch` —— 状態バーは在るが、取得の hook を使わない (失敗の文も渡さない)
 */
const NO_FAILURE_BADGE: Readonly<Record<string, 'no-status-bar' | 'bar-without-fetch'>> = {
  home: 'no-status-bar',
  sales: 'no-status-bar',
  team: 'no-status-bar',
  overview: 'no-status-bar',
  assistant: 'no-status-bar',
  village: 'no-status-bar',
  charts: 'no-status-bar',
  mentor: 'no-status-bar',
  grok: 'no-status-bar',
  vrio: 'no-status-bar',
  library: 'bar-without-fetch',
  settings: 'bar-without-fetch',
};

const FETCHING = SERVICES.map((s) => s.id).filter((id) => isRefreshable(originOf(id)) && !Object.hasOwn(NO_FAILURE_BADGE, id));
const SAMPLE = SERVICES.map((s) => s.id).filter((id) => !isRefreshable(originOf(id)));

let answer: Answer = RATE_LIMITED;
let configured: string[] = [];
let asked: string[] = [];

beforeAll(() => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  const hub = (globalThis as unknown as { serviceHub: Record<string, unknown> }).serviceHub;
  hub.listConfigured = () => Promise.resolve([...configured]);
  hub.fetchSnapshot = (id: string) => {
    asked.push(id);
    return Promise.resolve(answer);
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
beforeEach(() => {
  asked = [];
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

/** 資格情報を保存済みとして画面を開く (保存済みなら、開いただけで取得が 1 度走る)。 */
async function open(id: string, how: Answer): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id}: サイドバーに画面が無い`);
  answer = how;
  configured = [id];
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
}

const badge = (): string => (container.querySelector('.status-bar .badge')?.textContent ?? '').trim();
const FAILURE_BADGES = ['エラー', '認証エラー', 'レート制限'];
const settled = (id: string): boolean => asked.includes(id) && FAILURE_BADGES.includes(badge());
const passwordField = (): Element | null => container.querySelector('.status-bar input[type="password"]');
const labels = (): string[] =>
  Array.from(container.querySelectorAll('.status-bar button')).map((b) => (b.textContent ?? '').trim());

describe('取得が断られたときの札', () => {
  it('母集団: 取得して札を出す画面は 50・見本の画面は 15・札を出さない画面は 12 (合わせてサイドバーの全画面)', () => {
    expect(FETCHING).toHaveLength(50);
    expect(SAMPLE).toHaveLength(15);
    expect(Object.keys(NO_FAILURE_BADGE)).toHaveLength(12);
    expect(FETCHING.length + SAMPLE.length + Object.keys(NO_FAILURE_BADGE).length).toBe(SERVICES.length);
    for (const id of Object.keys(NO_FAILURE_BADGE)) expect(SERVICES.some((s) => s.id === id), id).toBe(true);
  });

  for (const id of FETCHING) {
    it(`★ ${id} —— 429 で断られたら「レート制限」`, async () => {
      await open(id, RATE_LIMITED);
      await settleUntil(() => settled(id), `${id}: 取得が断られて札が失敗になる`);
      expect(badge()).toBe('レート制限');
    });

    it(`★ ${id} —— 資格情報なしで断られたら「認証エラー」`, async () => {
      await open(id, NOT_CONFIGURED);
      await settleUntil(() => settled(id), `${id}: 取得が断られて札が失敗になる`);
      expect(badge()).toBe('認証エラー');
    });
  }

  it('対照: どちらでもない失敗は「エラー」のまま (種類を言い過ぎない)', async () => {
    await open('stripe', { ok: false, code: 'http_error', message: 'HTTP 500 Internal Server Error' });
    await settleUntil(() => settled('stripe'), 'stripe: 取得が断られて札が失敗になる');
    expect(badge()).toBe('エラー');
  });
});

describe('取得の失敗の札を出さない画面 (台帳の逆向き)', () => {
  for (const [id, kind] of Object.entries(NO_FAILURE_BADGE)) {
    it(`${id} —— ${kind}`, async () => {
      await open(id, RATE_LIMITED);
      if (kind === 'no-status-bar') {
        await settleUntil(() => (container.textContent ?? '').length > 0, `${id}: 画面が描かれる`);
        // 状態バーを持つようになったら、この台帳から外して上の母集団へ入れる。
        expect(container.querySelector('.status-bar')).toBeNull();
      } else {
        await waitForElement(() => container.querySelector('.status-bar'), `${id}: 状態バーが出る`);
        // 取得するようになったら、この台帳から外して上の母集団へ入れる。
        await settleUntil(() => true, `${id}: 取得が始まるなら始まる`);
        expect(asked).not.toContain(id);
        expect(FAILURE_BADGES).not.toContain(badge());
      }
    });
  }

  it('標本: 「取得していない」の主張は、取得する画面では成り立たない (針が的に当たる)', async () => {
    await open('stripe', RATE_LIMITED);
    await waitForElement(() => container.querySelector('.status-bar'), 'stripe: 状態バーが出る');
    await settleUntil(() => true, 'stripe: 取得が始まるなら始まる');
    expect(asked).toContain('stripe');
  });
});

describe('見本の画面は取得しない', () => {
  for (const id of SAMPLE) {
    it(`${id} —— 状態バーが出ても取得は走らず、札は失敗にならない`, async () => {
      await open(id, RATE_LIMITED);
      await waitForElement(() => container.querySelector('.status-bar'), `${id}: 状態バーが出る`);
      await settleUntil(() => true, `${id}: 取得が始まるなら始まる`);
      expect(asked).not.toContain(id);
      expect(FAILURE_BADGES).not.toContain(badge());
    });
  }
});

describe('認証で断られたとき、登録の欄を開くのは「入れ直すと直る」画面だけ', () => {
  it('★ Stripe (取得に資格情報を使う) —— 登録の欄が開く', async () => {
    expect(credentialUseOf('stripe')).toBe('fetch');
    await open('stripe', UNAUTHORIZED);
    await settleUntil(() => settled('stripe'), 'stripe: 取得が断られて札が失敗になる');
    expect(badge()).toBe('認証エラー');
    await waitForElement(() => passwordField(), 'stripe: 登録の欄が開く');
  });

  for (const id of ['stocks', 'business', 'skills', 'emotions']) {
    it(`★ ${id} (欄は AI の鍵・取得には使わない) —— 札は「認証エラー」だが、欄は開かず「再認証」とも呼ばない`, async () => {
      expect(credentialUseOf(id as never)).toBe('action');
      await open(id, UNAUTHORIZED);
      await settleUntil(() => settled(id), `${id}: 取得が断られて札が失敗になる`);
      expect(badge()).toBe('認証エラー');
      // 欄を開く判定は札と同じ描画で決まる (`reenter`)。札が出た後も 1 周回してから見る。
      await settleUntil(() => true, `${id}: 欄を開く効果が走るなら走る`);
      expect(passwordField()).toBeNull();
      expect(labels()).not.toContain('再認証');
      // 欄へ入る口そのものは在る (鍵の登録はできる)。
      expect(labels().length).toBeGreaterThanOrEqual(1);
    });
  }
});
