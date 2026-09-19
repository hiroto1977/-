/** @vitest-environment jsdom */
/**
 * **2 つの操作は、互いの結果も関門も消さない** (2026-09-13 · パス 192)。
 *
 * ## 実測した欠陥
 *
 * `ServiceActionPanel` には独立した操作が 2 つ在る —— 業務メモの記録
 * (`record-entry`) と改善提案 (`advise`)。2026-09-13 まで 1 つの `phase` と 1 つの
 * `result` を共有していた。実物の画面 (`RealEstatePage`) を jsdom で描いて押すと:
 *
 * ```
 *   [1] メモを記録            → 「⚠ メモを受け付けました」が出る
 *   [2] 続けて改善提案を押す   → ★ 記録の確認が消える (提案に置き換わる)
 *   [3] 提案の後にもう一度記録 → ★ 提案が消える (確認に置き換わる)
 *
 *   [4] メモを記録 (飛行中)    → 記録ボタンは「送信中…」で disabled (正しい)
 *   [5] その間に改善提案を押す  → ★ 記録ボタンが「メモを記録」に戻り disabled=false
 *   [6] もう一度押す          → ★ 同じメモで record-entry が 2 回飛ぶ
 * ```
 *
 * [2]/[3] は「どちらも成功しているのに片方しか残らない」。記録の確認が消えた後、
 * メモが受け付けられたことを示す物は画面に何も無い。
 * [5]/[6] は **隣のボタンが自分の関門を外す** 形で、パス 124 が 22 か所に入れた
 * `useSubmitGuard` はここに来ていなかった —— あの母集団は「record store に触る
 * ファイル」で数えており、業務記録を `serviceHub.invoke` で送るこのパネルは
 * **仕組みで引いた線の外側**に在った。
 *
 * ここでは押して確かめる。`invoke` は解決を保留できる差し替えを渡し、
 * **飛行中の状態**を実際に作る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

const REC = {
  ok: true,
  data: { serviceId: 'real-estate', recordedAt: '2026-09-13T00:00:00.000Z', persisted: false },
};
const ADV = {
  ok: true,
  data: {
    recommendations: [{ title: 'ADVICE_TITLE', rationale: 'ADVICE_WHY' }],
    disclaimer: '投資助言ではありません',
    notForRealMoney: true,
    basis: 'BASIS_TEXT',
    phase: 'rules',
  },
};

/** `invoke` の呼ばれ方と、解決を保留する仕掛け。 */
let calls: string[] = [];
let hold = false;
let held: (() => void)[] = [];

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_id: string, action: string) => {
      calls.push(action);
      const value = action === 'advise' ? ADV : REC;
      if (!hold) return Promise.resolve(value);
      return new Promise((resolve) => {
        held.push(() => resolve(value));
      });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(async () => {
  calls = [];
  hold = false;
  held = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  _resetCollectionSubscribersForTests();
  await resetRecordStore();
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

/** 文字列を含むボタン (毎回引き直す —— ラベルは状態で変わる)。 */
function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
}

function noteField(): HTMLInputElement {
  const el = [...container.querySelectorAll('input')].find((i) =>
    (i as HTMLInputElement).placeholder?.includes('メモ'),
  );
  if (!el) throw new Error('メモ欄が無い');
  return el as HTMLInputElement;
}

async function typeNote(value: string): Promise<void> {
  const el = noteField();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('value setter が無い');
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

async function click(label: string): Promise<void> {
  const b = button(label);
  if (!b) throw new Error(`ボタンが無い: ${label}`);
  await act(async () => {
    b.click();
  });
  await settle();
}

const screen = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const recordCalls = (): number => calls.filter((c) => c === 'record-entry').length;

describe('業務操作パネル — 記録と提案は互いを消さない', () => {
  it('走査の的が在る (メモ欄と 2 つのボタン)', () => {
    expect(noteField()).toBeDefined();
    expect(button('メモを記録')).toBeDefined();
    expect(button('改善提案')).toBeDefined();
  });

  it('★ 提案を押しても、記録の確認は残る', async () => {
    await typeNote('修繕費 3 万円');
    await click('メモを記録');
    expect(screen(), '記録の確認が出ていない').toContain('受け付けました');

    await click('改善提案');
    expect(screen(), '★ 提案を押したら記録の確認が消えました').toContain('受け付けました');
    expect(screen()).toContain('BASIS_TEXT');
  });

  it('★ 記録しても、読んでいる提案は残る', async () => {
    await click('改善提案');
    expect(screen()).toContain('ADVICE_TITLE');

    await typeNote('固定資産税');
    await click('メモを記録');
    expect(screen(), '★ 記録したら提案が消えました').toContain('ADVICE_TITLE');
    expect(screen()).toContain('受け付けました');
  });

  it('★ 記録が飛行中に提案を押しても、記録ボタンは押せる状態に戻らない', async () => {
    hold = true;
    await typeNote('二重送信テスト');
    await click('メモを記録');
    expect(recordCalls(), '記録が 1 回飛んでいない').toBe(1);
    expect(button('送信中…')?.disabled, '飛行中に disabled でない').toBe(true);

    // 隣のボタンを押す —— これで関門が外れてはいけない。
    await click('改善提案');
    expect(
      button('メモを記録'),
      '★ 記録が飛行中なのに「メモを記録」へ戻りました (隣のボタンが関門を外した)',
    ).toBeUndefined();
    expect(button('送信中…')?.disabled).toBe(true);

    // 解放して 1 回だけであることを確かめる。
    await act(async () => {
      for (const resolve of held) resolve();
      held = [];
    });
    await settle();
    expect(recordCalls(), '★ 同じメモで record-entry が 2 回飛びました').toBe(1);
  });

  it('★ 飛行中の 2 度目の押しは、関門が黙って落とす (同じ tick でも)', async () => {
    hold = true;
    await typeNote('同じ tick の 2 度押し');
    const b = button('メモを記録');
    if (!b) throw new Error('記録ボタンが無い');
    // 1 度の act の中で 2 回押す —— state 由来の busy では止まらない形。
    await act(async () => {
      b.click();
      b.click();
    });
    await settle();
    expect(recordCalls(), '★ 同じ tick の 2 度押しで 2 回飛びました').toBe(1);
    await act(async () => {
      for (const resolve of held) resolve();
      held = [];
    });
    await settle();
  });

  it('提案が失敗しても、記録の確認は残る (失敗は提案の側に出る)', async () => {
    await typeNote('先に記録');
    await click('メモを記録');
    expect(screen()).toContain('受け付けました');

    // 次の invoke だけ失敗させる。
    const hub = (globalThis as unknown as { serviceHub: { invoke: unknown } }).serviceHub;
    const original = hub.invoke;
    hub.invoke = (_id: string, action: string) => {
      calls.push(action);
      return Promise.resolve({ ok: false, code: 'boom', message: 'PROVIDER_DOWN' });
    };
    try {
      await click('改善提案');
    } finally {
      hub.invoke = original;
    }
    expect(screen(), '提案の失敗が出ていない').toContain('PROVIDER_DOWN');
    expect(screen(), '★ 提案が失敗したら記録の確認が消えました').toContain('受け付けました');
    expect(container.querySelector('[data-advise-error]'), '提案の失敗に印が無い').not.toBeNull();
  });

  it('記録が失敗しても、読んでいる提案は残る (失敗は記録の側に出る)', async () => {
    await click('改善提案');
    expect(screen()).toContain('ADVICE_TITLE');

    const hub = (globalThis as unknown as { serviceHub: { invoke: unknown } }).serviceHub;
    const original = hub.invoke;
    hub.invoke = (_id: string, action: string) => {
      calls.push(action);
      return Promise.resolve({ ok: false, code: 'boom', message: 'STORE_REFUSED' });
    };
    try {
      await typeNote('失敗する記録');
      await click('メモを記録');
    } finally {
      hub.invoke = original;
    }
    expect(screen(), '記録の失敗が出ていない').toContain('STORE_REFUSED');
    expect(screen(), '★ 記録が失敗したら提案が消えました').toContain('ADVICE_TITLE');
    expect(container.querySelector('[data-record-error]'), '記録の失敗に印が無い').not.toBeNull();
  });
});
