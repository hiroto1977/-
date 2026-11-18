// @vitest-environment jsdom
/**
 * Sentry の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/sentry.test.ts` が持つ。ここが見るのは**配線**:
 * 重大度・発生回数・最終発生日の言い分け・読めなかった一覧の理由・見ていない範囲の断りが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SentryPage } from '../SentryPage';
import { fetchSentrySnapshot } from '../../../main/clients/sentry';
import { waitForText } from '../../__tests__/jsdomWait';
import { WEB_BUILD_SUFFIX } from '../../../shared/buildDestinations';

/** 相手の応答を順に返す `fetch` (1 回目 = 組織の一覧・2 回目 = 問題の一覧)。 */
function replying(...bodies: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;
let invoke: ReturnType<typeof vi.fn>;

async function mount(
  Page: ComponentType,
  configured: boolean,
  data: unknown,
  waitFor: string,
  version: string | null = '0.1.0',
): Promise<string> {
  invoke = vi.fn(() => Promise.resolve({ ok: true, data: {} }));
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    // `null` は「実行形態がまだ分からない」(橋が答えない) 状態を作る。
    getVersion: () => (version === null ? new Promise<string>(() => {}) : Promise.resolve(version)),
    listConfigured: () => Promise.resolve(configured ? ['sentry'] : []),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

const live = async (...bodies: unknown[]): Promise<unknown> =>
  fetchSentrySnapshot({ token: 'sntryu_example', fetch: replying(...bodies) });

const ORGS = [{ slug: 'acme', name: 'Acme' }];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('Sentry の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本の問題を出し、鍵の扱い (読み取りの権限だけ・照会だけに使う) を案内する', async () => {
    const t = await mount(SentryPage, false, null, '未解決の問題');
    expect(t).toContain('DEMO-1 見本: TypeError: 値を読み取れません');
    expect(t).toContain('見本のアプリ · 重大度: エラー · 発生 24 回 · 最終発生 2026-11-17');
    expect(t).toContain('重大度: 致命的');
    const guide = container.querySelector('[data-sentry-key-guide]')?.textContent ?? '';
    expect(guide).toContain('個人のトークン');
    expect(guide).toContain('org:read');
    expect(guide).toContain('event:read');
    expect(guide).toContain('問題の解決や変更はしません');
    expect(guide).toContain('自社で動かしている Sentry には対応していません');
    expect(container.querySelector('[data-sentry-intake-note]')).toBeNull();
    expect(container.querySelector('[data-sentry-scope-note]')).toBeNull();
  });
});

describe('Sentry の画面: 実物の client の戻りを描く', () => {
  it('★ 重大度・発生回数・最終発生日は「読めた値」と「読めません」を言い分ける (画面は落ちない)', async () => {
    const data = await live(ORGS, [
      { shortId: 'WEB-1', title: 'TypeError', level: 'error', count: '1234', lastSeen: '2026-11-17T12:00:00Z', project: { name: 'web' } },
      { shortId: 'WEB-2', title: '壊れた欄', level: 'critical', count: 'たくさん', lastSeen: 20261117 },
      {},
    ]);
    const t = await mount(SentryPage, true, data, 'WEB-1 TypeError');
    expect(t).toContain('web · 重大度: エラー · 発生 1,234 回 · 最終発生 2026-11-17');
    expect(t).toContain('重大度: 重大度が読めません · 発生回数が読めません · 最終発生日が読めません');
    expect(t).toContain('(題名なし)');
    expect(t).toContain('Acme');
    expect(t).toContain('未解決 3 件');
  });

  it('★ 一覧が読めなかった応答は「0 件」と混ぜずに ⚠ で述べる', async () => {
    const data = await live(ORGS, { detail: 'x' });
    await mount(SentryPage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-sentry-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('未解決の問題の一覧を読み取れませんでした (0 件という意味ではありません)');
  });

  it('★ 読める組織が無い応答は、問題を照会していないと述べる (相手の文面は出さない)', async () => {
    const data = await live([{ slug: '../SECRET-DETAIL', name: 'x' }]);
    await mount(SentryPage, true, data, '読める組織がありませんでした');
    expect(container.querySelector('[data-sentry-intake-note]')?.textContent).toContain('問題は照会していません');
    expect(container.textContent).not.toContain('SECRET-DETAIL');
  });

  it('0 件と答えた応答では ⚠ を出さず、「未解決の問題はありません」と言う', async () => {
    const data = await live(ORGS, []);
    await mount(SentryPage, true, data, '未解決の問題はありません');
    expect(container.querySelector('[data-sentry-intake-note]')).toBeNull();
    expect(container.querySelector('[data-sentry-scope-note]')).toBeNull();
  });

  it('★ 見ていない範囲 (2 つ目以降の組織・21 件目以降) を述べる', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ shortId: `WEB-${i + 1}`, title: `t${i + 1}`, level: 'info', count: 1 }));
    const data = await live([...ORGS, { slug: 'beta', name: 'Beta' }], rows);
    const t = await mount(SentryPage, true, data, 'ほかにもあります');
    const scope = container.querySelector('[data-sentry-scope-note]');
    expect(scope?.getAttribute('role')).toBe('note');
    expect(scope?.textContent).toContain('組織が 2 個あります。表示しているのは 1 つ目 (Acme)の問題だけです。');
    expect(scope?.textContent).toContain('先頭 20 件までを表示しています');
    // 21 件目は画面に出さない。
    expect(t).toContain('WEB-20 t20');
    expect(t).not.toContain('WEB-21 t21');
    expect(t).toContain('未解決 20 件');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live(ORGS, []);
    await mount(SentryPage, true, data, '未解決の問題はありません');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。問題の題名や状態を打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('Sentry の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(SentryPage, false, null, 'UPSTREAM_ALLOWLIST', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-sentry-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('sentry.io を足す');
    expect(container.querySelector('[data-sentry-key-guide]')).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(SentryPage, false, null, '未解決の問題');
    expect(t).toContain('個人のトークン');
    expect(container.querySelector('[data-sentry-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(SentryPage, false, null, '未解決の問題', null);
    expect(t).toContain('個人のトークン');
    expect(container.querySelector('[data-sentry-proxy-note]')).toBeNull();
  });
});
