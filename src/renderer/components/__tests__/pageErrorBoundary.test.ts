/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageErrorBoundary, describeRenderError } from '../PageErrorBoundary';

/*
 * 画面 1 つの描画エラーを、その画面の枠に閉じ込める (2026-09-05)。
 * 境界が無いと React はツリー全体を外す —— 保存値や API 応答の形違いで 1 回投げれば、
 * サイドバーごと白くなって再読込するしか無かった。鳴る標本 (投げる子 → 文面と 2 つのボタン) と
 * 通る対照 (普通の子はそのまま) を留める。
 */
let container: HTMLDivElement;
let root: Root | null = null;
let consoleError: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  // React は境界が受けた例外も console.error に流す (開発時の親切)。検査の出力を汚さないだけ。
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
  consoleError?.mockRestore();
});

async function mount(node: ReactNode): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, 'button missing').toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function Boom(props: { readonly message?: string }): never {
  throw new Error(props.message ?? '保存された値の形が違います');
}

describe('describeRenderError', () => {
  it('Error の message を 1 行に畳み、長ければ切り、Error でない物や空は「原因不明のエラー」', () => {
    expect(describeRenderError(new Error('a\n  b   c'))).toBe('a b c');
    expect(describeRenderError('文字列で投げた')).toBe('文字列で投げた');
    expect(describeRenderError(undefined)).toBe('原因不明のエラー');
    expect(describeRenderError(new Error(''))).toBe('原因不明のエラー');
    const long = describeRenderError(new Error('x'.repeat(500)));
    expect(long.length).toBe(161);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('PageErrorBoundary', () => {
  it('★ 標本: 子が投げると、その枠だけが文面 (画面名 + message) と「もう一度開く」「ホームへ戻る」になる', async () => {
    const onGoHome = vi.fn();
    await mount(createElement(PageErrorBoundary, { label: '株価', onGoHome }, createElement(Boom)));
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.getAttribute('data-page-error')).toBe('株価');
    expect(alert?.textContent).toContain('「株価」の画面で問題が起きました');
    expect(alert?.textContent).toContain('保存された値の形が違います');
    expect(alert?.textContent).not.toContain('at Boom'); // スタックは出さない
    await click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ホームへ戻る'));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('「もう一度開く」で子を描き直す (直っていれば普通に出る)', async () => {
    // React 18 は描画で投げた子を**一度は描き直してから**境界に倒す (回復可能なエラーの扱い)。
    // 「1 回だけ投げる」子では境界に届かないので、旗が立っている間は投げ続ける子にする。
    let failing = true;
    function Flaky(): ReactNode {
      if (failing) throw new Error('直るまで落ちる');
      return createElement('div', { 'data-ok': '1' }, '復帰した');
    }
    await mount(createElement(PageErrorBoundary, { label: '書類スタジオ' }, createElement(Flaky)));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['もう一度開く']); // onGoHome 無し
    failing = false;
    await click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'もう一度開く'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-ok]')?.textContent).toBe('復帰した');
  });

  it('対照: 投げない子はそのまま出て、alert は無い', async () => {
    await mount(createElement(PageErrorBoundary, { label: 'ホーム' }, createElement('p', { 'data-ok': '1' }, '普通の画面')));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-ok]')?.textContent).toBe('普通の画面');
  });
});
