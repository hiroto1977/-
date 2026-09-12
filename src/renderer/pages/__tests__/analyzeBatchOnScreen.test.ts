/** @vitest-environment jsdom */
/**
 * **一覧から感情分析へ送る 2 画面を押す** (2026-09-12 · パス 156)。
 *
 * `GmailPage` (36.36%) と `SlackPage` (37.93%) の「Emotions で分析」は
 * どちらも 1 度も走ったことがなかった。両方とも一覧を全件 join して送るので
 * **本文の長さを利用者が決められない** —— 5000 字を超えると `analyze-text` は
 * 断るが、出るのは英語の生の例外文だけで打てる手が無い。
 *
 * 先頭から入るぶんだけ送り、外した件数を**押す前に**画面が言うこと、
 * 送っている本文が実際に上限以内であることを、実物の DOM で見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { MAX_ANALYZE_TEXT_CHARS } from '../../../shared/emotionsLimits';
import { SLACK_MESSAGE_FIELDS } from '../../../shared/writeFieldLimits';

interface Call {
  readonly action: string;
  readonly payload: Record<string, unknown>;
}

let invoked: Call[];
let snapshot: Record<string, unknown>;

function stubHub(serviceId: string): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([serviceId]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshot }),
    invoke: (_id: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      return Promise.resolve({ ok: true, data: { id: 'a1', sentiment: 'neutral' } });
    },
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    authorize: () => Promise.resolve({ ok: true, data: {} }),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;
let alerts: string[];

async function mount(serviceId: 'gmail' | 'slack'): Promise<void> {
  stubHub(serviceId);
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing from the sidebar`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function analyzeButton(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').includes('Emotions で分析'),
  );
  if (!b) throw new Error('「Emotions で分析」のボタンが見つからない');
  return b as HTMLButtonElement;
}

function note(): string | null {
  const el = container.querySelector('[data-analyze-batch-note]');
  return el === null ? null : (el.textContent ?? '');
}

function button(text: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === text);
  if (!b) throw new Error(`button "${text}" not found`);
  return b as HTMLButtonElement;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function type(selector: string, value: string): Promise<void> {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`field ${selector} not found`);
  await act(async () => {
    setValue(el, value);
  });
  await settle();
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** 件名が長いスレッドを n 件。1 件あたり約 120 字。 */
function gmailThreads(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    subject: `件名 ${i} ${'あ'.repeat(90)}`,
    sender: `sender${i}@example.com`,
    snippet: 's',
    date: '2026-09-01',
    unread: false,
  }));
}

/** purpose が長いチャンネルを n 件。 */
function slackChannels(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `C${i}`,
    name: `ch-${i}`,
    purpose: 'この部屋の目的 '.repeat(10),
    isArchived: false,
    permalink: 'https://example.slack.com/archives/C0',
  }));
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  invoked = [];
  alerts = [];
  (globalThis as unknown as { alert: (m?: string) => void }).alert = (m) => {
    alerts.push(m ?? '');
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

describe('Gmail の受信トーン分析 (カバレッジ 36.36% だった側 · パス 156)', () => {
  it('★ 全部収まるときは注記を出さず、全件を送る', async () => {
    snapshot = { threads: gmailThreads(3), profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    expect(note()).toBeNull();
    await click(analyzeButton());
    expect(invoked).toHaveLength(1);
    expect(invoked[0]!.action).toBe('analyze-text');
    expect(invoked[0]!.payload['source']).toBe('Gmail Inbox');
    expect(String(invoked[0]!.payload['text']).split('\n')).toHaveLength(3);
    expect(alerts[0]).toContain('3 件を送信');
  });

  it('★ 収まらない件数は、押す前に注記で言う', async () => {
    snapshot = { threads: gmailThreads(200), profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    const n = note();
    expect(n).not.toBeNull();
    expect(n).toContain('200 件のうち、先頭');
    expect(n).toContain(`${MAX_ANALYZE_TEXT_CHARS} 字までのため`);
    expect(n).toContain('件は含みません');
  });

  it('★ 送る本文は必ず上限以内 (断られる本文を投げない)', async () => {
    snapshot = { threads: gmailThreads(200), profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    await click(analyzeButton());
    const text = String(invoked[0]!.payload['text']);
    expect(text.length).toBeLessThanOrEqual(MAX_ANALYZE_TEXT_CHARS);
    // 先頭から連続した一部であること (1 行目が入っている)。
    expect(text.startsWith('- 件名 0 ')).toBe(true);
    // 送った件数を成功の文が言う。
    expect(alerts[0]).toMatch(/\d+ 件を送信/);
  });

  it('スレッドが 0 件なら押せない', async () => {
    snapshot = { threads: [], profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    expect(analyzeButton().disabled).toBe(true);
    await click(analyzeButton());
    expect(invoked).toEqual([]);
  });

  it('★ 対照: 1 件目だけで上限を超えるときは押せず、理由を言う', async () => {
    snapshot = {
      threads: [{ id: 't0', subject: 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS + 10), sender: 'x@example.com', snippet: 's', date: '2026-09-01', unread: false }],
      profile: { emailAddress: 'me@example.com' },
    };
    await mount('gmail');
    expect(note()).toContain('分析に送れる行がありません');
    expect(analyzeButton().disabled).toBe(true);
    await click(analyzeButton());
    expect(invoked).toEqual([]);
  });
});

describe('Slack のチャンネル雰囲気分析 (カバレッジ 37.93% だった側 · パス 156)', () => {
  it('★ 全部収まるときは注記を出さず、全件を送る', async () => {
    snapshot = { channels: slackChannels(2) };
    await mount('slack');
    expect(note()).toBeNull();
    await click(analyzeButton());
    expect(invoked).toHaveLength(1);
    expect(invoked[0]!.payload['source']).toBe('Slack channels');
    expect(String(invoked[0]!.payload['text']).split('\n')).toHaveLength(2);
    expect(alerts[0]).toContain('2 件を送信');
  });

  it('★ 収まらない件数は押す前に言い、送る本文は上限以内', async () => {
    snapshot = { channels: slackChannels(120) };
    await mount('slack');
    const n = note();
    expect(n).toContain('120 件のうち、先頭');
    await click(analyzeButton());
    const text = String(invoked[0]!.payload['text']);
    expect(text.length).toBeLessThanOrEqual(MAX_ANALYZE_TEXT_CHARS);
    expect(text.startsWith('#ch-0: ')).toBe(true);
  });

  it('purpose が空のチャンネルは (no purpose) として送る (行が消えない)', async () => {
    snapshot = { channels: [{ id: 'C0', name: 'general', purpose: '', isArchived: false, permalink: 'https://x' }] };
    await mount('slack');
    await click(analyzeButton());
    expect(invoked[0]!.payload['text']).toBe('#general: (no purpose)');
  });

  it('チャンネルが 0 件なら押せない', async () => {
    snapshot = { channels: [] };
    await mount('slack');
    expect(analyzeButton().disabled).toBe(true);
  });
});

/**
 * 書き込みフォームも押す (パス 156 の続き)。カバレッジの残りはここで、
 * どちらも 1 度も走ったことがなかった。
 */
describe('Gmail の下書き作成 / Slack のメッセージ送信 (書き込み側)', () => {
  it('Gmail: trim して送り、成功で件名と本文だけ空にする (宛先は残す)', async () => {
    snapshot = { threads: gmailThreads(1), profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    await click(button('下書きを作成'));
    await type('[placeholder="宛先 (To)"]', '  a@example.com  ');
    await type('[placeholder="件名"]', '  ご連絡  ');
    await type('[placeholder="本文 (text/plain UTF-8)"]', '本文です');
    await click(button('下書きを保存'));
    const call = invoked.find((c) => c.action === 'create-draft');
    expect(call?.payload).toEqual({ to: 'a@example.com', subject: 'ご連絡', body: '本文です' });
    // 宛先は続けて書けるように残る。件名と本文は空に。
    expect((container.querySelector('[placeholder="宛先 (To)"]') as HTMLInputElement).value).toBe('  a@example.com  ');
    expect((container.querySelector('[placeholder="件名"]') as HTMLInputElement).value).toBe('');
  });

  it('Gmail: 宛先か件名が空なら押せない', async () => {
    snapshot = { threads: gmailThreads(1), profile: { emailAddress: 'me@example.com' } };
    await mount('gmail');
    await click(button('下書きを作成'));
    expect(button('下書きを保存').disabled).toBe(true);
    await type('[placeholder="宛先 (To)"]', 'a@example.com');
    expect(button('下書きを保存').disabled).toBe(true);
    await type('[placeholder="件名"]', 'x');
    expect(button('下書きを保存').disabled).toBe(false);
  });

  it('Slack: trim したチャンネルと本文を送り、成功で本文だけ空にする', async () => {
    snapshot = { channels: slackChannels(1) };
    await mount('slack');
    await click(button('メッセージ送信'));
    await type('[placeholder="チャンネル ID (C…) または #channel-name"]', '  #general  ');
    await type('[placeholder="メッセージ本文（Slack mrkdwn 可）"]', 'こんにちは');
    await click(button('送信'));
    const call = invoked.find((c) => c.action === 'send-message');
    // チャンネルは trim、本文はそのまま (mrkdwn の前後空白を落とさない)。
    expect(call?.payload).toEqual({ channel: '#general', text: 'こんにちは' });
    expect((container.querySelector('[placeholder="メッセージ本文（Slack mrkdwn 可）"]') as HTMLTextAreaElement).value).toBe('');
  });

  it('★ 外へ書く欄には共有台帳の上限が付いている (数を写していない)', async () => {
    snapshot = { channels: slackChannels(1) };
    await mount('slack');
    await click(button('メッセージ送信'));
    const ch = container.querySelector('[placeholder="チャンネル ID (C…) または #channel-name"]') as HTMLInputElement;
    const body = container.querySelector('[placeholder="メッセージ本文（Slack mrkdwn 可）"]') as HTMLTextAreaElement;
    /*
     * **どの欄にも `maxLength` は付けない** (2026-09-12 · パス 172 は本文だけ、
     * パス 183 で全欄へ)。ブラウザは `maxLength` を超えた貼り付けを黙って切るので、
     * 25,000 字を貼ると 20,000 字だけが Slack へ行き、画面は「送信しました」と言う。
     * 切らずに断る (`CeilingNotice`) —— 断りの側は
     * `pages/__tests__/writeBodyCeilings.test.ts` が駆動し、欄ごとの対応は
     * `renderer/__tests__/writeBodyCeilingCensus.test.ts` が台帳から数える。
     * `maxLength` が無い欄の `maxLength` プロパティは **-1**。
     */
    expect(ch.getAttribute('maxlength'), 'チャンネルに maxLength が残っている').toBeNull();
    expect(ch.maxLength).toBe(-1);
    expect(body.getAttribute('maxlength'), '本文に maxLength が戻っている').toBeNull();
    expect(body.maxLength).toBe(-1);
    // 走査が空振りしていない標本: 上限は実際に正の数である (断り側がこれを読む)。
    expect(SLACK_MESSAGE_FIELDS.channel!.max).toBeGreaterThan(0);
    expect(SLACK_MESSAGE_FIELDS.text!.max).toBeGreaterThan(0);
  });

  it('フォームは開閉できる (閉じると欄が消える)', async () => {
    snapshot = { channels: slackChannels(1) };
    await mount('slack');
    await click(button('メッセージ送信'));
    expect(container.querySelector('[placeholder="メッセージ本文（Slack mrkdwn 可）"]')).not.toBeNull();
    await click(button('閉じる'));
    expect(container.querySelector('[placeholder="メッセージ本文（Slack mrkdwn 可）"]')).toBeNull();
  });
});
