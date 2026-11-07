/** @vitest-environment jsdom */
/**
 * **「未入力 N 件」は、その文が説明している物を数える** (2026-09-23 · パス 435)。
 *
 * 書式の入力欄の上には 1 行だけ案内が出る —— 「＊ は空欄のまま交付すると書類として
 * 成立しない項目。」 その直後に未入力の件数が続くので、読む人はその数を
 * **「あと何個の ＊ を埋めれば交付できるか」** として読む。ところが `countBlank` は
 * `f.req` を見ずに**全欄**を数えていた。
 *
 * 実測 (2026-09-23 · 直す前 · 適格請求書を実物の画面で開いて ＊ の 4 欄を埋める):
 *
 * | | 空のとき | ＊ を 4 欄とも埋めた後 |
 * | --- | --- | --- |
 * | この案内 | 未入力 **28 / 35** 件 | 未入力 **24 / 35** 件 |
 * | 同じ画面の交付前チェック | —— | **「無効リスクは見つかりませんでした」** |
 *
 * ★ **＊ の未入力は 0 になっているのに、その ＊ を説明した文の隣は 24 と出る。**
 * 適格請求書 (消費税法57条の4) の ＊ は 4 欄だけで、残る 31 欄は任意である。
 * **旧実装の数はどの書面でも 0 にならない** —— 実測で 56 書面すべて必須数と一致しない
 * (最大は適格請求書の +31)。つまり「あと何を埋めれば交付できるか」に答えない数を、
 * その問いの文の隣に置いていた。しかも**同じ画面の 2 つのパネルが違う答えを出していた**
 * (パス 392 の形)。
 *
 * ## この検査の形
 *
 * - **母集団は走査で導く** —— `STUDIO_TEMPLATES` 全件に対して不変条件を当てる。
 *   書面を 1 つ足した日も黙らない。
 * - **背骨は振る舞い** —— 実物の画面を描いて実際に打ち、案内の文と交付前チェックが
 *   **同じ問いに同じ答えを出す**ことを見る。数え方の検査は `docStudioChecks.test.ts`
 *   が別に持つ (ここが見るのは「利用者が読む文」)。
 */
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { STUDIO_TEMPLATES } from '../../data/docStudioData';
import { blankCounts } from '../../data/docStudioChecks';
import { SERVICES } from '../../services';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

describe('未入力の件数 — 母集団', () => {
  it('★ どの書面でも、＊ を全部埋めれば ＊ の未入力は 0 になる', () => {
    const bad: string[] = [];
    for (const d of STUDIO_TEMPLATES) {
      const filled: Record<string, string> = {};
      for (const f of d.fields) if (f.req) filled[f.k] = 'x';
      const n = blankCounts(d, filled);
      if (n.required !== 0) bad.push(`${d.id}: ＊ の未入力が ${n.required}`);
      if (n.requiredTotal + n.optionalTotal !== d.fields.length) {
        bad.push(`${d.id}: 内訳の合計 ${n.requiredTotal + n.optionalTotal} が全欄 ${d.fields.length} と違う`);
      }
    }
    expect(bad, bad.join(' / ')).toEqual([]);
    expect(STUDIO_TEMPLATES.length, '走査が空虚でない (床)').toBeGreaterThanOrEqual(50);
  });

  it('★ ＊ と任意は実際に別物 —— 分けなければ 0 にならない書面が在る', () => {
    // この床が無いと、全欄が必須の書面ばかりのとき上の検査が自明に通る。
    const split = STUDIO_TEMPLATES.filter((d) => d.fields.some((f) => f.req) && d.fields.some((f) => !f.req));
    expect(split.length, '＊ と任意が混ざる書面').toBeGreaterThanOrEqual(30);
    // 旧実装 (全欄を数える) では、＊ を埋めきっても 0 にならなかった。
    const worst = split
      .map((d) => ({ id: d.id, left: d.fields.filter((f) => !f.req).length }))
      .sort((a, b) => b.left - a.left)[0]!;
    expect(worst.left, `${worst.id} は ＊ を埋めても旧実装なら ${worst.left} 件残る`).toBeGreaterThan(0);
  });
});

// --- 背骨: 実物の画面を描いて、2 つのパネルが同じ答えを出すことを見る ------------

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

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

/** 書式を開く。**条件で待つ** (法則 `wait-for-condition-not-ticks`)。 */
async function openDoc(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'docstudio');
  if (!def) throw new Error('docstudio service missing');
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  const btn = await waitForElement<HTMLButtonElement>(
    () => container.querySelector<HTMLButtonElement>(`button[data-doc-id="${id}"]`),
    `書式の一覧に ${id} が出る`,
  );
  await act(async () => { btn.click(); });
  await settleUntil(() => guide().includes('＊ の未入力'), '未入力の案内が出る');
}

const textOf = (starts: string): string =>
  Array.from(container.querySelectorAll('div'))
    .map((d) => (d.textContent ?? '').replace(/\s+/g, ' ').trim())
    .find((t) => t.startsWith(starts)) ?? '';

/**
 * 案内は**構造で引く** (`[data-blank-guide]`)。文面で引いていた 2026-09-23 (パス 435)
 * の形は、パス 436 がその文面を訂正した瞬間に的を失った —— **直せる物を locator に
 * してはいけない。** 数の形はこの下の `it` が主張する。
 */
const guide = (): string =>
  (container.querySelector('[data-blank-guide]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const checkPanel = (): string => textOf('🔍 交付前チェック');

async function type(key: string, value: string): Promise<void> {
  const el = container.querySelector<HTMLInputElement>(`input[data-field="${key}"]`);
  if (!el) throw new Error(`入力欄が無い: ${key}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('未入力の件数 — 実物の画面 (適格請求書)', () => {
  it('★ ＊ を全部埋めると案内が「＊ の未入力 0」になり、交付前チェックと一致する', async () => {
    await openDoc('invoice');
    // 直す前はここが「未入力 28 / 35 件」で、＊ の数 (4) をどこにも出していなかった。
    expect(guide(), '空のときの案内').toContain('＊ の未入力 4 / 4 件');

    for (const [k, v] of [
      ['to', '株式会社得意先'],
      ['company', '株式会社当社'],
      ['regno', 'T1234567890123'],
      ['date', '2026年9月30日'],
    ] as const) await type(k, v);

    await settleUntil(() => guide().includes('＊ の未入力 0 / 4 件'), '＊ の未入力が 0 になる');
    // **同じ画面の 2 つのパネルが同じ答えを出す** —— 直す前は 24 件 vs「見つかりませんでした」。
    expect(checkPanel(), '交付前チェック').toContain('無効リスクは見つかりませんでした');
  });

  it('★ 任意の欄はその数に混ざらない (別の数として出る)', async () => {
    await openDoc('invoice');
    const g = guide();
    expect(g, '＊ と任意は別に出る').toMatch(/＊ の未入力 \d+ \/ \d+ 件・ ?その他の欄 \d+ \/ \d+ 件/);
    // 針が的に当たる標本 —— 合算した 1 つの数だけの文はこの形に当たらない。
    expect('＊ は交付前に埋める欄 —— 未入力は下の交付前チェックが挙げます。未入力 28 / 35 件。')
      .not.toMatch(/＊ の未入力 \d+ \/ \d+ 件・ ?その他の欄 \d+ \/ \d+ 件/);
  });
});
