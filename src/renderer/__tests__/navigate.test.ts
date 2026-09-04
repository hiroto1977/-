/** @vitest-environment jsdom */
/**
 * 画面遷移の入口 — イベントと「遷移先で最初にすること (intent)」。
 * intent は 1 件だけ預かり、宛先の画面が受け取ると消える。指示なしの遷移は古い指示を捨てる。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetNavigationIntentForTests, navigateTo, onNavigate, takeNavigationIntent } from '../navigate';

afterEach(() => {
  _resetNavigationIntentForTests();
});

describe('navigateTo / onNavigate', () => {
  it('遷移要求は serviceId をそのまま届け、購読解除後は届かない', () => {
    const seen: string[] = [];
    const off = onNavigate((id) => seen.push(id));
    navigateTo('docstudio');
    navigateTo('overview', { action: 'bank-sheet' });
    expect(seen).toEqual(['docstudio', 'overview']);
    off();
    navigateTo('cpa');
    expect(seen).toEqual(['docstudio', 'overview']);
  });
  it('detail が文字列でないイベントは無視する', () => {
    const handler = vi.fn();
    const off = onNavigate(handler);
    window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 42 }));
    expect(handler).not.toHaveBeenCalled();
    off();
  });
});

describe('遷移先で最初にすること (intent)', () => {
  it('宛先の画面だけが受け取り、受け取ると消える', () => {
    navigateTo('docstudio', { doc: 'kessan', action: 'import-overview' });
    expect(takeNavigationIntent('overview')).toBeNull();
    expect(takeNavigationIntent('docstudio')).toEqual({ doc: 'kessan', action: 'import-overview' });
    expect(takeNavigationIntent('docstudio')).toBeNull();
  });
  it('別の画面宛ての問い合わせでは消えない (先に別の画面が mount しても指示は残る)', () => {
    navigateTo('docstudio', { doc: 'shikin-guri' });
    expect(takeNavigationIntent('overview')).toBeNull();
    expect(takeNavigationIntent('docstudio')).toEqual({ doc: 'shikin-guri' });
  });
  it('指示なしの遷移は預かっている指示を捨てる (古い指示が後で発火しない)', () => {
    navigateTo('docstudio', { doc: 'kessan' });
    navigateTo('overview');
    expect(takeNavigationIntent('docstudio')).toBeNull();
  });
  it('新しい指示は前の指示を置き換える', () => {
    navigateTo('docstudio', { doc: 'kessan' });
    navigateTo('overview', { action: 'bank-sheet' });
    expect(takeNavigationIntent('docstudio')).toBeNull();
    expect(takeNavigationIntent('overview')).toEqual({ action: 'bank-sheet' });
  });
  it('何も預かっていなければ null', () => {
    expect(takeNavigationIntent('docstudio')).toBeNull();
  });
  it('検査用の reset は預かっている指示を捨てる', () => {
    navigateTo('docstudio', { doc: 'kessan' });
    _resetNavigationIntentForTests();
    expect(takeNavigationIntent('docstudio')).toBeNull();
  });
});
