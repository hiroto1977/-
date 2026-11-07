/** @vitest-environment jsdom */
/**
 * **第三者が 1 欄を返さなかっただけで、その画面が丸ごと落ちない。** (2026-09-22 · パス 410)
 *
 * 背骨は**振る舞い** —— 実物の client (`fetchBaseSnapshot` / `fetchCanvaSnapshot`) に
 * 相手の応答をそのまま食わせ、その戻りで画面を描く。型の照合は
 * `main/clients/__tests__/nullableSnapshotFieldWidth.test.ts` が別に持つが、
 * **型が合っていることは画面が描けることではない** (法則
 * `user-facing-claim-held-at-render`)。
 *
 * 実測 (2026-09-22 · 直す前):
 *
 * | 画面 | 相手の応答 | 直す前 |
 * | --- | --- | --- |
 * | BASE | `{"items":[{"item_id":1,"title":"商品A","visible":1}]}` | **`Cannot read properties of undefined (reading 'toLocaleString')`** |
 * | Canva | `thumbnail: {url: 42}` | **`url.replace is not a function`** |
 *
 * ★ どちらも**画面が丸ごと落ちる**側である —— `PageErrorBoundary` が主画面を
 *   守るので他の画面は使えるが、その画面は開けない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BasePage } from '../BasePage';
import { CanvaPage } from '../CanvaPage';
import { fetchBaseSnapshot } from '../../../main/clients/base';
import { fetchCanvaSnapshot } from '../../../main/clients/canva';
import { waitForText } from '../../__tests__/jsdomWait';

/** 相手の応答を順に返す `fetch`。client はこれ以外の外界を持たない。 */
function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string, Page: ComponentType, data: unknown, waitFor: string): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    // **繋がっている**と言わないと画面は同梱の見本を描き、相手の応答が届かない。
    listConfigured: () => Promise.resolve([id]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  // 固定回数では待たない (法則 wait-for-condition-not-ticks)。
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

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

describe('BASE — 価格・在庫が返ってこない商品', () => {
  const ITEMS = {
    items: [
      { item_id: 1, title: '商品A', visible: 1 },
      { item_id: 2, title: '商品B', price: 500, stock: 3, visible: 1 },
    ],
  };

  it('★ 画面は落ちず、読めた商品の価格はそのまま出る', async () => {
    const snap = await fetchBaseSnapshot({ token: 't', fetch: replying([ITEMS]) } as never);
    const t = await mount('base', BasePage, snap, '商品B');
    expect(t).toContain('¥500');
    expect(t).toContain('在庫 3');
  });

  it('★ 読めなかった欄は理由を名乗る (0 と刷らない)', async () => {
    const snap = await fetchBaseSnapshot({ token: 't', fetch: replying([ITEMS]) } as never);
    const t = await mount('base', BasePage, snap, '商品A');
    expect(t).toContain('価格不明');
    expect(t).toContain('在庫不明');
    // 「¥0」「在庫 0」は**事実の主張**になる (無料 / 売り切れ)。
    expect(t).not.toContain('¥0 ');
    expect(t).not.toContain('在庫 0');
  });

  it('client は数でない価格を落とす (文字列の「1000」は値ではない)', async () => {
    const snap = await fetchBaseSnapshot({
      token: 't',
      fetch: replying([{ items: [{ item_id: 3, title: '商品C', price: '1000', stock: '5', visible: 1 }] }]),
    } as never);
    expect(snap.items[0]?.price).toBeNull();
    expect(snap.items[0]?.stock).toBeNull();
    const t = await mount('base', BasePage, snap, '商品C');
    expect(t).toContain('価格不明');
    // 直す前は `¥1000` —— 桁区切りの無い値を金額として刷っていた。
    expect(t).not.toContain('1000');
  });
});

describe('Canva — thumbnail の url が文字列でない', () => {
  const DESIGNS = {
    items: [
      {
        id: 'd1',
        title: 'デザイン',
        thumbnail: { url: 42 },
        urls: { view_url: 'https://www.canva.com/design/d1' },
        updated_at: 1,
      },
    ],
  };

  it('★ 画面は落ちず、デザインの題名は出る', async () => {
    const snap = await fetchCanvaSnapshot({
      token: 't',
      fetch: replying([DESIGNS, { items: [{ id: 'b1' }] }]),
    } as never);
    expect(snap.designs[0]?.thumbnailUrl).toBe('');
    const t = await mount('canva', CanvaPage, snap, 'デザイン');
    expect(t).toContain('デザイン');
  });

  it('★ 読める thumbnail の答えは変わらない', async () => {
    const snap = await fetchCanvaSnapshot({
      token: 't',
      fetch: replying([
        {
          items: [
            {
              id: 'd2',
              title: '読めるデザイン',
              thumbnail: { url: 'https://example.com/t.png' },
              urls: { view_url: 'https://www.canva.com/design/d2' },
              updated_at: 1,
            },
          ],
        },
        { items: [{ id: 'b1' }] },
      ]),
    } as never);
    expect(snap.designs[0]?.thumbnailUrl).toBe('https://example.com/t.png');
    const t = await mount('canva', CanvaPage, snap, '読めるデザイン');
    expect(t).toContain('読めるデザイン');
    expect(container.querySelector('img[src="https://example.com/t.png"]')).not.toBeNull();
  });
});
