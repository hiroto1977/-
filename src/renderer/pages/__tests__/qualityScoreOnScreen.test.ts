/** @vitest-environment jsdom */
/**
 * **1 円も確定していない事業者に「資金調達 質スコア 100 / 100」と出さない。**
 *
 * `fundingQualityScore` は確定総額が 0 のとき、2 つの比率を **1.0** に倒していた。
 * 実装コメントはそれを「ゼロ除算ガード: 確定額が無いときは**中立**の 1.0」と
 * 呼んでいたが、**同じファイルの型の doc は「1.0 が最良」と書いていた** ——
 * 0..1 を 0..100 点へ写す指標で 1.0 は中立ではなく**満点**である。
 *
 * ## 実測 (2026-09-09)
 *
 * | 入力 | 確定総額 | パイプライン | 質スコア |
 * | --- | ---: | ---: | ---: |
 * | 案件 0 件 | ¥0 | ¥0 | **100 / 100** |
 * | 申請中 2 件 (補助金 300 万・融資 800 万) | **¥0** | ¥1,100 万 | **100 / 100** |
 *
 * サマリーのタイル群は `hasData` の**外**で描かれるので、画面には
 * 「確定総額 ¥0」の隣に「質スコア 100 / 100」が並んでいた。
 *
 * ## 見本と実装が正反対だった
 *
 * 同梱データ (`snapshot.ts`) は同じ空状態に `compositeScore: 0` を持っていた。
 * **見本は 0、live 計算は 100。** どちらが正しいかではなく、
 * **どちらも「算定不能」を数で答えていた**のが誤り。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { SNAPSHOT } from '../../data/snapshot';
import { summarize, fundingQualityScore, type FundingItem } from '../../../shared/funding';

/** 申請中だけ (案件は在るが確定は 0)。 */
const PENDING: FundingItem[] = [
  { id: 'a', kind: 'subsidy', name: '申請中の補助金', amount: 3_000_000, status: 'applied', month: '2026-03', repayable: false },
  { id: 'b', kind: 'loan', name: '審査中の融資', amount: 8_000_000, status: 'applied', month: '2026-03', repayable: true },
];
/** 確定した融資 1 件 (質スコアが算定できる)。 */
const SECURED: FundingItem[] = [
  { id: 'l', kind: 'loan', name: '確定融資', amount: 10_000_000, status: 'received', month: '2026-02', repayable: true },
];

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

/**
 * `SNAPSHOT.funding` を土台に、案件と summary / qualityScore だけ差し替える。
 * 受け口は `unknown` (`SNAPSHOT` は `as const` でリテラル型になるため — パス 60)。
 */
function payload(items: readonly FundingItem[]): unknown {
  const summary = summarize(items);
  return {
    ...SNAPSHOT.funding,
    items,
    summary,
    qualityScore: fundingQualityScore(summary),
  };
}

async function mountWith(p: unknown): Promise<void> {
  hub().listConfigured = () => Promise.resolve(['funding']);
  hub().fetchSnapshot = (id: string) =>
    Promise.resolve(id === 'funding' ? { ok: true, data: p } : { ok: false, code: 'x', message: 'x' });
  const def = SERVICES.find((s) => s.id === 'funding');
  if (!def) throw new Error('funding service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** サマリーのタイルをラベルで読む (ラベル 1 つ + 値 1 つ + 任意の副題)。 */
function tileValue(label: string): string | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length < 2 || kids.length > 3) continue;
    if ((kids[0]?.textContent ?? '').trim() !== label) continue;
    return (kids[1]?.textContent ?? '').trim();
  }
  return null;
}

const scopeBand = (): string =>
  Array.from(container.querySelectorAll('[data-quality-scope]'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
    .join(' | ');

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

describe('資金調達 — 確定が無いときの質スコア', () => {
  it('★ 対照: 確定した調達が在れば数で出る (スコアそのものが生きている)', async () => {
    await mountWith(payload(SECURED));
    expect(tileValue('確定総額')).toContain('10,000,000');
    // 融資だけ → 返済不要比率 0・税引後比率 1 → (0*0.4 + 1*0.6)/1 = 0.6 → 60
    expect(tileValue('資金調達 質スコア')).toBe('60 / 100');
    expect(scopeBand()).toBe('');
  });

  it('★ 申請中だけの事業者に「100 / 100」を出さない', async () => {
    await mountWith(payload(PENDING));
    expect(tileValue('確定総額')).toContain('0');
    expect(tileValue('パイプライン総額')).toContain('11,000,000');
    // 直す前は '100 / 100' だった
    expect(tileValue('資金調達 質スコア')).toBe('—');
    expect(text()).not.toContain('100 / 100');
  });

  it('★ 案件が 1 件も無くても「100 / 100」を出さない', async () => {
    await mountWith(payload([]));
    expect(tileValue('資金調達 質スコア')).toBe('—');
    expect(text()).not.toContain('100 / 100');
  });

  it('★ 理由をタイルの直下で述べる (「0 点」とも読ませない)', async () => {
    await mountWith(payload(PENDING));
    const band = scopeBand();
    expect(band).toContain('確定した調達がまだ無いため');
    expect(band).toContain('確定総額で割る指標');
    // 申請中の案件が消えたわけではないことを言う
    expect(band).toContain('パイプライン総額に出ています');
  });

  it('★ `${null} / 100` を刷らない (テンプレートリテラルは型検査を素通りする)', async () => {
    await mountWith(payload([]));
    expect(text()).not.toContain('null');
    expect(text()).not.toContain('NaN');
  });

  it('★ 出荷する既定データも同じ答えを持つ (見本と実装が食い違わない)', () => {
    // 同梱は案件 0 件 = 確定 0。2026-09-09 まで見本は 0・live 計算は 100 だった。
    expect(SNAPSHOT.funding.items).toHaveLength(0);
    expect(SNAPSHOT.funding.qualityScore.compositeScore).toBeNull();
    expect(SNAPSHOT.funding.qualityScore.unavailableNote).not.toBeNull();
    // **同じ入力に対する live 計算と一致すること** (これが「食い違わない」の中身)
    expect(fundingQualityScore(summarize([]))).toEqual(SNAPSHOT.funding.qualityScore);
  });
});
