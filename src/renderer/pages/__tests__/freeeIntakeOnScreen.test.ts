/** @vitest-environment jsdom */
/**
 * **freee の画面を、月次が在る状態で描く** (2026-09-12 · パス 153)。
 *
 * この画面は 2026-09-12 の全域計測で **33.33%** —— 同梱の見本 (`SNAPSHOT.freee`) は
 * 月次が空なので、`CashflowChart` と月次明細は**一度も描かれたことが無かった**。
 * トークンが在る状態を作って `fetchSnapshot` から月次を返し、
 *
 * - 棒グラフと明細が出ること
 * - 取り込みで落ちた取引の注記が出ること (パス 153 の本体)
 * - 落ちていなければ注記が出ないこと (対照)
 *
 * を実物の DOM で見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { NO_DEAL_INTAKE, type FreeeDealIntake } from '../../../shared/freeeIntake';

interface FreeePayload {
  readonly companyName: string;
  readonly monthly: readonly { month: string; income: number; expense: number; net: number }[];
  readonly intake: FreeeDealIntake;
  readonly fetchedAt: string;
}

const MONTHLY = [
  { month: '2026-03', income: 1_000_000, expense: 700_000, net: 300_000 },
  { month: '2026-04', income: 1_100_000, expense: 1_400_000, net: -300_000 },
] as const;

let payload: FreeePayload;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    // トークンが在る状態 —— これで useServiceData がマウント時に 1 度取得する。
    listConfigured: () => Promise.resolve(['freee']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: payload }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
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
  const def = SERVICES.find((s) => s.id === 'freee');
  if (!def) throw new Error('freee service missing from the sidebar');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function noticeText(): string | null {
  const el = container.querySelector('[data-freee-intake-note]');
  return el === null ? null : (el.textContent ?? '');
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  payload = {
    companyName: 'テスト商会',
    monthly: [...MONTHLY],
    intake: { deals: 120, skippedNoDate: 3, skippedBadAmount: 1, clampedNegative: 2 },
    fetchedAt: '2026-05-01T00:00:00.000Z',
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

describe('freee 会計連携の画面 (カバレッジ 33.33% だった側 · パス 153)', () => {
  it('★ 走査が実物に当たる: 月次が在るとグラフと明細が出る (見本では出ない枝)', async () => {
    await mount();
    // 見本 (`SNAPSHOT.freee.monthly` は空) では出ない節が出ている。
    expect(container.textContent).toContain('月次キャッシュフロー (収入 / 支出 / 営業CF)');
    expect(container.textContent).toContain('月次明細');
    expect(container.textContent).not.toContain('アクセストークンを設定して「更新」を押すと');
    // 棒グラフ: 2 か月 × (収入・支出) の 4 本 + 凡例の見本 2 本 + 枠 1。
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('rect').length).toBeGreaterThanOrEqual(4);
    // 純CF の点は月ごとに 1 つ + 凡例の 1 つ。
    expect(svg!.querySelectorAll('circle').length).toBe(MONTHLY.length + 1);
  });

  it('棒の高さが負にならない (SVG は負の height を描かない)', async () => {
    await mount();
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      const h = Number(r.getAttribute('height'));
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it('明細は収入・支出・純額を月ごとに刷る (純額は負なら「−」)', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain('2026-03');
    expect(text).toContain('収入 ¥1,000,000');
    expect(text).toContain('支出 ¥700,000');
    expect(text).toContain('純 ¥300,000');
    // 2026-04 は純額が負 —— 記号は `jpy()` の「−」(全角マイナス)。
    expect(text).toContain('純 −¥300,000');
  });

  it('★ 取り込みで落ちた取引を画面が述べる (件数と影響)', async () => {
    await mount();
    const note = noticeText();
    expect(note).not.toBeNull();
    expect(note).toContain('取引 120 件');
    expect(note).toContain('取引日が読めない 3 件は集計から外しました。');
    expect(note).toContain('金額が数として読めない 1 件は集計から外しました。');
    expect(note).toContain('金額が負の 2 件は 0 円として数えました。');
    expect(note).toContain('その分だけ実際と異なります');
  });

  it('★ 対照: 1 件も落ちていなければ注記そのものが出ない', async () => {
    payload = { ...payload, intake: { ...NO_DEAL_INTAKE, deals: 120 } };
    await mount();
    expect(noticeText()).toBeNull();
    // 節そのものは出ている (注記が消えただけで画面が壊れていない)。
    expect(container.textContent).toContain('月次明細');
  });

  it('見本のまま (未連携) でも落ちず、取得前の案内を出す', async () => {
    (globalThis as unknown as { serviceHub: { listConfigured: () => Promise<string[]> } })
      .serviceHub.listConfigured = () => Promise.resolve([]);
    await mount();
    expect(container.textContent).toContain('アクセストークンを設定して「更新」を押すと');
    expect(noticeText()).toBeNull();
    expect(container.textContent).toContain('営業CF 合計');
  });

  it('事業所名は取得できたときだけ添える', async () => {
    await mount();
    expect(container.textContent).toContain('テスト商会');
  });
});
