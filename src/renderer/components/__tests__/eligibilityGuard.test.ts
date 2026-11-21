/** @vitest-environment jsdom */
/**
 * **制度判定の年齢・経営管理の従事年数は、読めない値を「未入力」と言わない** (2026-09-27 · パス 493q)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 2 欄は素の `<input>` で、`parseNumericInput` (= `readNumeric`) が読めない値を `null` —— **未入力**
 * —— にしていた。判定 (`judgeEligibility`) は `null` の年齢を「年齢が未入力」と言う:
 *
 * | 年齢の欄に打った物 | 見出し | 年齢を要件にする 5 制度の理由 |
 * | --- | --- | --- |
 * | `66` | 要件を満たす 1 / 入力が足りない 2 / 対象外 6 | 「年齢 66 歳は要件（…）を満たさない」 |
 * | **`66歳`** | **要件を満たす 1 / 入力が足りない 8 / 対象外 0** | **「年齢が未入力（要件: …）」** |
 * | **`-5`** | 要件を満たす 1 / 入力が足りない 2 / 対象外 6 | **「年齢 -5 歳は要件（49歳以下）を満たす」** |
 *
 * **2 行目は、年齢を打った人に「入れていない」と言い、しかも答えそのものが違う** (6 制度が
 * 「対象外」から「入力が足りない」へ動く)。3 行目はマイナスの年齢を要件に当てていた。
 *
 * ## 直し
 *
 * 2 欄を関門 (`GuardedNumber`) にし、読めない値・マイナスは判定を断る (`refusedBy: 'judgement'`)。
 * 断りの文 (`[data-refused-fields]`) が欄を名指しし、見出しと制度の一覧は出さない —— 出すと、
 * 断った欄を「未入力」として判定した結果になる。**空欄は今までどおり判定する** —— そのとき
 * 「年齢が未入力」は真である (下の対照がそれを示し、不在の主張が空でない証拠にもなる)。
 *
 * ここは実物の部品を描いて、実際に打つ (単体の判定関数ではなく、画面が何と言うか)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EligibilityChecker } from '../EligibilityChecker';
import { judgeEligibility, parseNumericInput } from '../../data/eligibility';
import { waitForText } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(EligibilityChecker));
  });
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const refusedNote = (): string => container.querySelector('[data-refused-fields]')?.textContent ?? '';
const field = (label: string): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`欄「${label}」が無い`);
  return el;
};

async function type(label: string, value: string): Promise<void> {
  const input = field(label);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 見出しの行 (判定を出しているときだけ在る)。 */
const SUMMARY = /要件を満たす \d+ 件 ／ 入力が足りない \d+ 件 ／ 対象外 \d+ 件/;

describe('制度判定の年齢 — 読めない値を「未入力」と言わない (パス 493q)', () => {
  it('標本: 直す前の読み方では「66歳」は未入力になり、判定は「年齢が未入力」と言う', () => {
    // 読み手は今も同じ 1 つ (`readNumeric`) —— 変わったのは、画面がその null を
    // 「未入力」として判定へ渡さなくなったこと。
    expect(parseNumericInput('66歳')).toBeNull();
    const r = judgeEligibility({
      age: parseNumericInput('66歳'),
      gender: 'unspecified',
      entity: 'individual',
      managementYears: null,
      certifiedFarmer: null,
      certifiedNewFarmer: null,
    });
    const reasons = [...r.eligible, ...r.needsCheck, ...r.ineligible].flatMap((j) => j.reasons);
    expect(reasons.some((x) => x.startsWith('年齢が未入力'))).toBe(true);
    expect(r.needsCheck.length).toBe(8);
  });

  it('★ 「66歳」は判定を断り、欄を名指しする —— 「年齢が未入力」も見出しも出さない', async () => {
    await type('年齢（就農時）', '66歳');
    await waitForText(refusedNote, '年齢（就農時）');
    expect(refusedNote()).toContain('この判定は算定していません');
    expect(text()).not.toContain('年齢が未入力');
    expect(text()).not.toMatch(SUMMARY);
    // 欄の下の文は結果を述べる (関門の文)
    expect(field('年齢（就農時）').getAttribute('data-guard-outcome')).toBe('refused');
  });

  it('★ マイナスの年齢も判定を断る (直す前は「年齢 -5 歳は要件（49歳以下）を満たす」)', async () => {
    await type('年齢（就農時）', '-5');
    await waitForText(refusedNote, '年齢（就農時）');
    expect(text()).not.toContain('年齢 -5 歳');
    expect(text()).not.toMatch(SUMMARY);
  });

  it('経営管理の従事年数も同じ (読めない値は断り、欄を名指しする)', async () => {
    // `8年` は読める (単位の飾りは落とす —— `readNumeric`)。読めないのは数字の後ろに語が続く形。
    expect(parseNumericInput('8年')).toBe(8);
    expect(parseNumericInput('8年間')).toBeNull();
    await type('経営管理の従事年数', '8年間');
    await waitForText(refusedNote, '経営管理の従事年数');
    expect(text()).not.toContain('経営管理の従事年数が未入力');
    expect(text()).not.toMatch(SUMMARY);
  });

  it('★ 対照: 読める年齢は判定する —— 断りは消え、年齢で理由を述べる', async () => {
    await type('年齢（就農時）', '66');
    await waitForText(text, '年齢 66 歳は要件（18歳以上45歳未満）を満たさない');
    expect(refusedNote()).toBe('');
    expect(text()).toMatch(SUMMARY);
  });

  it('★ 対照: 空欄は今までどおり判定し、「年齢が未入力」と言う (そのときは真 —— 上の不在の主張が空でない証拠)', async () => {
    await type('年齢（就農時）', '66');
    await waitForText(text, '年齢 66 歳は要件');
    await type('年齢（就農時）', '');
    await waitForText(text, '年齢が未入力');
    expect(refusedNote()).toBe('');
    expect(text()).toMatch(SUMMARY);
  });

  it('全角数字は読める (IME の普通の入力 —— 断らない)', async () => {
    await type('年齢（就農時）', '７０');
    await waitForText(text, '年齢 70 歳は要件（18歳以上45歳未満）を満たさない');
    expect(refusedNote()).toBe('');
  });

  it('小数の年齢は整数を求めるが、判定は断らない (⚠ で尋ねるだけ)', async () => {
    await type('年齢（就農時）', '44.5');
    await waitForText(text, '年齢 44.5 歳は要件');
    expect(refusedNote()).toBe('');
    expect(field('年齢（就農時）').getAttribute('data-guard')).toBe('warn');
  });
});
