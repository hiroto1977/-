// @vitest-environment jsdom
/**
 * Discord の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/discord.test.ts` が持つ。ここが見るのは**配線**:
 * 参加人数の言い分け・読めなかった一覧の理由・見ていない範囲の断りが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DiscordPage } from '../DiscordPage';
import { fetchDiscordSnapshot } from '../../../main/clients/discord';
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
    listConfigured: () => Promise.resolve(configured ? ['discord'] : []),
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
  fetchDiscordSnapshot({ token: 'aaa.bbb.ccc', fetch: replying(body) });

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

describe('Discord の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本のサーバーを出し、鍵の扱い (照会だけに使う・メッセージは読まない) を案内する', async () => {
    const t = await mount(DiscordPage, false, null, '参加しているサーバー');
    expect(t).toContain('見本: 開発チームのサーバー');
    expect(t).toContain('参加 約 42 人');
    expect(t).toContain('参加 約 1,250 人');
    const guide = container.querySelector('[data-discord-key-guide]')?.textContent ?? '';
    expect(guide).toContain('ボットの「トークン」');
    expect(guide).toContain('トークンだけを入れてください');
    expect(guide).toContain('サーバーの一覧の照会だけ');
    expect(guide).toContain('メッセージの読み取りや送信、サーバーの変更はしません');
    expect(container.querySelector('[data-discord-intake-note]')).toBeNull();
    expect(container.querySelector('[data-discord-scope-note]')).toBeNull();
  });
});

describe('Discord の画面: 実物の client の戻りを描く', () => {
  it('★ 参加人数は「読めた値」と「読めません」を言い分け、名前が無ければそう述べる (画面は落ちない)', async () => {
    const data = await live([
      { id: '111', name: '開発', approximate_member_count: 1234 },
      { id: '222', name: '壊れた欄', approximate_member_count: 'たくさん' },
      {},
    ]);
    const t = await mount(DiscordPage, true, data, '開発');
    expect(t).toContain('参加 約 1,234 人');
    expect(t).toContain('参加人数が読めません');
    expect(t).toContain('(名前なし)');
    expect(t).toContain('サーバー 3 件');
  });

  it('★ 一覧が読めなかった応答は「0 件」と混ぜずに ⚠ で述べる (相手の文面は出さない)', async () => {
    const data = await live({ message: 'SECRET-DETAIL', code: 0 });
    await mount(DiscordPage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-discord-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('サーバーの一覧を読み取れませんでした (0 件という意味ではありません)');
    expect(container.textContent).not.toContain('SECRET-DETAIL');
  });

  it('0 件と答えた応答では ⚠ を出さず、「参加しているサーバーはありません」と言う', async () => {
    const data = await live([]);
    await mount(DiscordPage, true, data, '参加しているサーバーはありません');
    expect(container.querySelector('[data-discord-intake-note]')).toBeNull();
    expect(container.querySelector('[data-discord-scope-note]')).toBeNull();
  });

  it('★ 見ていない範囲 (21 件目以降) を述べる', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i + 1), name: `server-${i + 1}-end` }));
    const data = await live(rows);
    const t = await mount(DiscordPage, true, data, 'ほかにもあります');
    const scope = container.querySelector('[data-discord-scope-note]');
    expect(scope?.getAttribute('role')).toBe('note');
    expect(scope?.textContent).toContain('先頭 20 件までを表示しています');
    // 21 件目は画面に出さない。
    expect(t).toContain('server-20-end');
    expect(t).not.toContain('server-21-end');
    expect(t).toContain('サーバー 20 件');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live([]);
    await mount(DiscordPage, true, data, '参加しているサーバーはありません');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。メッセージを打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('Discord の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(DiscordPage, false, null, 'UPSTREAM_ALLOWLIST', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-discord-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('discord.com を足す');
    expect(container.querySelector('[data-discord-key-guide]')).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(DiscordPage, false, null, '参加しているサーバー');
    expect(t).toContain('ボットのトークン');
    expect(container.querySelector('[data-discord-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(DiscordPage, false, null, '参加しているサーバー', null);
    expect(t).toContain('ボットのトークン');
    expect(container.querySelector('[data-discord-proxy-note]')).toBeNull();
  });
});
