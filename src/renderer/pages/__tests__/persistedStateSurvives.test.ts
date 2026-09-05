/** @vitest-environment jsdom */
/**
 * 端末に残した JSON は型が守らない (2026-09-05、書類スタジオで実際に踏んだ)。
 * ここは**画面の配線**の検査: 読み取りの小道具 (persistedShape) が各画面に本当に挟まっていて、
 * 形の違う保存値でも画面が開くことを、有効な保存値の標本 (同じ経路で値が出る) と並べて留める。
 * 対照を回した: 各画面の読み取りを `as Shape` に戻すと、この検査は元の TypeError で落ちる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { ChatbotWidget } from '../../components/ChatbotWidget';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

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
  // jsdom に無いスクロール API (画面が末尾へ寄せるときに呼ぶ)
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountService(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function mountElement(el: ReturnType<typeof createElement>): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(el);
  });
  await settle();
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmount();
  document.body.removeChild(container);
});

describe('形の違う保存値でも画面が開く', () => {
  it('★ Team Radar: members が文字列・axes が同じ長さの文字列・title が数値の下書きでも開き、既定の名前に戻る', async () => {
    localStorage.setItem('servicehub.teamradar.draft.v1', JSON.stringify({ members: 'nope', axes: 'abcde', title: 3 }));
    await mountService('teamradar');
    const title = container.querySelector<HTMLInputElement>('input[aria-label="チャート名"]');
    expect(title?.value).toBe('営業チーム強み・弱みシート');
    await unmount();
    // 標本: 合う下書きなら同じ経路で名前とメンバーが出る
    localStorage.setItem('servicehub.teamradar.draft.v1', JSON.stringify({ title: '下書きのチャート名', members: [{ id: 'm1', name: '下書きの山田', scores: [1, 2, 3, 4, 5] }] }));
    await mountService('teamradar');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="チャート名"]')?.value).toBe('下書きのチャート名');
    expect(container.textContent).toContain('下書きの山田');
  });

  it('★ アシスタント: 履歴に null や role 違いが混じっていても開き、形の合う発話だけ残る', async () => {
    localStorage.setItem('assistant-history', JSON.stringify([null, 'x', { role: 'user', text: '保存された質問' }, { role: 'assistant', text: 5 }, { role: 'admin', text: '偽' }]));
    await mountService('assistant');
    expect(container.textContent).toContain('保存された質問');
    expect(container.textContent).not.toContain('偽');
  });

  it('★ チャットボット: 履歴に null が混じっていても開き、形の合う相談だけ出る', async () => {
    localStorage.setItem('chatbot-history', JSON.stringify([null, { role: 'user', text: '保存された相談' }, { role: 'bot', text: '返答', routedThrough: 'x' }, 42]));
    await mountElement(createElement(ChatbotWidget));
    const launcher = Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'AI コンシェルジュを開く');
    expect(launcher).toBeTruthy();
    await click(launcher!);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('保存された相談');
    expect(dialog?.textContent).toContain('返答');
  });
});
