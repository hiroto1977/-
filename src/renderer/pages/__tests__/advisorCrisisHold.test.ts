/** @vitest-environment jsdom */
/**
 * **AI 投資アドバイザー / AI 経営アドバイザーの質問欄が、危機の文面を窓口も出さずに外部のモデルへ
 * 送っていた** (2026-10-27 · threat: T-207)。
 *
 * 2 つの質問欄 (`stocks/advise` · `business/advise`) は質問文を Anthropic へ送るが、検めるのは
 * 空・長さ・制御文字だけで、危機・他害の判定が無かった。実測 (直す前): 「もう死にたい。株をどうすれば
 * いいですか」を入れて押すと `invoke` が呼ばれ、画面に相談窓口は出なかった。村・コンシェルジュ・
 * AI アシスタント・感情ページ (T-090) は危機・他害を**先に**判定して送らない —— この 2 つの欄だけが
 * 残っていた。判定は `counseling.ts` (renderer) に住み、main は import できないので、
 * 感情ページと同じく画面が送る前に止める。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

let invoked: { serviceId: string; action: string; payload: unknown }[];

beforeEach(() => {
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['stocks', 'business']),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'stub' }),
    invoke: (serviceId: string, action: string, payload: unknown) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: false, code: 'x', message: 'stub' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string, placeholder: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForElement(() => questionBox(placeholder), `${id} の質問欄が描かれない`);
}

function questionBox(placeholder: string): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(`input[placeholder^="${placeholder}"]`);
}

async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function askButton(): HTMLButtonElement {
  const el = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'AI に聞く');
  if (!el) throw new Error('「AI に聞く」が無い');
  return el as HTMLButtonElement;
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
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

const adviseCalls = () => invoked.filter((c) => c.action === 'advise');

describe.each([
  ['stocks', '例: 長期保有'],
  ['business', '例: 来期に最も'],
])('%s のアドバイザー — 危機の文面は送らず窓口を出す (threat: T-207)', (id, placeholder) => {
  it('★ 危機の文面は外部へ送らず、相談窓口と理由を出す (threat: T-207)', async () => {
    await mount(id, placeholder);
    await typeInto(questionBox(placeholder)!, 'もう死にたい。株をどうすればいいですか');
    await act(async () => {
      askButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(adviseCalls(), '危機の文面を外部へ送っている').toEqual([]);
    expect(container.textContent).toContain('いのちの電話');
    expect(container.textContent).toContain('119');
  });

  it('★ 他害の文面も送らない (threat: T-207)', async () => {
    await mount(id, placeholder);
    await typeInto(questionBox(placeholder)!, '上司を殺したい。どの事業を畳むべきか');
    await act(async () => {
      askButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(adviseCalls()).toEqual([]);
  });

  it('★ 窓口は次の質問を始めたら消える (出しっぱなしにしない)', async () => {
    await mount(id, placeholder);
    await typeInto(questionBox(placeholder)!, 'もう死にたい');
    await act(async () => {
      askButton().click();
    });
    await waitForText(() => container.textContent ?? '', 'いのちの電話');
    await typeInto(questionBox(placeholder)!, '長期で持てる銘柄を教えて');
    await act(async () => {
      askButton().click();
    });
    await settleUntil(() => adviseCalls().length === 1, '危機でない質問が送られない');
    expect(container.textContent).not.toContain('いのちの電話');
  });

  it('★ 対照: 危機でない質問は今までどおり送る', async () => {
    await mount(id, placeholder);
    await typeInto(questionBox(placeholder)!, '長期保有に向いている候補を教えて');
    await act(async () => {
      askButton().click();
    });
    await settleUntil(() => adviseCalls().length === 1, '危機でない質問が送られない');
    expect(adviseCalls()).toHaveLength(1);
  });
});
