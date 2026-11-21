/** @vitest-environment jsdom */
/**
 * 書面だけを印刷する入口 — 印刷中だけ `body.ds-printing` が付き、終わったら外れる。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printDocument } from '../printDocument';

afterEach(() => {
  document.body.classList.remove('ds-printing');
});

describe('printDocument', () => {
  it('印刷を呼ぶ瞬間は印が付いていて、afterprint で外れる', () => {
    let markedWhilePrinting: boolean | null = null;
    const print = vi.fn(() => {
      markedWhilePrinting = document.body.classList.contains('ds-printing');
    });
    const win = {
      print,
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    printDocument(document, win);
    expect(print).toHaveBeenCalledTimes(1);
    expect(markedWhilePrinting).toBe(true);
    expect(document.body.classList.contains('ds-printing')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('ds-printing')).toBe(false);
  });
  it('afterprint の聞き手は 1 回で外れる (2 回目の印刷で 2 重に残らない)', () => {
    const removeEventListener = vi.fn(window.removeEventListener.bind(window));
    const win = {
      print: vi.fn(),
      addEventListener: window.addEventListener.bind(window),
      removeEventListener,
    } as unknown as Window;
    printDocument(document, win);
    window.dispatchEvent(new Event('afterprint'));
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener.mock.calls[0]?.[0]).toBe('afterprint');
    // 2 回目の afterprint では何も起きない (聞き手は既に外れている)
    document.body.classList.add('ds-printing');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('ds-printing')).toBe(true);
  });
  it('既定の引数は document / window', () => {
    const original = window.print;
    const print = vi.fn();
    (window as unknown as { print: () => void }).print = print;
    try {
      printDocument();
      expect(print).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event('afterprint'));
      expect(document.body.classList.contains('ds-printing')).toBe(false);
    } finally {
      (window as unknown as { print: () => void }).print = original;
    }
  });
});
