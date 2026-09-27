/** @vitest-environment jsdom */
/**
 * **全 75 画面の下に在るのに、1 度も押されていなかった欄** (2026-09-12 · パス 170)。
 *
 * `App.tsx` は現在の画面の後ろに `ManualDataSection` を**1 つだけ**描く ——
 * つまりこの欄は**どのサービスを開いていても出る**。にもかかわらず行カバレッジは
 * **37.5%** (2026-09-12 実測・renderer で最も低い) で、専用の検査は 1 つも無かった。
 * パス 151 の規準「カバレッジが低い画面は動かない物が見つかる確率が高い」を当てる。
 *
 * ## ここで押すもの
 *
 * | 節 | 出る条件 | 押すこと |
 * | --- | --- | --- |
 * | 事業の登録 | 常に | 足す・断られる・消す |
 * | 任意の数値 | 常に | 足す・単位・事業に紐づける・消す |
 * | 計算値の置き換え | `hasCatalog(scope)` の画面だけ | 置く・出る・自動に戻す |
 *
 * ## 実測した欠陥 (このパスで直した物)
 *
 * **見出しの件数と、並ぶ行が別の規則から出ていた。** 見出しは
 * `metricsForScope(scope, …)` (自分の検査を持つ共有関数) で数え、行は画面の中で
 * `records.filter((r) => r.data.scope === scope)` と**同じ規則を書き直して**いた。
 * 今日は両方一致するが、`metricsForScope` の側だけを直すと
 * **「3 件」と書いてあるのに 2 行しか出ない**形になる (パス 61 で直した
 * 「同じ量を 2 通りに導いて画面で食い違う」家系)。共有関数 1 つに寄せた。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ManualDataSection } from '../ManualDataSection';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { hasCatalog, sectionsFor } from '../../data/manualData';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(scope: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ManualDataSection, { scope }));
  });
  await settle();
}

/** 実際の入力として流す (素の代入では React に届かない)。 */
async function type(el: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  await settle();
}

function field(label: string): HTMLInputElement | HTMLSelectElement {
  const el = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`欄が無い: ${label}`);
  return el;
}

function button(label: string): HTMLButtonElement {
  const el = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label));
  if (!el) throw new Error(`ボタンが無い: ${label}`);
  return el as HTMLButtonElement;
}

async function click(el: HTMLButtonElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

const text = (): string => container.textContent ?? '';

/** 節を開く (既定は閉じている)。 */
async function open(): Promise<void> {
  const head = container.querySelector<HTMLButtonElement>('[data-manual-data] > button');
  if (!head) throw new Error('見出しのボタンが無い');
  await click(head);
  await waitForElement(() => container.querySelector('[data-business-units]'), '事業の節');
}

beforeEach(async () => {
  // **singleton を捨てるだけでは隔離にならない** —— IndexedDB が残り、前の
  // `it()` が UI から足したレコードが次の `it()` に見える (パス 170 で実測。
  // 「0 件であること」を見る 3 本がこれで落ちた)。`recordStoreHarness` が両方やる。
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

describe('手入力の欄 — 開いて押す (パス 170)', () => {
  it('★ 既定は閉じていて、開くと 3 つの節が出る (catalog を持つ画面)', async () => {
    expect(hasCatalog('sales'), 'sales に catalog が無い (走査が空振り)').toBe(true);
    await mount('sales');
    expect(container.querySelector('[data-business-units]'), '閉じているのに中身が在る').toBeNull();
    const head = container.querySelector<HTMLButtonElement>('[data-manual-data] > button');
    expect(head!.getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(container.querySelector('[data-business-units]')).not.toBeNull();
    expect(container.querySelector('[data-manual-metrics]')).not.toBeNull();
    expect(container.querySelector('[data-manual-overrides]')).not.toBeNull();
    expect(head!.getAttribute('aria-expanded')).toBe('true');
  });

  it('★ catalog を持たない画面には置き換えの節が出ない', async () => {
    expect(hasCatalog('github'), 'github に catalog が在る (前提が崩れた)').toBe(false);
    await mount('github');
    await open();
    expect(container.querySelector('[data-business-units]')).not.toBeNull();
    expect(container.querySelector('[data-manual-overrides]'), '一覧が無いのに置き換えが出ている').toBeNull();
  });

  it('★ 事業を足すと一覧に出る', async () => {
    await mount('sales');
    await open();
    await type(field('事業名') as HTMLInputElement, '第二工場');
    await type(field('月次の売上高') as HTMLInputElement, '1200000');
    await click(button('事業を追加'));
    await settleUntil(() => text().includes('第二工場'), '足した事業が一覧に出る');
    expect(container.querySelectorAll('[data-business-unit]')).toHaveLength(1);
    // 金額は整形して出る (刷る側も通っている)。
    expect(container.querySelector('[data-business-amounts]')?.textContent).toContain('1,200,000');
    // 欄は空に戻る (次を足せる)。
    expect((field('事業名') as HTMLInputElement).value).toBe('');
  });

  it('★ 事業名が空なら断り、1 件も足さない', async () => {
    await mount('sales');
    await open();
    await click(button('事業を追加'));
    await settleUntil(() => text().includes('事業名を入力してください'), '断りが出る');
    expect(container.querySelectorAll('[data-business-unit]')).toHaveLength(0);
  });

  it('★ 開始時期の形が違えば断る (YYYY-MM を求めると言う)', async () => {
    await mount('sales');
    await open();
    await type(field('事業名') as HTMLInputElement, 'X');
    await type(field('開始時期') as HTMLInputElement, '2026/13');
    await click(button('事業を追加'));
    await settleUntil(() => text().includes('開始時期は'), '断りが出る');
    expect(text()).toContain('YYYY-MM');
    expect(container.querySelectorAll('[data-business-unit]')).toHaveLength(0);
    // 打ち込んだ値は残る (断られても消えない)。
    expect((field('事業名') as HTMLInputElement).value).toBe('X');
  });

  it('★ 任意の数値を足すと、単位つきで出る', async () => {
    await mount('sales');
    await open();
    await type(field('項目名') as HTMLInputElement, '来店客数');
    await type(field('値') as HTMLInputElement, '320');
    await type(field('単位') as HTMLSelectElement, 'count');
    await click(button('数値を追加'));
    await settleUntil(() => text().includes('来店客数'), '足した数値が出る');
    const row = container.querySelector('[data-manual-metric]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('320');
    expect(row!.textContent).toContain('件');
    // 事業を選んでいないので、そう言う。
    expect(row!.textContent).toContain('事業の指定なし');
  });

  it('★ 見出しの件数と、並ぶ行の数が一致する (同じ規則から出ている)', async () => {
    await mount('sales');
    await open();
    for (const [label, value] of [['来店客数', '320'], ['歩留まり', '97']] as const) {
      await type(field('項目名') as HTMLInputElement, label);
      await type(field('値') as HTMLInputElement, value);
      await click(button('数値を追加'));
      await settleUntil(() => text().includes(label), `${label} が出る`);
    }
    const rows = container.querySelectorAll('[data-manual-metric]').length;
    expect(rows).toBe(2);
    const head = container.querySelector<HTMLButtonElement>('[data-manual-data] > button');
    // 見出しは「… 2 件」と述べる —— 行の数と同じ数でなければならない。
    expect(head!.textContent, `見出しが行数 (${rows}) と違う数を述べている`).toContain(`${rows} 件`);
  });

  it('★ 別の画面の数値は出ない (scope で分かれている)', async () => {
    await mount('sales');
    await open();
    await type(field('項目名') as HTMLInputElement, '売上だけの項目');
    await type(field('値') as HTMLInputElement, '1');
    await click(button('数値を追加'));
    await settleUntil(() => text().includes('売上だけの項目'), '足した数値が出る');
    // 同じストアを別の scope で描き直す。
    await act(async () => {
      root!.unmount();
    });
    root = null;
    await mount('kpi');
    await open();
    expect(text(), '別の画面の数値が出ている').not.toContain('売上だけの項目');
    const head = container.querySelector<HTMLButtonElement>('[data-manual-data] > button');
    expect(head!.textContent).toContain('0 件');
  });

  it('★ 計算値を置き換えると「手入力」として出て、自動に戻せる', async () => {
    const first = sectionsFor('sales')[0]!.fields[0]!;
    await mount('sales');
    await open();
    const row = container.querySelector(`[data-override-row="${first.path}"]`);
    expect(row, `置き換えの行が無い: ${first.path}`).not.toBeNull();
    await type(field(`${first.label} を手入力`) as HTMLInputElement, '4500000');
    await click(button('保存'));
    await waitForElement(() => container.querySelector('[data-overridden]'), '手入力のバッジ');
    expect(container.querySelector('[data-overridden]')!.textContent).toContain('4,500,000');
    await click(button('自動に戻す'));
    await settleUntil(() => container.querySelector('[data-overridden]') === null, 'バッジが消える');
  });

  it('★ 置き換えに数字でない物を入れると断り、置き換えは生まれない', async () => {
    const first = sectionsFor('sales')[0]!.fields[0]!;
    await mount('sales');
    await open();
    await type(field(`${first.label} を手入力`) as HTMLInputElement, '４５００');
    await click(button('保存'));
    await settleUntil(() => text().includes('半角数字'), '断りが出る');
    expect(container.querySelector('[data-overridden]'), '断ったのに置き換えが在る').toBeNull();
  });

  it('対照: 走査が実物に当たっている (節の目印と scope が出ている)', async () => {
    await mount('sales');
    expect(container.querySelector('[data-manual-data]')?.getAttribute('data-scope')).toBe('sales');
    expect(text()).toContain('事業・数値の手入力');
  });
});
