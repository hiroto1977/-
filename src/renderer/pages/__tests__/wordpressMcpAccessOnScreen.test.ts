/** @vitest-environment jsdom */
/**
 * **有料プランのサイトを持つ利用者に「すべて free」と言わない** (2026-09-12 · パス 177)。
 *
 * `WordPressPage` の MCP Access は固定文だった。同じ画面の一覧は `paidPlan` から
 * `paid` / `free` のバッジを刷っているので、**バッジと段落が矛盾する**画面が出ていた。
 * 判定と文面は `data/wordpressMcpAccess.ts`・ここはそれが**画面に届いているか**を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WordPressPage } from '../WordPressPage';
import { settleUntil } from '../../__tests__/jsdomWait';

const SITE = {
  blogId: 1,
  name: 'ブログ A',
  description: '',
  url: 'https://a.example.com',
  platform: 'simple',
  status: 'active',
  lastUpdated: '2026-09-01',
  paidPlan: true,
};

let sites: unknown[] = [SITE];
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  sites = [SITE];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['wordpress']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: { sites } }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'stub' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

/** 取得した中身で描く (`fetchSnapshot` が返るまで待つ)。 */
async function mount(kind: string): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WordPressPage));
  });
  await settleUntil(
    () => container.querySelector(`[data-mcp-access="${kind}"]`) !== null,
    `MCP Access が ${kind} になる`,
  );
  return container.querySelector<HTMLElement>('[data-mcp-access]')!;
}

describe('WordPressPage の MCP Access (パス 177)', () => {
  it('★ 有料サイトだけなら「すべて free」と言わない', async () => {
    const node = await mount('all-paid');
    expect(node.textContent).not.toContain('free プラン');
    expect(node.textContent, '払っている人にアップグレードを要求している').not.toContain('アップグレードが必要');
    expect(node.textContent).toContain('すべて有料プラン');
    // 一覧のバッジと矛盾していない (同じ画面に paid が出ている)。
    expect(container.textContent).toContain('paid');
  });

  it('★ 混在なら両方の件数が出る', async () => {
    sites = [SITE, { ...SITE, blogId: 2, name: 'ブログ B', paidPlan: false }];
    const node = await mount('mixed');
    expect(node.textContent).toContain('有料プラン 1 件');
    expect(node.textContent).toContain('free プラン 1 件');
  });

  it('★ 対照: すべて free なら従来どおりアップグレードを案内する', async () => {
    sites = [{ ...SITE, paidPlan: false }];
    const node = await mount('all-free');
    expect(node.textContent).toContain('すべて free プラン');
    expect(node.textContent).toContain('アップグレードが必要');
  });

  it('★ 取得できていない (0 件) ときはプランを断定しない', async () => {
    sites = [];
    const node = await mount('unknown');
    expect(node.textContent).toContain('判定できません');
    expect(node.textContent).not.toContain('free プラン');
  });
});
