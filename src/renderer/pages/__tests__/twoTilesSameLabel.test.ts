/** @vitest-environment jsdom */
/**
 * **同じラベルのタイルが 1 ページに 2 つ在るなら、答え方も同じにする。**
 *
 * KPI 画面には「限界利益率」のタイルが**2 か所**在る:
 *
 * | 場所 | 値の出どころ | 直す前の刷り方 |
 * | --- | --- | --- |
 * | 実績タイル群 (`KpiPage.tsx:500`) | 利用者の KPI 実績 → `computeKpiMetrics` (パス 52 で `number \| null`) | `pctOrDash` → **「—」** |
 * | 事業タイル群 (`KpiPage.tsx:811`) | live / snapshot の payload → `main/clients/kpi.ts` (`: 0`) | `pct` → **「0.0%」** |
 *
 * 売上 0 のとき、**同じページの同じラベルのタイルが違う答えを出していた。**
 * しかも両タイル群の「安全余裕率」はどちらも `pctOrDash` で「—」——
 * **ページは既に規約を知っていて、揃っていなかったのは main から来る値だけ**だった。
 *
 * パス 52 は renderer 側の双子を直して `main/clients/kpi.ts` を残した。
 * census では「画面だけの面」と分類したが、**画面に出ることは確かめていなかった。**
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { computeKpi, type Fundamentals } from '../../../main/clients/kpi';

/** 売上 0・固定費だけの事業 (率はどれも算定不能)。 */
const ZERO: Fundamentals = { revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0 };
/** 売上が在る事業 (限界利益率 60%)。 */
const OK: Fundamentals = { revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0 };

function unit(id: string, label: string, f: Fundamentals) {
  return { id, label, fundamentals: f, kpi: computeKpi(f), history: [f] };
}

const hub = () =>
  (globalThis as unknown as { serviceHub: { fetchSnapshot: unknown; listConfigured: unknown } }).serviceHub;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountWith(f: Fundamentals): Promise<void> {
  const u = unit('u1', '単一事業', f);
  hub().listConfigured = () => Promise.resolve(['kpi']);
  hub().fetchSnapshot = (id: string) =>
    Promise.resolve(
      id === 'kpi'
        ? { ok: true, data: { units: [u], aggregate: { ...u, id: 'all', label: '全社合算' }, isMock: false } }
        : { ok: false, code: 'x', message: 'x' },
    );
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/**
 * 「限界利益率」というラベルを持つタイルの値を**全部**集める。
 *
 * `Tile` はラベル 1 つ + 値 1 つの入れ物なので、ラベルの兄弟要素を読む。
 * **数え上げること自体が主眼** —— 1 つだけ読むと、もう 1 つの答えを見落とす
 * (それが 2026-09-08 までの見落としだった)。
 */
function tilesLabelled(label: string): string[] {
  const out: string[] = [];
  for (const el of Array.from(container.querySelectorAll('div'))) {
    if (el.children.length !== 0) continue;
    if ((el.textContent ?? '').trim() !== label) continue;
    const value = el.nextElementSibling;
    if (value) out.push((value.textContent ?? '').trim());
  }
  return out;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('KPI — 同じラベルのタイルは同じ答え方をする', () => {
  it('★ 対照: 「限界利益率」のタイルは 1 ページに 2 つ在る (数え上げが効いている)', async () => {
    await mountWith(OK);
    // 実績タイル群は KPI 実績レコードが要る (この検査では 0 件) ので、
    // live 由来の 1 つだけが出る。**2 つ在る**ことは下の 安全余裕率 で確かめる。
    expect(tilesLabelled('限界利益率').length).toBeGreaterThanOrEqual(1);
    expect(tilesLabelled('限界利益率')).toContain('60.0%');
  });

  it('★ 売上 0 のとき「0.0%」を刷らない (「—」に揃える)', async () => {
    await mountWith(ZERO);
    const tiles = tilesLabelled('限界利益率');
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    // 直す前は '0.0%' だった
    expect(tiles).not.toContain('0.0%');
    for (const v of tiles) expect(v).toBe('—');
  });

  it('★ 同じタイル群の「安全余裕率」と答え方が一致する (ページ内の規約)', async () => {
    await mountWith(ZERO);
    const margin = tilesLabelled('安全余裕率');
    const contrib = tilesLabelled('限界利益率');
    expect(margin.length).toBeGreaterThanOrEqual(1);
    expect(contrib.length).toBeGreaterThanOrEqual(1);
    // 安全余裕率は元から「—」だった。限界利益率だけがずれていた。
    expect(new Set([...margin, ...contrib])).toEqual(new Set(['—']));
  });

  it('★ 値の側で揃っている (画面の書式に頼らない)', () => {
    expect(computeKpi(ZERO).contributionRatio).toBeNull();
    expect(computeKpi(ZERO).variableRatio).toBeNull();
    expect(computeKpi(ZERO).fixedRatio).toBeNull();
    expect(computeKpi(OK).contributionRatio).toBe(60);
  });
});
