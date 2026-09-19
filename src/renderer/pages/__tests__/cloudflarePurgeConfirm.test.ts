/** @vitest-environment jsdom */
/**
 * **Cloudflare の書き込み操作を押す** (2026-09-12 · パス 154)。
 *
 * この画面は 2026-09-12 の全域計測で **38.98%** —— `createDns` と `runPurge` は
 * どちらも 1 度も走ったことがなかった。押して分かった欠陥:
 *
 * **「ゾーン全体（破壊的）」のパージに確認が無かった。** 画面自身が選択肢のラベルで
 * 破壊的だと名乗っているのに、1 回押すだけで `purgeEverything: true` が飛ぶ。
 * このリポジトリはライブラリの 1 ファイル削除にも `window.confirm` を付けている
 * (経緯と一覧は `data/cachePurge.ts`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

interface Call {
  readonly action: string;
  readonly payload: Record<string, unknown>;
}

const ZONE = { id: 'zone-abc123', name: 'example.com' };

let invoked: Call[];
let invokeResult: { ok: boolean; data?: Record<string, unknown>; code?: string; message?: string };
/** `window.confirm` の答え。検査ごとに差し替える。 */
let confirmAnswer: boolean;
let confirmed: string[];

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve(['cloudflare']),
    fetchSnapshot: () =>
      Promise.resolve({
        ok: true,
        data: {
          user: { email: 'ops@example.com', id: 'u1' },
          zones: [{
            id: ZONE.id,
            name: ZONE.name,
            status: 'active',
            plan: 'Free',
            accountName: 'Acme',
            nameServers: ['ns1.example.net', 'ns2.example.net'],
            devModeRemainingSec: 0,
          }],
        },
      }),
    invoke: (_id: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      return Promise.resolve(invokeResult);
    },
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
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

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'cloudflare');
  if (!def) throw new Error('cloudflare service missing from the sidebar');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function buttons(text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement[];
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function type(selector: string, value: string): Promise<void> {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`field ${selector} not found`);
  await act(async () => {
    setValue(el, value);
  });
  await settle();
}

/** パージ欄を開いてゾーンを選ぶ。 */
async function openPurge(): Promise<void> {
  await click(buttons('パージ')[0]!);
  const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
  const zoneSelect = selects[selects.length - 1]!;
  await act(async () => {
    setValue(zoneSelect, ZONE.id);
  });
  await settle();
}

/** 「ゾーン全体（破壊的）」のラジオを選ぶ。 */
async function chooseWholeZone(): Promise<void> {
  const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
  const whole = radios.find((r) => (r.parentElement?.textContent ?? '').includes('ゾーン全体'));
  if (!whole) throw new Error('「ゾーン全体」のラジオが見つからない');
  await click(whole);
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  invoked = [];
  invokeResult = { ok: true, data: { purged: 'all' } };
  confirmAnswer = true;
  confirmed = [];
  (globalThis as unknown as { confirm: (m?: string) => boolean }).confirm = (m) => {
    confirmed.push(m ?? '');
    return confirmAnswer;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
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

describe('Cloudflare の書き込み操作 (カバレッジ 38.98% だった側 · パス 154)', () => {
  it('★ 走査が実物に当たる: ゾーンが 1 つ在り、2 つのフォームが開ける', async () => {
    await mount();
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('DNS レコード作成');
    expect(container.textContent).toContain('キャッシュパージ');
    // ゾーンが在るので押せる (0 件なら disabled)。
    expect(buttons('パージ')[0]!.disabled).toBe(false);
  });

  it('★ ゾーン全体のパージは、確認するまで送らない', async () => {
    confirmAnswer = false;
    await mount();
    await openPurge();
    await chooseWholeZone();
    await click(buttons('パージ実行')[0]!);
    // 確認は出たが、断ったので **1 件も送っていない**。
    expect(confirmed).toHaveLength(1);
    expect(invoked).toEqual([]);
  });

  it('★ 確認文は「どのゾーンか」を名前で言い、取り消せないことと配信元への影響を言う', async () => {
    confirmAnswer = false;
    await mount();
    await openPurge();
    await chooseWholeZone();
    await click(buttons('パージ実行')[0]!);
    const message = confirmed[0] ?? '';
    expect(message).toContain('example.com のキャッシュを全て削除します。');
    expect(message).toContain('元に戻せません');
    expect(message).toContain('配信元');
    // **id は出さない** —— 読む人が何を消すか判らない (パス 101 の教訓)。
    expect(message).not.toContain(ZONE.id);
  });

  it('承諾すればゾーン全体を送り、結果を刷る', async () => {
    await mount();
    await openPurge();
    await chooseWholeZone();
    await click(buttons('パージ実行')[0]!);
    expect(invoked).toEqual([
      { action: 'purge-cache', payload: { zoneId: ZONE.id, purgeEverything: true } },
    ]);
    expect(container.textContent).toContain('ゾーン全体をパージしました');
  });

  it('★ 対照: URL 指定のパージは確認を求めない (破壊的と名乗っていない側)', async () => {
    invokeResult = { ok: true, data: { purged: 2 } };
    await mount();
    await openPurge();
    await type('textarea', 'https://example.com/a.css\n\n  https://example.com/b.js  \n');
    await click(buttons('パージ実行')[0]!);
    expect(confirmed).toEqual([]);
    expect(invoked).toEqual([
      {
        action: 'purge-cache',
        payload: { zoneId: ZONE.id, files: ['https://example.com/a.css', 'https://example.com/b.js'] },
      },
    ]);
    expect(container.textContent).toContain('2 URL をパージしました');
    // 使った一覧は成功後に空にする (欄そのものは URL モードのまま残る)。
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('★ ゾーン全体のパージは、打ってあった URL 一覧を消さない (読んでいないので)', async () => {
    await mount();
    await openPurge();
    await type('textarea', 'https://example.com/keep-me.css');
    await chooseWholeZone();
    await click(buttons('パージ実行')[0]!);
    expect(invoked[0]!.payload).toEqual({ zoneId: ZONE.id, purgeEverything: true });
    // URL モードに戻すと、打ってあった一覧がそのまま在る。
    const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const urlMode = radios.find((r) => (r.parentElement?.textContent ?? '').includes('URL を指定'));
    await click(urlMode!);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('https://example.com/keep-me.css');
  });

  it('パージの失敗は理由を刷る (成功の文は出さない)', async () => {
    invokeResult = { ok: false, code: 'action_failed', message: 'Zone not found' };
    await mount();
    await openPurge();
    await chooseWholeZone();
    await click(buttons('パージ実行')[0]!);
    expect(container.textContent).toContain('Zone not found');
    expect(container.textContent).not.toContain('ゾーン全体をパージしました');
  });

  it('DNS レコード作成は trim して送り、成功で name / content を空にする', async () => {
    invokeResult = { ok: true, data: { id: 'r1', type: 'A', name: 'www.example.com', content: '203.0.113.1', proxied: true } };
    await mount();
    await click(buttons('作成')[0]!);
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    await act(async () => {
      setValue(selects[0]!, ZONE.id);
    });
    await settle();
    await type('[placeholder="name (例: @ / www / api)"]', '  www  ');
    await type('[placeholder="IPv4 アドレス"]', '  203.0.113.1  ');
    // 送信ボタンは「作成」が 2 つある (節の開閉と primary)。primary を押す。
    const submit = (container.querySelector('button.primary') as HTMLButtonElement | null);
    expect(submit).not.toBeNull();
    await click(submit!);
    expect(invoked).toEqual([
      {
        action: 'create-dns-record',
        payload: { zoneId: ZONE.id, type: 'A', name: 'www', content: '203.0.113.1', proxied: false },
      },
    ]);
    expect(container.textContent).toContain('A www.example.com を作成');
  });

  it('★ TXT / MX はプロキシの選択肢を出さない (proxied は必ず false)', async () => {
    await mount();
    await click(buttons('作成')[0]!);
    // 既定の A ではオレンジ雲が出ている。
    expect(container.textContent).toContain('Cloudflare プロキシを通す');
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    await act(async () => {
      setValue(selects[1]!, 'TXT');
    });
    await settle();
    expect(container.textContent).not.toContain('Cloudflare プロキシを通す');
  });
});
