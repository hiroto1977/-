/** @vitest-environment jsdom */
/**
 * **この実行形態では取得できない画面は、押す前にそう言う (赤い失敗にしない)。**
 *
 * ブラウザ版は、連携先 22 画面のうち 14 (GitHub ほか) の実データを読めない (`shared/browserFetchReach.ts`)。
 * 2026-11-19 実測 (実 chromium): その画面には「更新」が在り、押すと赤い「エラー」+
 * 「表示中の数字は同梱のサンプルです」+「ブラウザ版では live fetch を行いません」が出た。
 *
 * 直した後の状態バー:
 *   - ブラウザ版 × 読めない連携先: 「更新」を出さず、灰色の案内を 1 つ出す。札は「サンプル（未連携）」のまま
 *   - 取得が `not_implemented` を返した後 (status が 'unsupported'): 同じ枠に 1 度だけ出す。赤い文も「エラー」の札も出さない
 *   - デスクトップ版・読める連携先・端末内の画面: 今までどおり
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBar } from '../StatusBar';
import { BROWSER_FETCH_UNSUPPORTED_NOTE } from '../../../shared/browserFetchReach';
import { settleUntil } from '../../__tests__/jsdomWait';

type Props = Parameters<typeof StatusBar>[0];

function setHub(version: () => Promise<string>): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: version,
    listConfigured: () => Promise.resolve([]),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}
const BROWSER = (): Promise<string> => Promise.resolve('0.1.0-web');
const DESKTOP = (): Promise<string> => Promise.resolve('0.1.0');

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

async function render(props: Partial<Props>): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(StatusBar, { who: 'someone', onRefresh: () => {}, ...props } as Props));
  });
}

const badge = (): string => (container.querySelector('.status-bar .badge')?.textContent ?? '').trim();
const notes = (): string[] =>
  Array.from(container.querySelectorAll('[data-fetch-unsupported]')).map((n) => (n.textContent ?? '').trim());
const refreshButton = (): Element | undefined =>
  Array.from(container.querySelectorAll('.status-bar button')).find((b) => (b.textContent ?? '').trim() === '更新');

describe('ブラウザ版 × 実データを読めない連携先', () => {
  it('★ 押す前から案内を 1 つ出し、「更新」を出さない。札は「サンプル（未連携）」', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'github' });
    await settleUntil(() => notes().length === 1, '案内が出る');
    expect(notes()).toEqual([BROWSER_FETCH_UNSUPPORTED_NOTE]);
    expect(refreshButton()).toBeUndefined();
    expect(badge()).toBe('サンプル（未連携）');
    expect(container.querySelector('.badge.warn')).toBeNull();
    expect(container.querySelector('[data-stale-note]')).toBeNull();
    expect(container.querySelector('[data-fetch-error]')).toBeNull();
  });

  it('★ 取得が「この版では取得しない」と答えた後も、案内は 1 度だけ・赤い文と「エラー」の札は出ない', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'github', status: 'unsupported', errorMessage: BROWSER_FETCH_UNSUPPORTED_NOTE });
    await settleUntil(() => refreshButton() === undefined, '「更新」が消える');
    expect(notes()).toEqual([BROWSER_FETCH_UNSUPPORTED_NOTE]);
    expect(badge()).toBe('サンプル（未連携）');
    expect(container.querySelector('.badge.warn')).toBeNull();
    expect(container.querySelector('[data-fetch-error]')).toBeNull();
    expect(container.querySelector('[data-stale-note]')).toBeNull();
  });

  it('資格情報の欄は残る (書き込みの操作に使う画面が在る —— 「更新」だけを出さない)', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'github', tokenSetup: { label: 'PAT を設定' } });
    await settleUntil(() => notes().length === 1, '案内が出る');
    const labels = Array.from(container.querySelectorAll('.status-bar button')).map((b) => (b.textContent ?? '').trim());
    expect(labels).toContain('PAT を設定');
    expect(labels).not.toContain('更新');
  });
});

describe('対照 —— 取得できる所では今までどおり', () => {
  it('デスクトップ版の同じ画面: 「更新」が在り、案内は出ない', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'github' });
    // 実行形態の判定が終わるのを待つ手がかりが画面に無いので、判定の Promise を流してから見る。
    await act(async () => {
      await DESKTOP();
    });
    expect(refreshButton()).toBeDefined();
    expect(notes()).toEqual([]);
  });

  it('ブラウザ版でも、読める連携先 (Stripe) には「更新」が在り、案内は出ない', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'stripe' });
    await act(async () => {
      await BROWSER();
    });
    expect(refreshButton()).toBeDefined();
    expect(notes()).toEqual([]);
  });

  it('ブラウザ版でも、端末内の画面 (KPI) には「更新」が在り、案内は出ない', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'kpi' });
    await act(async () => {
      await BROWSER();
    });
    expect(refreshButton()).toBeDefined();
    expect(notes()).toEqual([]);
  });

  it('実行形態が分かるまでは案内を出さず、「更新」も在る (分かった時点で替わる)', async () => {
    let answer!: (v: string) => void;
    setHub(() => new Promise<string>((r) => { answer = r; }));
    await render({ serviceId: 'github' });
    expect(refreshButton()).toBeDefined();
    expect(notes()).toEqual([]);
    await act(async () => {
      answer('0.1.0-web');
    });
    await settleUntil(() => notes().length === 1, '判定の後に案内へ替わる');
    expect(refreshButton()).toBeUndefined();
  });
});

describe('取得の結果が「この版では取得しない」だった時 (実行形態の判定に依らない側)', () => {
  it('★ デスクトップ版でその答えが来ても、灰色の案内として出す (赤い文・「エラー」の札にしない)。「更新」は残る', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'github', status: 'unsupported', errorMessage: 'github はライブフェッチ未対応' });
    await act(async () => {
      await DESKTOP();
    });
    expect(notes()).toEqual(['github はライブフェッチ未対応']);
    expect(container.querySelector('[data-fetch-error]')).toBeNull();
    expect(badge()).toBe('サンプル（未連携）');
    expect(container.querySelector('.badge.warn')).toBeNull();
    expect(refreshButton()).toBeDefined();
  });

  it('対照: 本当の失敗 (status が error) は、今までどおり赤い文と「エラー」の札と「同梱のサンプルです」', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'github', status: 'error', errorMessage: 'HTTP 500' });
    await act(async () => {
      await DESKTOP();
    });
    expect(notes()).toEqual([]);
    expect((container.querySelector('[data-fetch-error]')?.textContent ?? '').trim()).toBe('HTTP 500');
    expect(badge()).toBe('エラー');
    expect(container.querySelector('[data-stale-note]')?.textContent ?? '').toContain('同梱のサンプルです');
  });

  it('案内の文も 1 行に畳む (橋が返した文をそのまま DOM へ入れない)', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'github', status: 'unsupported', errorMessage: '一行目\n二行目' });
    await act(async () => {
      await DESKTOP();
    });
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).not.toContain('\n');
  });
});
