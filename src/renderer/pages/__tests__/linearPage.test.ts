// @vitest-environment jsdom
/**
 * Linear の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/linear.test.ts` が持つ。ここが見るのは**配線**:
 * 期限と優先度の言い分け・読めなかった一覧と断りの理由・見ていない範囲の断りが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LinearPage } from '../LinearPage';
import { fetchLinearSnapshot } from '../../../main/clients/linear';
import { waitForText } from '../../__tests__/jsdomWait';
import { WEB_BUILD_SUFFIX } from '../../../shared/buildDestinations';

/** 相手の応答を返す `fetch`。 */
function replying(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
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
    listConfigured: () => Promise.resolve(configured ? ['linear'] : []),
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

const live = async (body: unknown): Promise<unknown> =>
  fetchLinearSnapshot({ token: 'lin_api_example', fetch: replying(body) });

const viewer = (nodes: unknown, hasNextPage = false): unknown => ({
  data: { viewer: { name: '山田', assignedIssues: { nodes, pageInfo: { hasNextPage } } } },
});

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

describe('Linear の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本の課題を出し、鍵の扱い (権限を持つ・照会だけに使う) を案内する', async () => {
    const t = await mount(LinearPage, false, null, '未完了の課題');
    expect(t).toContain('DEMO-1 見本: ログイン画面の表示が遅い');
    expect(t).toContain('進行中 · 見本のチーム · 優先度: 高 · 期限 2026-11-25');
    expect(t).toContain('優先度: 優先度なし');
    expect(t).toContain('期限なし');
    const guide = container.querySelector('[data-linear-key-guide]')?.textContent ?? '';
    expect(guide).toContain('個人の API キー');
    expect(guide).toContain('読み取りだけ');
    expect(guide).toContain('課題の作成や変更はしません');
    expect(container.querySelector('[data-linear-intake-note]')).toBeNull();
    expect(container.querySelector('[data-linear-scope-note]')).toBeNull();
  });
});

describe('Linear の画面: 実物の client の戻りを描く', () => {
  it('★ 期限と優先度は「読めた値」「無い」「読めません」を言い分ける (画面は落ちない)', async () => {
    const data = await live(
      viewer([
        { identifier: 'ENG-1', title: '見積もりを送る', priority: 1, dueDate: '2026-11-20', state: { name: '進行中' }, team: { name: '開発' } },
        { identifier: 'ENG-2', title: '日程調整', priority: 0, dueDate: null },
        { identifier: 'ENG-3', title: '壊れた欄', priority: '高', dueDate: 20261120 },
        {},
      ]),
    );
    const t = await mount(LinearPage, true, data, '見積もりを送る');
    expect(t).toContain('ENG-1 見積もりを送る');
    expect(t).toContain('進行中 · 開発 · 優先度: 緊急 · 期限 2026-11-20');
    expect(t).toContain('優先度: 優先度なし · 期限なし');
    expect(t).toContain('優先度: 優先度が読めません · 期限が読めません');
    expect(t).toContain('(題名なし)');
    expect(t).toContain('山田');
    expect(t).toContain('未完了 4 件');
  });

  it('★ 一覧が読めなかった応答は「0 件」と混ぜずに ⚠ で述べる', async () => {
    const data = await live({ data: { viewer: { name: '山田' } } });
    await mount(LinearPage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-linear-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('課題の一覧を読み取れませんでした (0 件という意味ではありません)');
  });

  it('★ Linear が断った応答 (errors) は、相手の文面を出さずに、断られたことと確かめる所を述べる', async () => {
    const data = await live({ errors: [{ message: 'SECRET-DETAIL-FROM-SERVER' }] });
    await mount(LinearPage, true, data, '照会を断りました');
    const note = container.querySelector('[data-linear-intake-note]');
    expect(note?.textContent).toContain('鍵の有効期限と権限を確かめてください');
    expect(container.textContent).not.toContain('SECRET-DETAIL-FROM-SERVER');
  });

  it('0 件と答えた応答では ⚠ を出さず、「未完了の課題はありません」と言う', async () => {
    const data = await live(viewer([]));
    await mount(LinearPage, true, data, '未完了の課題はありません');
    expect(container.querySelector('[data-linear-intake-note]')).toBeNull();
    expect(container.querySelector('[data-linear-scope-note]')).toBeNull();
  });

  it('★ 見ていない範囲 (21 件目以降) を述べる', async () => {
    const data = await live(viewer([{ identifier: 'ENG-1', title: 'a', priority: 3 }], true));
    await mount(LinearPage, true, data, 'ほかにもあります');
    const scope = container.querySelector('[data-linear-scope-note]');
    expect(scope?.getAttribute('role')).toBe('note');
    expect(scope?.textContent).toContain('先頭 20 件までを表示しています');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live(viewer([]));
    await mount(LinearPage, true, data, '未完了の課題はありません');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。課題の題名や期限を打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('Linear の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(LinearPage, false, null, 'api.linear.app', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-linear-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('api.linear.app');
    expect(container.querySelector('[data-linear-key-guide]')).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(LinearPage, false, null, '未完了の課題');
    expect(t).toContain('個人の API キー');
    expect(container.querySelector('[data-linear-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(LinearPage, false, null, '未完了の課題', null);
    expect(t).toContain('個人の API キー');
    expect(container.querySelector('[data-linear-proxy-note]')).toBeNull();
  });
});
