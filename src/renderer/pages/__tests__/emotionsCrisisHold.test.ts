/** @vitest-environment jsdom */
/**
 * **「分析」が、危機の文面を窓口も出さずに外部のモデルへ送っていた** (2026-10-16 · パス 525 ·
 * threat: T-090)。感情ページの「テキスト分析」は本文を `emotions/analyze-text` (= Anthropic) へ
 * 送るが、`CounselingCard` が読むのは気分のメモだけで、分析に貼った本文は見ていなかった。
 * 実測 (直す前): 「今日は本当に死にたい。もう終わりにしたい」を貼って押すと invoke が呼ばれ、
 * 画面に相談窓口は出なかった。村 (T-029)・コンシェルジュ・AI アシスタントは危機・他害を
 * 先に判定して送らない —— この画面だけが残っていた。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

/** `analyze-text` へ実際に渡された payload (切られていないことを確かめる)。 */
let invoked: { serviceId: string; action: string; payload: unknown }[];

beforeEach(() => {
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['emotions']),
    // **`keyConfigured: true` を返す** —— 分析ボタンは鍵が無いと押せないので、
    // 天井の判定を見るには鍵が在る状態が要る (同梱スナップショットは false)。
    fetchSnapshot: () =>
      Promise.resolve({ ok: true, data: { moods: [], analyses: [], keyConfigured: true } }),
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

async function mountEmotions(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'emotions');
  if (!def) throw new Error('emotions service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  // 回数でなく条件で待つ (法則 wait-for-condition-not-ticks): 画面が描かれ、鍵が在ると分かって
  // 「分析」が押せるようになるまで。
  await waitForElement(() => container.querySelector('textarea'), '分析の textarea が描かれない');
}

/** 分析の textarea (この画面で唯一の textarea)。 */
function analyzeBox(): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('textarea');
  if (!el) throw new Error('分析の textarea が無い');
  return el;
}

/**
 * 実際の入力として流す。**素の代入では React に届かない** ——
 * React が node ごとに `value` を上書きして最後の値を覚えているため
 * (パス 167 でこれを踏んで 3 件落とした)。
 */
async function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => !analyzeButton().disabled, '「分析」が押せるようにならない (鍵の確認が届かない)');
}

/** 「分析」ボタン。 */
function analyzeButton(): HTMLButtonElement {
  const el = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === '分析');
  if (!el) throw new Error('分析ボタンが無い');
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

const crisisText = '今日は本当に死にたい。もう終わりにしたい';
const calls = () => invoked.filter((c) => c.action === 'analyze-text');

describe('テキスト分析 — 危機の文面は送らず窓口を出す (threat: T-090)', () => {
  it('★ 危機の文面は外部へ送らず、相談窓口を出し、理由を言う (threat: T-090)', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), crisisText);
    await act(async () => {
      analyzeButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(calls(), '危機の文面を外部へ送っている').toEqual([]);
    expect(container.textContent).toContain('外部サービスへは送っていません');
    expect(container.textContent).toContain('いのちの電話');
  });

  it('★ 他害の文面も送らない (threat: T-090)', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), 'あいつを殺したい');
    await act(async () => {
      analyzeButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(calls()).toEqual([]);
  });

  it('★ 対照: 危機でない文面は今までどおり送る', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), '今日は新しい企画が通って嬉しい');
    await act(async () => {
      analyzeButton().click();
    });
    await settleUntil(() => calls().length === 1, '危機でない文面が送られない');
    expect(calls()).toHaveLength(1);
    expect(container.textContent).not.toContain('外部サービスへは送っていません');
  });
});
