/** @vitest-environment jsdom */
/**
 * **外へ書く欄は、貼り付けた全文を残して断る** (2026-09-12 · パス 183)。
 *
 * `writeBodyCeilingCensus.test.ts` は原文の走査なので「`maxLength` が無い・
 * `CeilingNotice` が在る」までしか言えない。**画面で本当に断って本当に止まるか**は
 * 描いて押してみるしかない (パス 175 の「直した側と画面の間が切れている」)。
 *
 * ここで駆動するのは、パス 172 が母集団の外に置いていた欄のうち**害がいちばん
 * 具体的な 2 つ** ——
 *
 * | 欄 | 天井 | 切られると |
 * | --- | ---: | --- |
 * | Gmail の宛先 (`line(` ) | 4,096 | 貼った宛先の後ろが落ち、**宛先が減った下書き**を「作成しました」と言う |
 * | Cloudflare の DNS `content` (`line(` ) | 4,096 | 長い TXT (DKIM / SPF) が途中で切れ、**壊れたレコード**を公開する |
 *
 * 残りの 29 欄は同じ `CeilingNotice` を同じ形で通しているので、走査の側
 * (census) が数え、ここでは**仕組みが生きていること**を 2 つの実物で見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GmailPage } from '../pages/GmailPage';
import { CloudflarePage } from '../pages/CloudflarePage';
import { SNAPSHOT } from '../data/snapshot';
import { settleUntil, waitForElement } from './jsdomWait';
import { CLOUDFLARE_DNS_FIELDS, GMAIL_DRAFT_FIELDS } from '../../shared/writeFieldLimits';

let invoked: { serviceId: string; action: string; payload: Record<string, unknown> }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

/** 取得に返す中身 (画面が書き込みフォームを開ける前提を満たす分だけ)。 */
const FETCHED: Readonly<Record<string, unknown>> = {
  gmail: SNAPSHOT.gmail,
  cloudflare: {
    ...SNAPSHOT.cloudflare,
    // ゾーンが 1 つも無いと「DNS レコード追加」のボタンが押せない。
    zones: [{
      id: 'zone-1',
      name: 'example.com',
      status: 'active',
      plan: 'Free',
      accountName: 'Acme',
      nameServers: ['ns1.example.net', 'ns2.example.net'],
      devModeRemainingSec: 0,
    }],
  },
};

beforeEach(() => {
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['gmail', 'cloudflare']),
    fetchSnapshot: (id: string) =>
      Promise.resolve(
        id in FETCHED ? { ok: true, data: FETCHED[id] } : { ok: false, code: 'x', message: 'x' },
      ),
    invoke: (serviceId: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: true, data: { id: 'x', url: 'https://example.com/x' } });
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

/** 画面を描く。 */
async function mount(page: () => React.ReactElement | null): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(page));
  });
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

/** ネイティブの setter で打ち込む (React の onChange を通す)。 */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** placeholder で欄を引く。 */
function field(placeholder: string): HTMLInputElement {
  const el = [...container.querySelectorAll('input')].find((i) => i.placeholder === placeholder);
  if (!el) throw new Error(`欄が無い: ${placeholder}`);
  return el;
}

/** 断りの文 (欄の名前つき)。 */
function notice(label: string): string {
  return container.querySelector(`[data-ceiling-notice="${label}"]`)?.textContent ?? '';
}

describe('Gmail の宛先 — 貼った全文を残して断る (パス 183)', () => {
  const MAX = GMAIL_DRAFT_FIELDS.to.max;

  /** フォームを開き、宛先・件名・本文の欄を返す。 */
  async function openForm(): Promise<{ to: HTMLInputElement; subject: HTMLInputElement }> {
    await mount(GmailPage);
    await settleUntil(() => button('下書きを作成') !== undefined, '下書きボタンが出る');
    await act(async () => {
      button('下書きを作成')?.click();
    });
    await waitForElement(() => container.querySelector('textarea'), '本文の欄が出る');
    return { to: field('宛先 (To)'), subject: field('件名') };
  }

  it('★ `maxLength` に任せていない (ブラウザが黙って切る形が無い)', async () => {
    const { to, subject } = await openForm();
    expect(to.getAttribute('maxLength'), '宛先が maxLength を持っている').toBeNull();
    expect(subject.getAttribute('maxLength'), '件名が maxLength を持っている').toBeNull();
  });

  it('★ 天井を 1 字超えると、全文が欄に残り、超過量を述べ、押せなくなる', async () => {
    const { to, subject } = await openForm();
    await type(to, 'a'.repeat(MAX + 1));
    await type(subject, '件名');
    // **切っていない** —— 貼った物がそのまま欄に在る。
    expect(to.value.length, '欄が切られている (貼った物が消えた)').toBe(MAX + 1);
    expect(notice('宛先'), '断りが出ていない').toContain('1');
    expect(notice('宛先')).toContain(String(MAX));
    const send = button('下書きを保存');
    expect(send?.disabled, '超えているのに押せる').toBe(true);
    await act(async () => {
      send?.click();
    });
    expect(invoked, '超えているのに送っている').toEqual([]);
  });

  it('★ 天井ちょうどは送れる (境界を締めすぎていない・全文が届く)', async () => {
    const { to, subject } = await openForm();
    const exact = 'b'.repeat(MAX);
    await type(to, exact);
    await type(subject, '件名');
    expect(notice('宛先'), '天井ちょうどで断っている').toBe('');
    const send = button('下書きを保存');
    expect(send?.disabled, '天井ちょうどで押せない').toBe(false);
    await act(async () => {
      send?.click();
    });
    await settleUntil(() => invoked.length > 0, 'invoke が呼ばれる');
    expect(invoked[0]?.payload.to, '送った宛先が切られている').toBe(exact);
  });

  it('★ 対照: 天井の内側なら断りは出ない (常に出る検査になっていない)', async () => {
    const { to } = await openForm();
    await type(to, 'a@example.com');
    expect(notice('宛先')).toBe('');
    expect(container.querySelector('[data-ceiling-notice]'), '内側なのに断りが出た').toBeNull();
  });
});

describe('Cloudflare の DNS content — 壊れたレコードを公開しない (パス 183)', () => {
  const MAX = CLOUDFLARE_DNS_FIELDS.content.max;

  /**
   * 「DNS レコード作成」の節の action ボタンを開く。
   *
   * 画面には「作成」という字のボタンが 2 つ在る (節を開く方と、送る方) ので
   * **節から引く** —— 文字だけで引くと、開く前と後で別の物を掴む。
   */
  async function openForm(): Promise<HTMLInputElement> {
    await mount(CloudflarePage);
    const opener = (): HTMLButtonElement | undefined => {
      const heads = [...container.querySelectorAll('*')].filter(
        (el) => el.children.length === 0 && el.textContent?.trim() === 'DNS レコード作成',
      );
      const section = heads[0]?.closest('section') ?? heads[0]?.parentElement?.parentElement ?? null;
      return [...(section?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === '作成' || b.textContent?.trim() === '閉じる',
      );
    };
    await settleUntil(() => opener()?.disabled === false, 'DNS の節のボタンが押せる');
    await act(async () => {
      opener()?.click();
    });
    await settleUntil(
      () => [...container.querySelectorAll('input')].some((i) => i.placeholder === 'name (例: @ / www / api)'),
      'DNS フォームが開く',
    );
    return field('name (例: @ / www / api)');
  }

  /** ゾーンを選ぶ (選ばないと送りボタンは天井とは別の理由で押せない)。 */
  async function pickZone(): Promise<void> {
    const zone = container.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(zone, 'zone-1');
      zone?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('★ 長い TXT 値は切られず、断って止まる', async () => {
    const name = await openForm();
    /*
     * **ゾーンを選ぶ** —— 選ばないと `!dnsZone` で押せないので、
     * 「押せない」が天井のせいだと言えなくなる (対照 C3 でこれに気付いた:
     * disabled から超過を外しても検査が鳴らなかった)。
     */
    await pickZone();
    await type(name, '@');
    // TXT を選ぶと placeholder が「TXT 値」になる。
    const select = container.querySelectorAll('select')[1];
    if (select) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      await act(async () => {
        setter?.call(select, 'TXT');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    const content = field('TXT 値');
    expect(content.getAttribute('maxLength'), 'content が maxLength を持っている').toBeNull();
    const long = 'v=DKIM1; p=' + 'A'.repeat(MAX);
    await type(content, long);
    expect(content.value.length, '欄が切られている (壊れたレコードを作る形)').toBe(long.length);
    expect(long.length).toBeGreaterThan(MAX);
    expect(notice('content'), '断りが出ていない').toContain(String(MAX));
    expect(button('作成')?.disabled, '超えているのに押せる').toBe(true);
    await act(async () => {
      button('作成')?.click();
    });
    expect(invoked.filter((c) => c.action === 'create-dns-record'), '超えているのに送っている').toEqual([]);
  });

  it('★ 対照: 天井の内側なら押せる (断りが常に出る検査になっていない)', async () => {
    const name = await openForm();
    await pickZone();
    await type(name, 'www');
    await type(field('IPv4 アドレス'), '203.0.113.10');
    expect(container.querySelector('[data-ceiling-notice]'), '内側なのに断りが出た').toBeNull();
    expect(button('作成')?.disabled, '内側なのに押せない').toBe(false);
  });
});
