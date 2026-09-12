/** @vitest-environment jsdom */
/**
 * **外へ送る本文の欄は、貼り付けを黙って切らない** (2026-09-12 · パス 172)。
 *
 * ## 実測した欠陥
 *
 * 外部サービスへ**書く** 7 画面 (Slack / GitHub / Gmail / Notion / Atlassian /
 * WordPress / Microsoft 365) の本文の欄は、台帳 `writeFieldLimits.ts` の天井
 * (20,000 字) を **`maxLength` で**持っていた。`maxLength` は**貼り付けを黙って切る** ——
 *
 * | | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | 25,000 字を貼る | 欄には 20,000 字だけ入る (画面は何も言わない) | 全部入る |
 * | 押す | 送れる。外部サービスには**切れた本文**が残り、画面は「作成成功」 | 押せない (断りが出る) |
 *
 * **利用者が貼った物と、相手のサービスに残る物が違う。** しかも main と
 * ブラウザ版はどちらも `too-long` を断るように書いてあるのに、画面が先に切るので
 * **その断りには永久に届かない** (書いたのに効かない関門)。
 *
 * パス 168 が `EmotionsPage` (AI へ送る本文) で決めた判断をここへ当てる ——
 * **人が本文を貼る欄は、切らずに断る。**
 *
 * ## jsdom では「切れること」は測れない
 *
 * jsdom は `maxLength` を**属性として持つだけ**で、値の代入には当てない
 * (実測: `maxLength=10` の欄に 25 字を代入できた)。だからここで測るのは
 * **直した後の振る舞い** —— 超えたら断りが出て、押せず、`invoke` が呼ばれないこと。
 * ブラウザが実際に切る所は e2e (`writeCeiling` スイート) が持つ。
 *
 * ## 母集団は台帳から導く
 *
 * ここは 7 画面を**駆動する**検査で、母集団の網羅は
 * `__tests__/writeBodyCeilingCensus.test.ts` が `writeFieldLimits.ts` の
 * `text(` から導いて数える (手で並べた表は、手で並べた分しか見つけない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import type { ServiceId } from '../../../shared/serviceId';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import {
  ATLASSIAN_ISSUE_FIELDS,
  GITHUB_ISSUE_FIELDS,
  GMAIL_DRAFT_FIELDS,
  MS365_MAIL_FIELDS,
  NOTION_PAGE_FIELDS,
  SLACK_MESSAGE_FIELDS,
  WORDPRESS_POST_FIELDS,
} from '../../../shared/writeFieldLimits';
import { settleUntil } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Screen {
  /** サービス id (画面は `SERVICES` から引く —— 画面の import を写さない)。 */
  readonly id: ServiceId;
  /** 節を開くボタンの文字 (完全一致)。 */
  readonly toggle: string;
  /** 必須の欄 (placeholder の先頭 → 入れる値)。埋めないと押せる状態にならない。 */
  readonly required: readonly (readonly [string, string])[];
  /** 本文の欄の placeholder の先頭。 */
  readonly body: string;
  /** 本文の天井 (台帳から読む —— 数を写さない)。 */
  readonly max: number;
  /** 送るボタンの文字 (完全一致)。 */
  readonly submit: string;
  /** 呼ばれるはずの action 名。 */
  readonly action: string;
  /** payload のどの鍵に本文が乗るか。 */
  readonly field: string;
}

const SCREENS: readonly Screen[] = [
  {
    id: 'slack', toggle: 'メッセージ送信', required: [['チャンネル ID', 'C0123456789']],
    body: 'メッセージ本文', max: SLACK_MESSAGE_FIELDS.text!.max, submit: '送信',
    action: 'send-message', field: 'text',
  },
  {
    id: 'github', toggle: 'Issue を作成',
    required: [['owner', 'octocat'], ['repo', 'hello'], ['Issue title', 'バグ']],
    body: 'Body', max: GITHUB_ISSUE_FIELDS.body!.max, submit: '作成',
    action: 'create-issue', field: 'body',
  },
  {
    id: 'gmail', toggle: '下書きを作成',
    required: [['宛先 (To)', 'a@example.com'], ['件名', '見積のご依頼']],
    body: '本文', max: GMAIL_DRAFT_FIELDS.body.max, submit: '下書きを保存',
    action: 'create-draft', field: 'body',
  },
  {
    id: 'notion', toggle: 'ページを作成',
    required: [['親ページ ID', 'p-1'], ['ページタイトル', '議事録']],
    body: '本文', max: NOTION_PAGE_FIELDS.body.max, submit: '作成',
    action: 'create-page', field: 'body',
  },
  {
    id: 'atlassian', toggle: 'Issue を作成',
    required: [['プロジェクト Key', 'KAN'], ['Summary', '不具合']],
    body: 'Description', max: ATLASSIAN_ISSUE_FIELDS.description.max, submit: '作成',
    action: 'create-issue', field: 'description',
  },
  {
    id: 'wordpress', toggle: '投稿の下書きを作成',
    required: [['サイト ID', 'example.com'], ['投稿タイトル', 'お知らせ']],
    body: '本文', max: WORDPRESS_POST_FIELDS.content.max, submit: '下書き保存',
    action: 'create-post-draft', field: 'content',
  },
  {
    id: 'microsoft-365', toggle: '✉ メール送信',
    required: [['宛先 (to@example.com)', 'a@example.com'], ['件名', '請求書']],
    body: '本文', max: MS365_MAIL_FIELDS.body.max, submit: '送信',
    action: 'send-mail', field: 'body',
  },
];

let invoked: { action: string; payload: Record<string, unknown> }[];

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_id: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      return Promise.resolve({ ok: true, data: { url: 'https://example.com/x', id: 'x' } });
    },
    authorize: () => Promise.resolve({ ok: true, data: {} }),
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: ServiceId): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} が sidebar に無い`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
}

/** 完全一致でボタンを引く (「送信」と「✉ メール送信」を取り違えない)。 */
function button(label: string): HTMLButtonElement {
  const all = [...container.querySelectorAll('button')];
  const hit = all.filter((b) => (b.textContent ?? '').trim() === label);
  if (hit.length !== 1) {
    throw new Error(
      `ボタン「${label}」が ${hit.length} 個 — 在るのは: ${all.map((b) => (b.textContent ?? '').trim()).join(' / ')}`,
    );
  }
  return hit[0] as HTMLButtonElement;
}

async function click(label: string): Promise<void> {
  const b = button(label);
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function field(prefix: string): HTMLInputElement | HTMLTextAreaElement {
  const all = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')];
  const hit = all.filter((e) => (e.getAttribute('placeholder') ?? '').startsWith(prefix));
  if (hit.length !== 1) {
    throw new Error(
      `欄「${prefix}」が ${hit.length} 個 — 在るのは: ${all.map((e) => e.getAttribute('placeholder')).join(' / ')}`,
    );
  }
  return hit[0]!;
}

/** 実際の入力として流す (素の代入では React に届かない)。 */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const text = (): string => container.textContent ?? '';

beforeEach(async () => {
  invoked = [];
  // singleton を捨てるだけでは隔離にならない (パス 170) —— DB も消す。
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  stubHub();
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

describe('外へ送る本文の天井 — 超えたら断る (7 画面を駆動 · パス 172)', () => {
  it('★ 標本: 台帳の天井は 7 画面すべてで同じ 20,000 字 (走査が空振りしていない)', () => {
    expect(SCREENS).toHaveLength(7);
    for (const s of SCREENS) expect(s.max, `${s.id} の天井`).toBe(20_000);
  });

  for (const s of SCREENS) {
    it(`★ ${s.id}: 天井を 1 字超えたら断り、押せず、何も送らない`, async () => {
      await mount(s.id);
      await click(s.toggle);
      for (const [prefix, value] of s.required) await type(field(prefix), value);
      await type(field(s.body), 'あ'.repeat(s.max + 1));
      await settleUntil(() => text().includes('字超えています'), `${s.id} の断り`);
      // 文面は共有の 1 文 —— 今の字数と超過分の両方を述べる。
      expect(text()).toContain(`${s.max} 字までです`);
      expect(text()).toContain(`いま ${s.max + 1} 字あり、1 字超えています`);
      expect(container.querySelector('[data-ceiling-notice]'), '断りの節が無い').not.toBeNull();
      expect(button(s.submit).disabled, '超えているのに押せる').toBe(true);
      // 押しても何も送らない (disabled なので click は handler に届かない)。
      await click(s.submit);
      expect(invoked, '天井を超えた本文を送った').toEqual([]);
    });

    it(`★ ${s.id}: 天井ちょうどなら断らず、切らずに全文を送る`, async () => {
      await mount(s.id);
      await click(s.toggle);
      for (const [prefix, value] of s.required) await type(field(prefix), value);
      await type(field(s.body), 'い'.repeat(s.max));
      expect(text(), '天井ちょうどで断っている').not.toContain('字超えています');
      expect(container.querySelector('[data-ceiling-notice]'), '断らないはずが節が在る').toBeNull();
      expect(button(s.submit).disabled, '天井ちょうどで押せない').toBe(false);
      await click(s.submit);
      await settleUntil(() => invoked.length > 0, `${s.id} が送る`);
      expect(invoked[0]!.action).toBe(s.action);
      // **切らずに送る** —— ここが本題。
      expect(String(invoked[0]!.payload[s.field]).length, '本文が切られている').toBe(s.max);
    });
  }

  it('★ 断りは本文の欄にだけ出る (短い欄の maxLength は残してある)', async () => {
    // 識別子・題名の欄は `maxLength` のままにした (人が貼る本文ではない)。
    // 台帳との対応は census が見るので、ここでは「残っている」ことだけ確かめる。
    await mount('notion');
    await click('ページを作成');
    expect(field('親ページ ID').getAttribute('maxlength')).toBe(String(NOTION_PAGE_FIELDS.parentPageId.max));
    expect(field('ページタイトル').getAttribute('maxlength')).toBe(String(NOTION_PAGE_FIELDS.title.max));
    expect(field('本文').getAttribute('maxlength'), '本文に maxLength が残っている').toBeNull();
  });
});
