/**
 * @vitest-environment jsdom
 *
 * 実物の AI コンシェルジュに「今月の売上はいくら？」と打ち、**端末の記録から数字で答える**こと (2026-11-22)。
 *
 * それまでは画面の説明 (「売上集計は…の画面です」) しか返さず、数字を知るには画面を開いて探すしかなかった。
 * 答えは保管層を読んで足すだけで、**網へは 1 回も出ない** (橋の invoke を数える)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget, DATA_ANSWER_LABEL } from '../ChatbotWidget';
import { getRecordStore } from '../../data/store';
import { SALES_COLLECTION } from '../../data/sales';
import { BALANCE_SHEET_COLLECTION } from '../../data/balanceSheet';
import { MEMBERS_COLLECTION } from '../../data/members';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { localIsoDate } from '../../../shared/localDate';

if (!('scrollTo' in Element.prototype)) {
  (Element.prototype as unknown as Record<string, unknown>).scrollTo = () => {};
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let invoked: string[] = [];

beforeEach(async () => {
  await resetRecordStore();
  invoked = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    fetchSnapshot: async () => ({ ok: true, data: {} }),
    invoke: async (service: string, action: string) => {
      if (service === 'assistant' && action === 'providers') return { ok: true, data: { providers: [] } };
      invoked.push(`${service}/${action}`);
      return { ok: true, data: { text: 'LLM の答え' } };
    },
  };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
  delete (window as unknown as Record<string, unknown>).serviceHub;
  localStorage.clear();
});

async function ask(text: string): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const el = container;
  await act(async () => {
    root = createRoot(el);
    root.render(createElement(ChatbotWidget));
  });
  const fab = await waitForElement(() => el.querySelector('button'), 'AI コンシェルジュのボタン');
  await act(async () => { fab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const input = await waitForElement<HTMLInputElement>(() => el.querySelector('input'), 'チャットの入力欄');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const send = await waitForElement(
    () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '送信') ?? null,
    '送信ボタン',
  );
  await act(async () => { send.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return el;
}

describe('AI コンシェルジュ — 自分の記録についての問い', () => {
  it('★ 今月の売上を、保存した記録から数字で答える (網へ出ない)', async () => {
    const month = localIsoDate().slice(0, 7);
    await getRecordStore().insert(SALES_COLLECTION, { date: `${month}-01`, channel: 'shopify', amount: 12_345, orders: 3 });
    await getRecordStore().insert(SALES_COLLECTION, { date: `${month}-02`, channel: 'base', amount: 655, orders: 1 });
    const el = await ask('今月の売上はいくら？');
    await waitForText(() => el.textContent ?? '', '¥13,000');
    const t = el.textContent ?? '';
    expect(t).toContain('記録 2 件・注文 4 件');
    expect(t).toContain(DATA_ANSWER_LABEL);
    expect(invoked).toEqual([]);
  });

  it('記録が無ければ「まだ無い」と言い、追加する画面を名指しする', async () => {
    const el = await ask('利益はいくら？');
    await waitForText(() => el.textContent ?? '', 'まだ 1 件もありません');
    expect(el.textContent ?? '').toContain('「経営指標・損益分岐点」の画面');
    expect(invoked).toEqual([]);
  });

  it('★ 現預金と人数も、保存した記録から答える (網へ出ない)', async () => {
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, {
      asOf: '2026-10-31', currentAssets: 5_000_000, cash: 3_210_000, fixedAssets: 0,
      currentLiabilities: 0, fixedLiabilities: 0, netIncome: 0,
    });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'Aさん', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'Bさん', email: 'b@example.com', role: 'member' });
    const el = await ask('現預金はいくら？');
    await waitForText(() => el.textContent ?? '', '¥3,210,000');
    expect(el.textContent ?? '').toContain('基準日 2026-10-31 の控え');
    // 同じ窓でもう 1 問 (打った文と同じ道)。
    const input = el.querySelector('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'メンバーは何人？');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '送信')!;
    await act(async () => { send.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await waitForText(() => el.textContent ?? '', 'メンバーは 2 人です');
    expect(invoked).toEqual([]);
  });

  it('対照: 記録の問いでない自由質問は今までどおり LLM へ回る', async () => {
    const el = await ask('量子力学について教えて');
    await waitForText(() => el.textContent ?? '', 'LLM の答え');
    expect(invoked).toEqual(['assistant/chat']);
    expect(el.textContent ?? '').not.toContain(DATA_ANSWER_LABEL);
  });
});
