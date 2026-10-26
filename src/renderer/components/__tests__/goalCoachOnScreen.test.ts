/**
 * @vitest-environment jsdom
 *
 * 実物の AI コンシェルジュを描いて、**ゴールコーチ**と話す。
 *
 * 見るのは 3 つ: 会話だけで目標 → 木 → 今日の予定まで行けること・預かった目標が
 * 端末に残り「🗑 履歴」で消えること・**つらい言葉はコーチに渡らず寄り添いへ回る**こと。
 * 純ロジックは `goalCoach.test.ts` が持つ。ここは配線 (描いて打つ) だけを留める。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { COACH_STATE_KEY } from '../../data/coachStore';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

if (!('scrollTo' in Element.prototype)) {
  (Element.prototype as unknown as Record<string, unknown>).scrollTo = () => {};
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

async function open(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const el = container;
  await act(async () => {
    root = createRoot(el);
    root.render(createElement(ChatbotWidget));
  });
  const fab = await waitForElement(() => el.querySelector('button'), 'AI コンシェルジュのボタン');
  await act(async () => { fab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await waitForElement<HTMLInputElement>(() => el.querySelector('input'), 'チャットの入力欄');
  return el;
}

async function say(el: HTMLElement, text: string): Promise<void> {
  const input = el.querySelector('input') as HTMLInputElement;
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
}

const INTERVIEW = ['目標を決めたい', '1', '月の売上を 100 万円にする', '家族を安心させたいから', '2027-12-31', '1時間', '月次売上が 100 万円を超えること', '営業の時間が取れない'];

describe('ゴールコーチ — コンシェルジュの中で', () => {
  it('★ 会話だけで目標 → 逆算の木 → 今日の予定まで進み、目標が端末に残る', async () => {
    const el = await open();
    for (const line of INTERVIEW) await say(el, line);
    await waitForText(() => el.textContent ?? '', '月の売上を 100 万円にする');
    expect(el.textContent ?? '').toContain('ゴールコーチ');
    await say(el, 'これで進める');
    await say(el, '今日の予定');
    await waitForText(() => el.textContent ?? '', '今日');
    const saved = localStorage.getItem(COACH_STATE_KEY);
    expect(saved).not.toBeNull();
    // 目標を端末に残している (画面を閉じても翌日続けられる)
    expect(saved).toContain('月の売上を 100 万円にする');
  });

  it('★ 「コーチをやめる」で預かった目標を端末から消す', async () => {
    const el = await open();
    await say(el, '目標を決めたい');
    await waitForText(() => el.textContent ?? '', '経営者・事業主');
    expect(localStorage.getItem(COACH_STATE_KEY)).not.toBeNull();
    await say(el, 'コーチをやめる');
    await waitForText(() => el.textContent ?? '', '消');
    expect(localStorage.getItem(COACH_STATE_KEY)).toBeNull();
  });

  it('★ 「🗑 履歴」は会話と一緒に預かった目標も消す', async () => {
    const el = await open();
    await say(el, '目標を決めたい');
    await waitForText(() => el.textContent ?? '', '経営者・事業主');
    expect(localStorage.getItem(COACH_STATE_KEY)).not.toBeNull();
    const clear = Array.from(el.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '会話履歴を消去');
    expect(clear).toBeDefined();
    await act(async () => { clear!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(localStorage.getItem(COACH_STATE_KEY)).toBeNull();
  });

  it('★ つらい言葉はコーチに渡さない (目標の質問へ進まず、保存もしない)', async () => {
    const el = await open();
    // 入口の言葉 (目標を決め) と危機の言葉が同居する発話 —— 安全の門が無ければコーチが始まってしまう。
    await say(el, '目標を決めたいけど死にたい');
    await waitForText(() => el.textContent ?? '', '死にたい');
    // コーチは始まっていない
    expect(localStorage.getItem(COACH_STATE_KEY)).toBeNull();
    expect(el.textContent ?? '').not.toContain('経営者・事業主');
  });

  it('★ 読めない保存値は捨てて始めから (投げない)', async () => {
    localStorage.setItem(COACH_STATE_KEY, JSON.stringify({ v: 1, phase: 'active', nodes: 'x' }));
    const el = await open();
    await say(el, '今日の予定');
    // 状態が無いので、コーチは「今日の予定」を自分の言葉とは受けない
    expect(el.textContent ?? '').not.toContain('ゴールコーチ ·');
  });
});
