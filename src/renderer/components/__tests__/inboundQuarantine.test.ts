/** @vitest-environment jsdom */
/**
 * **受信の検疫が、実際に画面へ出るか** (2026-11-16)。
 *
 * 判定そのものは `shared/__tests__/inboundThreat.test.ts` が留める。ここが受け持つのは、貼った文面の判定・兆候・
 * 押せない形の文面が DOM に出ること、そして**画面のどこにも押せるリンクを作らない**ことである
 * (法則 `user-facing-claim-held-at-render`)。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InboundQuarantine } from '../InboundQuarantine';
import { INBOUND_RULES, hasLiveLink } from '../../../shared/inboundThreat';
import { settleUntil } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(InboundQuarantine));
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

/** 実際の入力として流す (素の代入では React に届かない)。 */
async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => el.value === value, '欄に値が入る');
}

const body = (): HTMLTextAreaElement => container.querySelector<HTMLTextAreaElement>('textarea[aria-label="調べる文面"]')!;
const sender = (): HTMLInputElement => container.querySelector<HTMLInputElement>('input[aria-label="差出人 (任意)"]')!;
const result = (): HTMLElement | null => container.querySelector<HTMLElement>('[data-inbound-level]');
const findings = (): string[] => Array.from(container.querySelectorAll('[data-inbound-finding]')).map((li) => li.getAttribute('data-inbound-finding')!);

describe('受信の検疫の画面', () => {
  it('何も貼っていない間は、判定を出さない (空の文面に「兆候なし」と言わない)', () => {
    expect(body()).not.toBeNull();
    expect(sender()).not.toBeNull();
    expect(result()).toBeNull();
    expect(container.textContent).toContain('リンクへは接続せず、外部にも AI にも送りません');
  });

  it('★ 危ない文面を貼ると、危険の判定・兆候の文・押せない形の文面が出る。画面に押せるリンクは作らない', async () => {
    await typeInto(body(), 'お支払い情報の更新: https://paypal.com@evil.example/update.exe');
    expect(result()!.getAttribute('data-inbound-level')).toBe('danger');
    expect(result()!.textContent).toContain('このまま開かないでください —— 危険の兆候が 2 種類あります。');
    expect(findings()).toEqual(['disguised-host', 'dangerous-file']);
    expect(result()!.textContent).toContain(INBOUND_RULES['disguised-host'].text);
    const pre = container.querySelector('[data-inbound-defanged]')!;
    expect(pre.textContent).toBe('お支払い情報の更新: hxxps[:]//paypal[.]com[@]evil[.]example/update.exe');
    expect(hasLiveLink(pre.textContent!)).toBe(false);
    // 判定の枠の中に、押せる綴りも <a> も無い (貼った欄そのものは利用者の入力なので除く)
    expect(hasLiveLink(result()!.textContent!)).toBe(false);
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('★ 兆候の無い文面は「安全」と言わない —— 保証ではないことを言い、緑にしない', async () => {
    await typeInto(body(), '明日の打ち合わせは 15 時からです。');
    expect(result()!.getAttribute('data-inbound-level')).toBe('ok');
    expect(result()!.textContent).toContain('ただし「安全」の保証ではありません');
    expect(findings()).toEqual([]);
    const verdict = result()!.firstElementChild as HTMLElement;
    expect(verdict.style.color).toBe('var(--text-muted)');
  });

  it('差出人だけでも調べる。同じ兆候が複数あれば回数を言う', async () => {
    await typeInto(sender(), 'bank.example <x@evil.example>');
    expect(result()!.getAttribute('data-inbound-level')).toBe('danger');
    expect(findings()).toEqual(['sender-spoof']);
    // 文面が空の間は、書き換えた文面の枠を出さない
    expect(container.querySelector('[data-inbound-defanged]')).toBeNull();
    await typeInto(body(), 'http://a.example/ と http://b.example/');
    expect(findings()).toEqual(['sender-spoof', 'plain-http']);
    expect(container.querySelector('[data-inbound-finding="plain-http"]')!.textContent).toContain('（2 か所）');
    expect(container.querySelector('[data-inbound-finding="sender-spoof"]')!.textContent).not.toContain('か所');
  });
});
