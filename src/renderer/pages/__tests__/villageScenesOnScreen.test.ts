/** @vitest-environment jsdom */
/**
 * **村の景色が「村人どうしの会話の場面」と「頼んだ作業の様子」を見せる (2026-11-06)。**
 *
 * 実物の村を描いて、(1) 何もしなくても掛け合いが記録に出る (2) 話しかけると受付 → 割り当て → 作業中の
 * 流れが札で見える (3) コンシェルジュが実際に実行した操作の知らせが作業中 → 完了 / 失敗として景色に出る
 * (4) 「💬 場面」を切ると掛け合いが止まる、を見る。台本は台帳の事実から組んだ物で AI の返答ではない。
 * 時計は村の tick (setInterval) だけを偽物にする —— 条件で待つ待ちは本物の時間で動く。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { waitForElement } from '../../__tests__/jsdomWait';
import { SERVICES } from '../../services';
import { publishConversationWork } from '../../data/conversationWork';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
});

/** AI の呼び出しの代役。既定は失敗。`pending` は返らない (返答待ちのまま)。 */
type InvokeStub = () => Promise<unknown>;
const FAILING: InvokeStub = async () => ({ ok: false, message: 'x' });
const SUCCEEDING: InvokeStub = async () => ({ ok: true, data: { text: 'モデルの返答' } });
const PENDING: InvokeStub = () => new Promise(() => undefined);

async function mount(invoke: InvokeStub = FAILING): Promise<HTMLDivElement> {
  installPageRenderGlobals(() => undefined);
  const hub = (window as unknown as { serviceHub: Record<string, unknown> }).serviceHub;
  hub['invoke'] = invoke;
  hub['fetchSnapshot'] = async () => ({ ok: true, data: { providers: [] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const Page = SERVICES.find((s) => s.id === 'village')!.page;
  await act(async () => {
    root!.render(createElement(Page));
  });
  return container;
}

async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
  }
}

const logLines = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('[data-village-scenes] [role="log"] li')).map((li) => li.textContent ?? '');
const chips = (c: HTMLElement): HTMLElement[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-village-flow] [data-flow-chip]'));

async function speak(c: HTMLElement, text: string): Promise<void> {
  const input = await waitForElement<HTMLInputElement>(
    () => c.querySelector<HTMLInputElement>('input[aria-label="村への入力"]'),
    '村への入力欄',
  );
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('村の景色が会話の場面と作業の様子を見せる', () => {
  it('★ 何もしなくても村人どうしの掛け合いが記録に出て、時間が進むと増える', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    const first = logLines(c);
    expect(first.length, '最初の 1 行が記録に出ていない').toBeGreaterThanOrEqual(1);
    await ticks(4);
    const later = logLines(c);
    expect(later.length, '時間が進んでも記録が増えない').toBeGreaterThan(first.length);
    // 記録は話した人の名前から始まる (名前は台帳の事実)。
    expect(later[0]!.length).toBeGreaterThan(2);
  });

  it('★ 「💬 場面」を切ると掛け合いは新しく増えない', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    const box = Array.from(c.querySelectorAll('label')).find((l) => l.textContent?.includes('場面'))!
      .querySelector('input') as HTMLInputElement;
    await act(async () => {
      box.click();
    });
    await ticks(1);
    const before = logLines(c).length;
    await ticks(12);
    expect(logLines(c).length, '切ったのに掛け合いが記録へ増えた').toBe(before);
  });

  it('★ 話しかけると受付から割り当てへ札が進み、AI の返答が来たら完了で畳まれる', async () => {
    const c = await mount(SUCCEEDING);
    await speak(c, '消費税の申告について教えて');
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    const labels = chips(c).map((x) => x.getAttribute('data-flow-chip'));
    expect(labels[0]).toBe('受付');
    expect(labels).toContain('作業中');
    expect(chips(c).find((x) => x.getAttribute('data-current') === 'true')?.getAttribute('data-flow-chip')).toBe('受付');
    await ticks(1);
    expect(chips(c).find((x) => x.getAttribute('data-current') === 'true')?.getAttribute('data-flow-chip')).not.toBe('受付');
    expect(logLines(c).some((l) => l.includes('【受付】'))).toBe(true);
    // 返答 (SUCCEEDING) は話しかけた直後に届くので、段を見せ終えたら完了を見せて、そのあと畳む。
    await ticks(20);
    expect(c.querySelector('[data-village-flow]'), '見せ終えた流れが畳まれていない').toBeNull();
    expect(logLines(c).some((l) => l.includes('【完了】'))).toBe(true);
  });

  it('★ AI の返答が来ない間は作業中で待ち、完了と言わない', async () => {
    const c = await mount(PENDING);
    await speak(c, '消費税の申告について教えて');
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    await ticks(10);
    const cur = chips(c).find((x) => x.getAttribute('data-current') === 'true');
    expect(cur?.getAttribute('data-flow-chip'), '返答が来ないのに作業中以外へ進んだ').toBe('作業中');
    expect(logLines(c).some((l) => l.includes('【完了】')), '返答が来ないのに完了と言った').toBe(false);
  });

  it('★ AI の呼び出しが失敗したら失敗として出る (完了と偽らない)', async () => {
    const c = await mount(FAILING);
    await speak(c, '消費税の申告について教えて');
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    await ticks(20);
    expect(logLines(c).some((l) => l.includes('【失敗】')), '失敗が札に出ない').toBe(true);
    expect(logLines(c).some((l) => l.includes('【完了】')), '失敗したのに完了と言った').toBe(false);
  });

  it('★ コンシェルジュの作業の知らせ: 実行中は作業中で待ち、完了の知らせで完了になる', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    await act(async () => {
      publishConversationWork({ stage: 'running', serviceId: 'github', action: 'create-issue', runId: 'r1' });
    });
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    await ticks(8);
    const cur = chips(c).find((x) => x.getAttribute('data-current') === 'true');
    expect(cur?.getAttribute('data-flow-chip'), '結果が来ないのに作業中以外へ進んだ').toBe('作業中');
    expect(logLines(c).some((l) => l.includes('実行しています'))).toBe(true);
    await act(async () => {
      publishConversationWork({ stage: 'done', serviceId: 'github', action: 'create-issue', runId: 'r1' });
    });
    await ticks(1);
    expect(chips(c).some((x) => x.getAttribute('data-flow-chip') === '完了'), '完了の知らせで札が完了にならない').toBe(true);
    expect(logLines(c).some((l) => l.includes('【完了】'))).toBe(true);
  });

  it('★ 失敗の知らせは失敗として出る (完了と偽らない)', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    await act(async () => {
      publishConversationWork({ stage: 'running', serviceId: 'slack', action: 'post-message', runId: 'r1' });
    });
    await ticks(6);
    await act(async () => {
      publishConversationWork({ stage: 'failed', serviceId: 'slack', action: 'post-message', runId: 'r1' });
    });
    await ticks(1);
    const log = logLines(c);
    expect(log.some((l) => l.includes('【失敗】'))).toBe(true);
    expect(log.some((l) => l.includes('【完了】'))).toBe(false);
  });

  it('★ 結果が来ないまま上限を過ぎたら畳む (終わったと偽らない)', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    await act(async () => {
      publishConversationWork({ stage: 'running', serviceId: 'github', action: 'create-issue', runId: 'r1' });
    });
    await ticks(75);
    expect(c.querySelector('[data-village-flow]')).toBeNull();
    expect(logLines(c).some((l) => l.includes('【完了】'))).toBe(false);
  });

  it('★ 別の実行の結果は今の流れに付かない (印が合う結果だけ)', async () => {
    const c = await mount();
    await waitForElement(() => c.querySelector('[data-village-scenes]'), '会話の記録の枠');
    await act(async () => {
      publishConversationWork({ stage: 'running', serviceId: 'github', action: 'create-issue', runId: 'A' });
    });
    await ticks(2);
    await act(async () => {
      publishConversationWork({ stage: 'running', serviceId: 'slack', action: 'post-message', runId: 'B' });
    });
    await ticks(8);
    // 先に始めた A の結果が、あとから始めた B の流れを完了にしてはいけない。
    await act(async () => {
      publishConversationWork({ stage: 'done', serviceId: 'github', action: 'create-issue', runId: 'A' });
    });
    await ticks(1);
    expect(chips(c).some((x) => x.getAttribute('data-flow-chip') === '完了'), 'A の結果が B の流れを完了にした').toBe(false);
    expect(logLines(c).some((l) => l.includes('【完了】'))).toBe(false);
    await act(async () => {
      publishConversationWork({ stage: 'done', serviceId: 'slack', action: 'post-message', runId: 'B' });
    });
    await ticks(1);
    expect(chips(c).some((x) => x.getAttribute('data-flow-chip') === '完了'), 'B 自身の結果で完了にならない').toBe(true);
  });

  it('★ 話しかけた流れに、実行の結果は付かない', async () => {
    const c = await mount(PENDING);
    await speak(c, '消費税の申告について教えて');
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    await act(async () => {
      publishConversationWork({ stage: 'failed', serviceId: 'github', action: 'create-issue', runId: 'stray' });
    });
    await ticks(20);
    expect(logLines(c).some((l) => l.includes('【失敗】')), '実行の結果が話しかけた流れに付いた').toBe(false);
  });

  it('★ 記録は下端に居るときだけ新しい行を追い、過去の行を読んでいる間は引き戻さない', async () => {
    const c = await mount();
    const list = await waitForElement(() => c.querySelector<HTMLElement>('[role="log"]'), '会話の記録');
    // jsdom にはレイアウトが無いので、高さを持たせて「スクロールできる箱」にする。
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 100 });
    // 上へ戻って過去の行を読んでいる
    list.scrollTop = 0;
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    const before = logLines(c).length;
    await ticks(6);
    expect(logLines(c).length, '新しい行が増えていない (検査の前提)').toBeGreaterThan(before);
    expect(list.scrollTop, '過去の行を読んでいる最中に下端へ引き戻された').toBe(0);
    // 下端のそばへ戻れば、また追う
    list.scrollTop = 900;
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    const mid = logLines(c).length;
    await ticks(6);
    expect(logLines(c).length).toBeGreaterThan(mid);
    expect(list.scrollTop, '下端に居るのに新しい行を追わない').toBe(1000);
  });

  it('★ 危機・心の不調の文は、景色の吹き出しと記録へ複製しない', async () => {
    const c = await mount();
    await speak(c, '死にたい気持ちがあります');
    await waitForElement(() => c.querySelector('[data-village-flow]'), '流れの札');
    await ticks(12);
    const log = logLines(c).join('\n');
    expect(log, '危機の文が記録に残った').not.toContain('死にたい');
    expect(log).toContain('ご相談');
    expect(c.querySelector('[data-village-flow]')?.textContent ?? '', '危機の文が札に出た').not.toContain('死にたい');
  });
});
