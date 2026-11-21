// @vitest-environment jsdom
/**
 * Asana の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/asana.test.ts` が持つ。ここが見るのは**配線**:
 * 期限の言い分け・読めなかった一覧の理由・見ていない範囲の断りが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AsanaPage } from '../AsanaPage';
import { fetchAsanaSnapshot } from '../../../main/clients/asana';
import { waitForText } from '../../__tests__/jsdomWait';
import { WEB_BUILD_SUFFIX } from '../../../shared/buildDestinations';

/** 相手の応答を順に返す `fetch`。 */
function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
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
    listConfigured: () => Promise.resolve(configured ? ['asana'] : []),
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

const live = async (bodies: readonly unknown[]): Promise<unknown> =>
  fetchAsanaSnapshot({ token: 'pat-example', fetch: replying(bodies) });

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

describe('Asana の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本のタスクを出し、鍵の扱い (広い権限を持つ・照会だけに使う) を案内する', async () => {
    const t = await mount(AsanaPage, false, null, '未完了のタスク');
    expect(t).toContain('見本: 四半期の目標を決める');
    expect(t).toContain('期限 2026-11-25');
    expect(t).toContain('期限なし');
    expect(t).toContain('見本のワークスペース');
    const guide = container.querySelector('[data-asana-key-guide]')?.textContent ?? '';
    expect(guide).toContain('個人アクセストークン');
    expect(guide).toContain('権限を広く持つ');
    expect(guide).toContain('タスクの作成や変更はしません');
    expect(container.querySelector('[data-asana-intake-note]')).toBeNull();
    expect(container.querySelector('[data-asana-scope-note]')).toBeNull();
  });
});

describe('Asana の画面: 実物の client の戻りを描く', () => {
  it('★ 期限は「日付」「期限なし」「読めません」を言い分ける (画面は落ちない)', async () => {
    const data = await live([
      { data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } },
      {
        data: [
          { gid: '100', name: '見積もりを送る', due_on: '2026-11-20' },
          { gid: '101', name: '日程調整', due_on: null },
          { gid: '102', name: '壊れた期限', due_on: 20261120 },
          { gid: '103' },
        ],
      },
    ]);
    const t = await mount(AsanaPage, true, data, '見積もりを送る');
    expect(t).toContain('期限 2026-11-20');
    expect(t).toContain('期限なし');
    expect(t).toContain('期限が読めません');
    expect(t).toContain('(名前なし)');
    expect(t).toContain('山田');
    expect(t).toContain('本社');
    expect(t).toContain('未完了 4 件');
  });

  it('★ 一覧が読めなかった応答は「0 件」と混ぜずに ⚠ で述べる', async () => {
    const data = await live([{ data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } }, {}]);
    await mount(AsanaPage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-asana-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('タスクの一覧を読み取れませんでした (0 件という意味ではありません)');
  });

  it('★ ワークスペースが読めなければ、タスクを照会していないと述べる', async () => {
    const data = await live([{ data: { name: '山田', workspaces: [] } }]);
    await mount(AsanaPage, true, data, 'ワークスペースがありませんでした');
    expect(container.querySelector('[data-asana-intake-note]')?.textContent).toContain('タスクは照会していません');
  });

  it('0 件と答えた応答では ⚠ を出さず、「未完了のタスクはありません」と言う', async () => {
    const data = await live([{ data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } }, { data: [] }]);
    await mount(AsanaPage, true, data, '未完了のタスクはありません');
    expect(container.querySelector('[data-asana-intake-note]')).toBeNull();
    expect(container.querySelector('[data-asana-scope-note]')).toBeNull();
  });

  it('★ 見ていない範囲 (2 つ目以降のワークスペース・21 件目以降) を述べる', async () => {
    const data = await live([
      { data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }, { gid: '43', name: '別会社' }] } },
      { data: [{ gid: '100', name: 'a' }], next_page: { offset: 'abc' } },
    ]);
    await mount(AsanaPage, true, data, 'ワークスペースが 2 個あります');
    const scope = container.querySelector('[data-asana-scope-note]');
    expect(scope?.getAttribute('role')).toBe('note');
    expect(scope?.textContent).toContain('表示しているのは 1 つ目 (本社)のタスクだけです');
    expect(scope?.textContent).toContain('先頭 20 件までを表示しています');
    // 2 つ目のワークスペースの名前は画面に出さない (照会していない物を並べない)。
    expect(container.textContent).not.toContain('別会社');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live([{ data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } }, { data: [] }]);
    await mount(AsanaPage, true, data, '未完了のタスクはありません');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。タスクの名前や期限を打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('Asana の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(AsanaPage, false, null, 'app.asana.com', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-asana-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('app.asana.com');
    expect(container.querySelector('[data-asana-key-guide]')).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(AsanaPage, false, null, '未完了のタスク');
    expect(t).toContain('個人アクセストークン');
    expect(container.querySelector('[data-asana-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(AsanaPage, false, null, '未完了のタスク', null);
    expect(t).toContain('個人アクセストークン');
    expect(container.querySelector('[data-asana-proxy-note]')).toBeNull();
  });
});
