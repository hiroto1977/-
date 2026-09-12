/** @vitest-environment jsdom */
/**
 * **断りの節そのものの契約** (2026-09-12 · パス 172)。
 *
 * 7 画面はこの 1 つを描く。境界 (天井ちょうど / 1 字超え) と文面をここで留める ——
 * 画面側の検査 (`pages/__tests__/writeBodyCeilings.test.ts`) は「配線されているか」を見る。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CeilingNotice } from '../CeilingNotice';
import { refusedCeilingNote } from '../../../shared/inputCeiling';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

async function render(props: { label: string; value: string; max: number }): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(CeilingNotice, props));
  });
}

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

describe('天井を超えた本文の断り (CeilingNotice · パス 172)', () => {
  it('★ 天井の内なら何も描かない', async () => {
    await render({ label: '本文', value: 'あ'.repeat(10), max: 10 });
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-ceiling-notice]')).toBeNull();
  });

  it('★ 空でも何も描かない (まだ何も打っていない欄で驚かせない)', async () => {
    await render({ label: '本文', value: '', max: 10 });
    expect(container.textContent).toBe('');
  });

  it('★ 1 字超えたら、共有の 1 文をそのまま描く', async () => {
    await render({ label: '本文', value: 'あ'.repeat(11), max: 10 });
    const node = container.querySelector('[data-ceiling-notice]');
    expect(node, '断りの節が無い').not.toBeNull();
    // 文面は `shared/inputCeiling.ts` が 1 つ持つ —— ここで書き写さない。
    expect(node!.textContent).toContain(refusedCeilingNote('本文', 11, 10));
    // 実際の数字が入っていることも確かめる (関数を呼ぶだけの自己参照にしない)。
    expect(node!.textContent).toContain('10 字までです');
    expect(node!.textContent).toContain('いま 11 字あり、1 字超えています');
  });

  it('★ 欄の名前は呼び出し側が決める (画面の呼び方をそのまま出す)', async () => {
    await render({ label: '説明', value: 'x'.repeat(5), max: 3 });
    expect(container.textContent).toContain('説明は 3 字までです');
    /*
     * **ラベルは日本語で渡す。** 共有の文は `${label}は …` と続けるので、
     * 英語のラベルだと「Descriptionは」になる (最初の版はそれを書いていて、
     * この検査が実測で拾った)。画面の placeholder が英語の 2 つ
     * (GitHub の Body / Atlassian の Description) は、断りの中では
     * 「本文」「説明」と日本語で呼ぶ —— 節は欄の直下に出るので、どの欄かは読める。
     */
  });

  it('★ 前後の空白も数える (画面が持っている字数をそのまま言う)', async () => {
    // `charsOverCeiling` は trim しない —— 見えている字数と違う数を出さないため。
    await render({ label: '本文', value: '  ab  ', max: 5 });
    expect(container.textContent).toContain('いま 6 字あり、1 字超えています');
  });
});
