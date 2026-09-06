/** @vitest-environment jsdom */
/**
 * **報せが画面に出る所を、実際に描いて留める。**
 *
 * 経路 (`recordStoreFailure.ts`) と入口 (`useCollection`) は別の検査で留めた。
 * 残るのは**画面に出るか**で、ここが抜けると「経路は動いているが誰も出さない」
 * ——2026-08-25 の「鍵を保存できるのにボタンは永久に押せない」と同じ、
 * 配線されていない部品になる。
 *
 * 出す条件は 3 つだけ: 何も無ければ何も描かない / 届いたら `role="alert"` で
 * 文面を出す / 閉じたら消える。閉じた後に次の失敗が来たらまた出る。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RecordStoreFailureBanner } from '../RecordStoreFailureBanner';
import {
  _resetRecordStoreFailureForTests,
  clearRecordStoreFailure,
  currentRecordStoreFailure,
  reportRecordStoreFailure,
} from '../../data/recordStoreFailure';

let container: HTMLDivElement;
let root: Root | null = null;

function quota(): Error {
  const e = new Error('full');
  e.name = 'QuotaExceededError';
  return e;
}

beforeEach(() => {
  _resetRecordStoreFailureForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
  _resetRecordStoreFailureForTests();
});

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(RecordStoreFailureBanner));
  });
}

async function report(op: 'read' | 'save' | 'delete'): Promise<void> {
  await act(async () => {
    reportRecordStoreFailure(op, 'sales-entries', quota());
  });
}

const banner = (): HTMLElement | null => container.querySelector('[data-record-store-failure]');

describe('RecordStoreFailureBanner', () => {
  it('★ 何も断られていなければ何も描かない', async () => {
    await mount();
    expect(banner()).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('★ 届いたら role="alert" で文面と操作の別を出す', async () => {
    await mount();
    await report('save');
    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('alert');
    expect(el?.getAttribute('data-record-store-failure')).toBe('save');
    expect(el?.textContent).toContain('この端末に保存できませんでした');
    expect(el?.textContent).toContain('ライブラリの不要なファイルを削除');
  });

  it('★ 読めなかった報せも同じ枠で出る (空の理由を画面が言える)', async () => {
    await mount();
    await report('read');
    expect(banner()?.getAttribute('data-record-store-failure')).toBe('read');
    expect(banner()?.textContent).toContain('記録が消えたとは限りません');
  });

  it('★ 閉じると消え、次に断られるとまた出る', async () => {
    await mount();
    await report('save');
    const close = [...container.querySelectorAll('button')].find((b) => b.textContent === '閉じる');
    expect(close, '閉じるボタンが無い').toBeTruthy();
    await act(async () => {
      close!.click();
    });
    expect(banner()).toBeNull();
    expect(currentRecordStoreFailure()).toBeNull();

    await report('delete');
    expect(banner()?.getAttribute('data-record-store-failure')).toBe('delete');
  });

  it('★ 描く前に届いた 1 件も出す (最初の読み込みで断られる場合)', async () => {
    reportRecordStoreFailure('read', 'sales-entries', quota());
    await mount();
    expect(banner()?.textContent).toContain('読めませんでした');
  });

  it('外した後に届いても投げない (購読を解除している)', async () => {
    await mount();
    await act(async () => {
      root!.unmount();
    });
    root = null;
    expect(() => reportRecordStoreFailure('save', 'a', quota())).not.toThrow();
  });

  it('対照: 経路を閉じたまま描いても枠は出ない (data 属性で拾っている)', async () => {
    clearRecordStoreFailure();
    await mount();
    expect(banner()).toBeNull();
  });
});
