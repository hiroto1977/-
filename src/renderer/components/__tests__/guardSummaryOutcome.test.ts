/** @vitest-environment jsdom */
/**
 * **まとめ表示の見出しと前置きは、指摘が述べた結果から組む** (2026-09-27 · パス 493l)。
 *
 * それまで `GuardSummary` の見出しは ⛔ の件数を「読み取れない入力 N 件」と呼び、
 * 前置きは中身を問わず「読み取れなかった欄は 0 として計算されています」と出していた。
 * 実測: iDeCo の掛金が上限を超えただけ (読める値・計算は上限で行う) でも
 * 「読み取れない入力 1 件」「0 として計算されています」と言っていた。
 * 前置きは **0 として計算した欄 (`outcome: 'computedAsZero'`) が在るときだけ**、その数を言う。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GuardSummary } from '../GuardedNumber';
import { guardNumber, type GuardIssue, type NumSpec } from '../../data/inputGuards';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
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

async function render(issues: readonly GuardIssue[]): Promise<void> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(GuardSummary, { issues }));
  });
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const must = (g: GuardIssue | null): GuardIssue => {
  if (g === null) throw new Error('指摘が無い');
  return g;
};

const money: NumSpec = { label: '課税所得', kind: 'money' };
const ideco: NumSpec = { label: 'iDeCo 掛金', kind: 'money', max: 816_000 };

describe('GuardSummary — 前置きは 0 として計算した欄の数を言う (パス 493l)', () => {
  it('★ 読めない値を 0 として計算した欄が在れば、その数を言う', async () => {
    await render([must(guardNumber('abc', money))]);
    expect(text()).toContain('⛔ 入力の確認 — 直す必要のある入力 1 件 / 要確認 0 件');
    expect(container.querySelector('[data-guard-summary-zeroed]')?.getAttribute('data-guard-summary-zeroed')).toBe('1');
    expect(text()).toContain('0 として計算した欄が 1 件あります。下の数字はその前提の値です。');
  });

  it('★ 上限を超えただけ (読める値) なら「0 として計算」と言わず、「読み取れない」とも呼ばない', async () => {
    const over = must(guardNumber('900000', ideco));
    expect(over.outcome).toBeNull();
    await render([over]);
    expect(container.querySelector('[data-guard-summary-zeroed]')).toBeNull();
    expect(text()).not.toContain('0 として計算');
    expect(text()).not.toContain('読み取れない入力');
    expect(text()).toContain('直す必要のある入力 1 件');
    // 標本: 直す前の見出しの綴りはこの形 —— 針は外れていない
    expect('⛔ 入力の確認 — 読み取れない入力 1 件 / 要確認 0 件').toContain('読み取れない入力');
  });

  it('断る欄 (判定を出さない) の指摘も「0 として計算」に数えない', async () => {
    await render([must(guardNumber('abc', { ...money, refusedBy: 'judgement' }))]);
    expect(container.querySelector('[data-guard-summary-zeroed]')).toBeNull();
    expect(text()).toContain('直すまで、この欄を使う判定は出していません。');
  });

  it('空欄 (⚠️) と読めない値 (⛔) を合わせて数える —— 見出しの件数は重さで分ける', async () => {
    await render([must(guardNumber('', money)), must(guardNumber('abc', money)), must(guardNumber('900000', ideco))]);
    expect(text()).toContain('直す必要のある入力 2 件 / 要確認 1 件');
    expect(container.querySelector('[data-guard-summary-zeroed]')?.getAttribute('data-guard-summary-zeroed')).toBe('2');
  });

  it('指摘が無ければ何も描かない', async () => {
    await render([]);
    expect(container.innerHTML).toBe('');
  });
});
