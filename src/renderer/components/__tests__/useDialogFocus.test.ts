/** @vitest-environment jsdom */
/**
 * **開いた窓の焦点の道 —— 純関数と hook の守り** (2026-10-07 · パス 506)。
 *
 * `initialFocusTarget` (開いたとき最初に置く焦点) と `restoreTarget` (閉じたとき戻す先) を、
 * 標本の DOM で見る。部品の中での振る舞い (開いたら入力欄へ・Esc で閉じて 🤖 へ戻る) は
 * `conciergeDialogFocus.test.ts` が実物の部品を描いて見る。
 *
 * ★ 変異検査 (`audit:mutate-changed`・2026-10-07) の 1 度目は **90.00% / 生存 6** で、生存は 3 家系とも
 * 「宣言した契約に標本が無い」だった: ① `aria-disabled="true"` を無効と読む (4 件 —— `disabled` の標本しか
 * 無く、しかも `FOCUSABLE_SELECTOR` は `disabled` を先に外すので、中の判定には `aria-disabled` しか届かない)
 * ② 操作子の無い窓を開いても投げない (`?.focus()`) ③ `returnTo` を省いた呼び手 (今日の 4 つの呼び手は
 * 全部渡している —— 契約の標本)。② ③ は小さな部品を描いて hook の効果そのものに当てる。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  DIALOG_INITIAL_MARK,
  FOCUSABLE_SELECTOR,
  initialFocusTarget,
  restoreTarget,
  useDialogFocus,
} from '../useDialogFocus';

function box(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('useDialogFocus —— 最初に置く焦点 (initialFocusTarget)', () => {
  it('★ 印 (data-dialog-initial) を持つ操作子が在ればそれ —— 先に在る別の操作子より優先する', () => {
    const root = box(`<button id="a">実行</button><button id="b" ${DIALOG_INITIAL_MARK}>やめる</button>`);
    expect(initialFocusTarget(root)?.id).toBe('b');
    root.remove();
  });

  it('印が無ければ最初の操作子 (無効化された物は飛ばす)', () => {
    const root = box(`<p>文</p><button id="x" disabled>無効</button><a id="y" href="#">リンク</a><input id="z">`);
    expect(initialFocusTarget(root)?.id).toBe('y');
    root.remove();
  });

  it('印を持つ物が無効化されていれば、印を飛ばして最初の操作子', () => {
    const root = box(`<button id="a">A</button><button id="b" ${DIALOG_INITIAL_MARK} disabled>B</button>`);
    expect(initialFocusTarget(root)?.id).toBe('a');
    root.remove();
  });

  it('★ `aria-disabled="true"` は無効 —— 印を持つ物なら印を飛ばし、最初の操作子なら次へ (`disabled` を持たないので選択子は外さない)', () => {
    const marked = box(`<button id="a">A</button><button id="b" ${DIALOG_INITIAL_MARK} aria-disabled="true">B</button>`);
    expect(initialFocusTarget(marked)?.id).toBe('a');
    marked.remove();
    const first = box(`<button id="a" aria-disabled="true">A</button><button id="b">B</button>`);
    expect(initialFocusTarget(first)?.id).toBe('b');
    first.remove();
  });

  it('対照: `aria-disabled="false"` と `aria-disabled` の無い物は有効 (無効と読むのは "true" だけ)', () => {
    const root = box(`<button id="a" aria-disabled="false">A</button><button id="b" ${DIALOG_INITIAL_MARK} aria-disabled="false">B</button>`);
    expect(initialFocusTarget(root)?.id).toBe('b');
    root.remove();
  });

  it('操作子が 1 つも無ければ null (tabindex=-1 は操作子ではない)・root が無くても null', () => {
    const root = box(`<p>文だけ</p><div tabindex="-1">x</div>`);
    expect(initialFocusTarget(root)).toBeNull();
    expect(initialFocusTarget(null)).toBeNull();
    root.remove();
  });

  it('標本: 操作子の選択子は button / a[href] / input / select / textarea / summary / tabindex を拾い、hidden と tabindex=-1 を拾わない', () => {
    const root = box(
      `<button></button><a href="#"></a><input><select></select><textarea></textarea><summary></summary><div tabindex="0"></div>` +
        `<input type="hidden"><a>無い</a><div tabindex="-1"></div>`,
    );
    expect(root.querySelectorAll(FOCUSABLE_SELECTOR).length).toBe(7);
    root.remove();
  });
});

describe('useDialogFocus —— 戻す先 (restoreTarget)', () => {
  it('★ 名指しの先が文書に在ればそれ (開いた時の焦点より優先)', () => {
    const root = box(`<button id="fab">🤖</button><button id="other">別</button>`);
    const fab = root.querySelector<HTMLElement>('#fab')!;
    const other = root.querySelector<HTMLElement>('#other')!;
    expect(restoreTarget(fab, other)).toBe(fab);
    root.remove();
  });

  it('名指しの先が文書から外れていれば、開いた時に焦点を持っていた物へ', () => {
    const root = box(`<button id="other">別</button>`);
    const gone = document.createElement('button');
    const other = root.querySelector<HTMLElement>('#other')!;
    expect(restoreTarget(gone, other)).toBe(other);
    root.remove();
  });

  it('どちらも無ければ null —— body へは戻さない (body は「戻し先が無い」の印)', () => {
    expect(restoreTarget(null, document.body)).toBeNull();
    expect(restoreTarget(null, null)).toBeNull();
    const gone = document.createElement('button');
    expect(restoreTarget(gone, gone)).toBeNull();
  });

  it('無効化された物へは戻さない (焦点を取れない)', () => {
    const root = box(`<button id="fab" disabled>🤖</button><button id="other">別</button>`);
    const fab = root.querySelector<HTMLElement>('#fab')!;
    const other = root.querySelector<HTMLElement>('#other')!;
    expect(restoreTarget(fab, other)).toBe(other);
    root.remove();
  });

  it('★ `aria-disabled="true"` の物へも戻さない (名指しの先でも、開いた時の物でも)', () => {
    const root = box(`<button id="fab" aria-disabled="true">🤖</button><button id="other">別</button>`);
    const fab = root.querySelector<HTMLElement>('#fab')!;
    const other = root.querySelector<HTMLElement>('#other')!;
    expect(restoreTarget(fab, other)).toBe(other);
    expect(restoreTarget(null, fab)).toBeNull();
    root.remove();
  });
});

/*
 * hook の効果そのもの —— 小さな部品を描いて、開く / 閉じるを state で動かす。
 * 本物の部品 (`conciergeDialogFocus.test.ts`) では届かない 2 つの守りを当てる:
 * 操作子の無い窓 (`initialFocusTarget` が null) と、`returnTo` を省いた呼び手。
 */
interface HarnessProps {
  readonly open: boolean;
  readonly body: 'empty' | 'input';
  readonly named: boolean;
}

function Harness({ open, body, named }: HarnessProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const keys = useDialogFocus(ref, named ? { open, onClose: () => undefined, returnTo: openerRef } : { open, onClose: () => undefined });
  return createElement(
    'div',
    null,
    createElement('button', { ref: openerRef, id: 'opener' }, '開く'),
    createElement('button', { id: 'other' }, '別'),
    open
      ? createElement(
          'div',
          { ref, role: 'dialog', 'aria-label': '窓', onKeyDown: keys.onKeyDown },
          body === 'input' ? createElement('input', { id: 'field', 'aria-label': '欄' }) : '文だけ',
        )
      : null,
  );
}

describe('useDialogFocus —— hook の効果 (小さな部品を描く)', () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let container: HTMLDivElement;
  let root: Root | null = null;
  const show = (props: HarnessProps): void => {
    act(() => {
      root!.render(createElement(Harness, props));
    });
  };
  const mount = (props: HarnessProps): void => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    show(props);
  };
  const byId = (id: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(`#${id}`);
    if (el === null) throw new Error(`#${id} が無い`);
    return el;
  };
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('★ 操作子の無い窓を開いても投げず、焦点は動かない (`initialFocusTarget` が null でも `?.focus()`)', () => {
    mount({ open: false, body: 'empty', named: true });
    byId('other').focus();
    expect(document.activeElement).toBe(byId('other'));
    expect(() => show({ open: true, body: 'empty', named: true })).not.toThrow();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(byId('other'));
  });

  it('★ `returnTo` を省いた呼び手でも、閉じたら開いた時に焦点を持っていた物へ戻る', () => {
    mount({ open: false, body: 'input', named: false });
    byId('opener').focus();
    show({ open: true, body: 'input', named: false });
    expect(document.activeElement).toBe(byId('field'));
    show({ open: false, body: 'input', named: false });
    expect(document.activeElement).toBe(byId('opener'));
  });

  it('対照: 名指し (`returnTo`) が在れば、開いた時の焦点が別の物でも名指しの先へ戻る', () => {
    mount({ open: false, body: 'input', named: true });
    byId('other').focus();
    show({ open: true, body: 'input', named: true });
    expect(document.activeElement).toBe(byId('field'));
    show({ open: false, body: 'input', named: true });
    expect(document.activeElement).toBe(byId('opener'));
  });
});
