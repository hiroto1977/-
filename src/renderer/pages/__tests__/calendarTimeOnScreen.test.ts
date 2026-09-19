/** @vitest-environment jsdom */
/**
 * **カレンダーの画面で、読めない時刻と成り立たない範囲を実際に見る** (2026-09-12 · パス 185)。
 *
 * `timestampPrintCensus.test.ts` は原文の走査なので「素の `new Date` が無い」まで
 * しか言えない。**画面が何を刷るか**は描いてみるしかない (パス 175)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarPage } from '../CalendarPage';
import { SNAPSHOT } from '../../data/snapshot';

let invoked: { action: string; payload: Record<string, unknown> }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

/** 取得に返す中身。**時間指定なのに開始が空**の予定を 1 件混ぜる。 */
const FETCHED = {
  ...SNAPSHOT.calendar,
  events: [
    { id: 'ok', summary: '読める予定', startDate: '2035-05-20T10:00:00+09:00', allDay: false },
    // main の fetcher は `e.start.dateTime ?? ''` と倒すので、この形が届きうる。
    { id: 'bad', summary: '開始が空の予定', startDate: '', allDay: false },
    { id: 'day', summary: '終日の予定', startDate: '2035-05-21', allDay: true },
  ],
};

beforeEach(() => {
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['calendar']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: FETCHED }),
    invoke: (_s: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      return Promise.resolve({ ok: true, data: { id: 'x', htmlLink: 'https://example.com/x' } });
    },
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

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(CalendarPage));
  });
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function field(type: string, nth = 0): HTMLInputElement {
  const el = [...container.querySelectorAll('input')].filter((i) => i.type === type)[nth];
  if (!el) throw new Error(`欄が無い: ${type}#${nth}`);
  return el;
}

/** placeholder で引く (画面には資格情報の欄も在るので type だけでは足りない)。 */
function byPlaceholder(placeholder: string): HTMLInputElement {
  const el = [...container.querySelectorAll('input')].find((i) => i.placeholder === placeholder);
  if (!el) throw new Error(`欄が無い: ${placeholder}`);
  return el;
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('読めない開始時刻 (パス 185)', () => {
  it('★ 英語の「Invalid Date」を刷らない', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text, '読めない値が Invalid Date として刷られている').not.toContain('Invalid Date');
    expect(text).toContain('開始時刻が読めません');
  });

  it('★ 対照: 読める予定と終日の予定は今までどおり刷る', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain('読める予定');
    expect(text).toContain('終日の予定');
    // 終日は日付そのまま + （終日）。
    expect(text).toContain('2035-05-21（終日）');
    // 時間指定の読める予定は月日と時刻に整形される (ロケールに依らない部分で見る)。
    expect(text).toMatch(/5\/20/);
  });
});

describe('終了が開始より後でない組 (パス 185)', () => {
  /** フォームを開き、タイトル・開始・終了を入れる。 */
  async function fill(startV: string, endV: string): Promise<void> {
    await mount();
    await act(async () => {
      button('予定を作成')?.click();
    });
    await type(byPlaceholder('タイトル'), '打ち合わせ');
    await type(field('datetime-local', 0), startV);
    await type(field('datetime-local', 1), endV);
  }

  it('★ 終了が開始より前なら、押せず・理由を言う', async () => {
    await fill('2035-05-20T11:00', '2035-05-20T10:00');
    expect(
      container.querySelector('[data-calendar-range-note]')?.textContent,
      '理由が出ていない',
    ).toContain('終了は開始より後');
    expect(button('作成')?.disabled, '必ず失敗する組で押せる').toBe(true);
    await act(async () => {
      button('作成')?.click();
    });
    expect(invoked, '必ず失敗する組を送っている').toEqual([]);
  });

  it('★ 開始と終了が同じ時刻でも断る (境界)', async () => {
    await fill('2035-05-20T10:00', '2035-05-20T10:00');
    expect(button('作成')?.disabled).toBe(true);
  });

  it('★ 対照: 終了が後なら押せて、送れる', async () => {
    await fill('2035-05-20T10:00', '2035-05-20T11:00');
    expect(container.querySelector('[data-calendar-range-note]'), '正しい組で断っている').toBeNull();
    expect(button('作成')?.disabled, '正しい組で押せない').toBe(false);
    await act(async () => {
      button('作成')?.click();
    });
    expect(invoked).toHaveLength(1);
    expect(invoked[0]?.payload).toMatchObject({
      summary: '打ち合わせ',
      start: '2035-05-20T10:00:00',
      end: '2035-05-20T11:00:00',
    });
  });

  it('★ 対照: 片方だけ入っているときは範囲の理由を出さない (別の理由で押せない)', async () => {
    await fill('2035-05-20T10:00', '');
    expect(container.querySelector('[data-calendar-range-note]')).toBeNull();
    expect(button('作成')?.disabled, '終了が空なのに押せる').toBe(true);
  });
});
