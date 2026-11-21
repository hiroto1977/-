/** @vitest-environment jsdom */
/**
 * ExportActions — OS 操作 (開く / フォルダで表示) の失敗が画面に出ること。
 *
 * 2026-08 監査前は `catch {}` で握り潰し、`app:openPath` 自体も
 * `shell.openPath` のエラー文字列を捨てていたため、**書き出した書類が開けなくても
 * 画面には何も出なかった** (押しても無反応に見える)。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExportActions } from '../ExportActions';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(hub: Record<string, unknown>) {
  (window as unknown as { serviceHub: unknown }).serviceHub = hub;
  act(() => {
    root.render(createElement(ExportActions, { path: '/tmp/exports/決算書.svg', bytes: 2048 }));
  });
}
function clickByText(text: string) {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  expect(btn, text).not.toBeUndefined();
  return btn as HTMLButtonElement;
}
const failure = () => container.querySelector('[data-os-op-error]')?.textContent ?? null;

describe('ExportActions — OS 操作の失敗', () => {
  it('開けなかった理由を出す', async () => {
    render({
      openPath: () => Promise.resolve({ ok: false, message: '関連付けられたアプリがありません' }),
      revealInFolder: () => Promise.resolve({ ok: true }),
    });
    await act(async () => {
      clickByText('ファイルを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toContain('関連付けられたアプリがありません');
  });

  it('成功したら理由は出ない', async () => {
    render({
      openPath: () => Promise.resolve({ ok: true }),
      revealInFolder: () => Promise.resolve({ ok: true }),
    });
    await act(async () => {
      clickByText('ファイルを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toBeNull();
  });

  it('reject でも理由を出す (握り潰さない)', async () => {
    render({
      openPath: () => Promise.reject(new Error('ipc channel closed')),
      revealInFolder: () => Promise.resolve({ ok: true }),
    });
    await act(async () => {
      clickByText('ファイルを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toContain('ipc channel closed');
  });

  it('保存先フォルダを開く の失敗も出す', async () => {
    render({
      openPath: () => Promise.resolve({ ok: true }),
      revealInFolder: () => Promise.resolve({ ok: false, message: '書き出し先の外にあります' }),
    });
    await act(async () => {
      clickByText('保存先フォルダを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toContain('書き出し先の外');
  });

  it('やり直しで前の理由が消える', async () => {
    let fail = true;
    render({
      openPath: () => Promise.resolve(fail ? { ok: false, message: 'まだ開けません' } : { ok: true }),
      revealInFolder: () => Promise.resolve({ ok: true }),
    });
    await act(async () => {
      clickByText('ファイルを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toContain('まだ開けません');
    fail = false;
    await act(async () => {
      clickByText('ファイルを開く').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failure()).toBeNull();
  });
});
