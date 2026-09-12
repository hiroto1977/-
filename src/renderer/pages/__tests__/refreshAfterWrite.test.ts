/** @vitest-environment jsdom */
/**
 * **作ったら一覧に出るまで見る** (2026-09-12 · パス 173)。
 *
 * `NotionPage` を駆動していて気付いた —— 「作成成功」と出るのに一覧は
 * **`ページ 0` のまま**で、作ったページが画面に出ない。利用者からは出来たのか
 * 分からず、押し直して 2 つ作る形になる (パス 124 / 126 の家系)。
 *
 * ここでは 2 つ目の取得 (`fetchSnapshot`) が**新しい中身**を返すようにして、
 * 押した後の画面にそれが出ることを見る。母集団の網羅と「取り直さない画面」の側は
 * `renderer/__tests__/refreshAfterWriteCensus.test.ts` が持つ。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import type { ServiceId } from '../../../shared/serviceId';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let fetches: number;
let invoked: string[];
/** 取得のたびに返す中身 (2 回目からは「作った物が入った」形にする)。 */
let snapshots: Record<string, unknown>[];

function stubHub(configured: ServiceId): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([configured]),
    fetchSnapshot: () => {
      const data = snapshots[Math.min(fetches, snapshots.length - 1)]!;
      fetches += 1;
      return Promise.resolve({ ok: true, data });
    },
    invoke: (_id: string, action: string) => {
      invoked.push(action);
      return Promise.resolve({ ok: true, data: { url: 'https://example.com/x', id: 'x', name: '新しいフォルダ', htmlLink: 'https://example.com/e' } });
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

function button(label: string): HTMLButtonElement {
  const hit = [...container.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === label);
  if (hit.length !== 1) {
    throw new Error(`ボタン「${label}」が ${hit.length} 個 — 在るのは: ${[...container.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).join(' / ')}`);
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
  if (hit.length !== 1) throw new Error(`欄「${prefix}」が ${hit.length} 個`);
  return hit[0]!;
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const text = (): string => container.textContent ?? '';

beforeEach(async () => {
  fetches = 0;
  invoked = [];
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

describe('書いたら一覧を取り直す (パス 173)', () => {
  it('★ Notion: 作ったページが一覧に出る (取り直している)', async () => {
    snapshots = [
      { teams: [], note: 'なし', pages: [] },
      { teams: [], note: 'なし', pages: [{ id: 'p9', title: '作ったページ', kind: 'page', lastEditedTime: '2026-09-12T00:00:00Z', url: 'https://notion.so/p9' }] },
    ];
    stubHub('notion');
    await mount('notion');
    await settleUntil(() => fetches > 0, '1 回目の取得');
    expect(text(), '最初から作ったページが見えている (標本が効いていない)').not.toContain('作ったページ');
    await click('ページを作成');
    await type(field('親ページ ID') as HTMLInputElement, 'p-1');
    await type(field('ページタイトル') as HTMLInputElement, '議事録');
    await click('作成');
    await settleUntil(() => text().includes('作成成功'), '成功の文');
    // **ここが本題** —— 取り直して、作った物が一覧に出る。
    await settleUntil(() => text().includes('作ったページ'), '作ったページが一覧に出る');
    expect(invoked).toEqual(['create-page']);
    expect(fetches, '取り直していない').toBeGreaterThanOrEqual(2);
  });

  it('★ Drive: 作ったフォルダが Recent Files に出る', async () => {
    snapshots = [
      { files: [] },
      { files: [{ id: 'f9', name: '新しいフォルダ', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-09-12T00:00:00Z', url: 'https://drive.google.com/f9' }] },
    ];
    stubHub('drive');
    await mount('drive');
    await settleUntil(() => fetches > 0, '1 回目の取得');
    await click('フォルダ作成');
    await type(field('フォルダ名') as HTMLInputElement, '新しいフォルダ');
    await click('作成');
    await settleUntil(() => container.querySelectorAll('[data-list-item]').length > 0 || text().includes('新しいフォルダ'), 'フォルダが一覧に出る');
    expect(invoked).toEqual(['create-folder']);
    expect(fetches, '取り直していない').toBeGreaterThanOrEqual(2);
  });

  it('★ Slack: 一覧に出ない物は取り直さない (無駄な通信を足していない)', async () => {
    snapshots = [{ channels: [{ id: 'C1', name: 'general', purpose: '', isArchived: false, permalink: 'https://x' }] }];
    stubHub('slack');
    await mount('slack');
    await settleUntil(() => fetches > 0, '1 回目の取得');
    const before = fetches;
    await click('メッセージ送信');
    await type(field('チャンネル ID') as HTMLInputElement, 'C1');
    await type(field('メッセージ本文') as HTMLTextAreaElement, 'こんにちは');
    await click('送信');
    await settleUntil(() => invoked.length > 0, '送信');
    expect(invoked).toEqual(['send-message']);
    expect(fetches, 'チャンネルの一覧は変わらないのに取り直している').toBe(before);
  });
});
