/** @vitest-environment jsdom */
/**
 * **開いた窓の焦点の道 —— 純関数の側** (2026-10-07 · パス 506)。
 *
 * `initialFocusTarget` (開いたとき最初に置く焦点) と `restoreTarget` (閉じたとき戻す先) を、
 * 標本の DOM で見る。部品の中での振る舞い (開いたら入力欄へ・Esc で閉じて 🤖 へ戻る) は
 * `conciergeDialogFocus.test.ts` が実物の部品を描いて見る。
 */
import { describe, expect, it } from 'vitest';
import { DIALOG_INITIAL_MARK, FOCUSABLE_SELECTOR, initialFocusTarget, restoreTarget } from '../useDialogFocus';

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
});
