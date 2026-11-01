/** @vitest-environment jsdom */
/**
 * **書き出しの後の 3 つの操作子が、この実行形態について正しいことを言うか**
 * (2026-09-25 · パス 458)。
 *
 * ## 直す前の実測 (jsdom で実物を描いて押す · `path = 'team-radar-….svg'`)
 *
 * | 操作子 | ブラウザ版の実測 |
 * | --- | --- |
 * | ファイルを開く | 断る (`data-os-op-error`) |
 * | 保存先フォルダを開く | 断る |
 * | **保存場所をコピー** | **`team-radar-….svg` を置き「✓ コピー済み」と言う** |
 *
 * ブラウザ版の書き出し action が返す `path` は**ファイル名だけ**
 * (`web-shim.ts` の 4 か所が `path: filename`)。デスクトップ版は絶対パスである。
 * ★ **同じ並びの 3 つのうち 1 つだけが静かに名前と違う事をしていた。**
 * ★ しかも**この実行形態で実際に開ける「ライブラリ」をどこも名指ししていなかった。**
 *
 * ## だからこの検査は 4 つを見る
 *
 * 1. 札は実行形態ごと (`exportCopyLabel`) —— **ブラウザ版は「ファイル名をコピー」**。
 * 2. **分からないあいだ (`null`) は今までの札のまま** (間違って名乗るより遅れて直す)。
 * 3. **デスクトップ版の答えは 1 文字も変わらない** —— 札も、置く物 (絶対パス) も。
 * 4. **操作子は消えない** (法則 `escape-hatch-stays-open`) —— ファイル名は
 *    「ライブラリ」でも端末のダウンロードでもその行を探す鍵である。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExportActions } from '../ExportActions';
import { exportCopyLabel } from '../../../shared/buildDestinations';
import { LIBRARY_HATCH_TEXT } from '../../data/exportOutcome';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BROWSER_PATH = 'team-radar-1758000000000.svg';
const DESKTOP_PATH = '/home/user/Documents/team-radar.svg';

let container: HTMLDivElement;
let root: Root;
let copied: string[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  copied = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
    configurable: true,
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/** 橋の代役。**`getVersion` を必ず持たせる** —— 持たせないと `isBrowserBuild()` の
 * `catch` がデスクトップ版へ倒し、「ブラウザ版を試した」と名乗りながら別の実行形態を
 * 押すことになる (パス 454 / 455 で 2 度直した形)。 */
function stubHub(kind: 'browser' | 'desktop' | 'unknown') {
  const refuse = () => Promise.resolve({
    ok: false,
    message: `ブラウザ版ではファイルを OS で開けません。${LIBRARY_HATCH_TEXT}`,
  });
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: kind === 'unknown'
      ? () => new Promise<string>(() => { /* 解決しない = まだ分からない */ })
      : () => Promise.resolve(kind === 'browser' ? '0.1.0-web' : '0.1.0'),
    openPath: kind === 'desktop' ? () => Promise.resolve({ ok: true }) : refuse,
    revealInFolder: kind === 'desktop' ? () => Promise.resolve({ ok: true }) : refuse,
    openExternal: () => {},
  };
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const copyBtn = () => container.querySelector('[data-export-copy]') as HTMLButtonElement | null;
const buttonTexts = () => [...container.querySelectorAll('button')].map((b) => b.textContent ?? '');

async function mount(
  kind: 'browser' | 'desktop' | 'unknown',
  props: { path: string; saved?: string },
  ready: () => boolean,
  label: string,
) {
  stubHub(kind);
  await act(async () => {
    root.render(createElement(ExportActions, { bytes: 4096, ...props }));
  });
  await settleUntil(ready, label);
}

describe('ExportActions — 実行形態ごとの札と働く道 (パス 458)', () => {
  it('★ ブラウザ版: 札は「ファイル名をコピー」で、置くのはファイル名', async () => {
    await mount(
      'browser',
      { path: BROWSER_PATH },
      () => copyBtn()?.textContent === exportCopyLabel('browser'),
      'ブラウザ版の札',
    );
    expect(copyBtn()?.textContent).toBe('ファイル名をコピー');
    expect(text()).not.toContain('保存場所をコピー');
    await act(async () => { copyBtn()!.click(); });
    // **置く物は変えていない** —— 変えるとファイル名すら手に入らなくなる。
    expect(copied).toEqual([BROWSER_PATH]);
    await settleUntil(() => copyBtn()?.textContent === '✓ コピー済み', 'コピー済みの札');
  });

  it('★ デスクトップ版の答えは 1 文字も変わらない', async () => {
    await mount(
      'desktop',
      { path: DESKTOP_PATH },
      () => copyBtn()?.textContent === exportCopyLabel('desktop'),
      'デスクトップ版の札',
    );
    expect(copyBtn()?.textContent).toBe('保存場所をコピー');
    await act(async () => { copyBtn()!.click(); });
    expect(copied).toEqual([DESKTOP_PATH]);
  });

  it('★ 分からないあいだ (null) は今までの札のまま', async () => {
    stubHub('unknown');
    await act(async () => {
      root.render(createElement(ExportActions, { path: BROWSER_PATH, bytes: 4096 }));
    });
    expect(copyBtn()?.textContent).toBe(exportCopyLabel('desktop'));
    expect(copyBtn()?.textContent).toBe('保存場所をコピー');
  });

  it('★ 逃げ口は閉じない —— 3 つの操作子はどの実行形態でも出る', async () => {
    for (const kind of ['browser', 'desktop', 'unknown'] as const) {
      await act(async () => { root.unmount(); });
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      stubHub(kind);
      await act(async () => {
        root.render(createElement(ExportActions, { path: BROWSER_PATH, bytes: 4096 }));
      });
      const labels = buttonTexts();
      expect(labels, kind).toContain('ファイルを開く');
      expect(labels, kind).toContain('保存先フォルダを開く');
      expect(copyBtn(), kind).not.toBeNull();
    }
  });

  it('★ ブラウザ版: 断りは「ライブラリ」の画面を名指しする (場所を断定しない)', async () => {
    await mount(
      'browser',
      { path: BROWSER_PATH },
      () => copyBtn()?.textContent === exportCopyLabel('browser'),
      'ブラウザ版の札',
    );
    const openBtn = [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'ファイルを開く') as HTMLButtonElement;
    await act(async () => { openBtn.click(); });
    const err = await waitForElement<HTMLElement>(
      () => container.querySelector<HTMLElement>('[data-os-op-error]'),
      'OS 操作の断り',
    );
    expect(err.textContent).toContain('「ライブラリ」の画面');
    expect(err.textContent).not.toContain('ダウンロードフォルダに保存されています');
  });

  it('★ 収まった先を名指しする 1 文を描く (呼び手が渡したときだけ)', async () => {
    await mount(
      'browser',
      { path: BROWSER_PATH, saved: LIBRARY_HATCH_TEXT },
      () => container.querySelector('[data-export-saved]') !== null,
      '収まった先の 1 文',
    );
    expect(container.querySelector('[data-export-saved]')?.textContent).toBe(LIBRARY_HATCH_TEXT);
    expect(text()).toContain('「ライブラリ」の画面');
  });

  it('渡されなければ描かない (デスクトップ版は欄が無いので undefined)', async () => {
    await mount(
      'desktop',
      { path: DESKTOP_PATH },
      () => copyBtn()?.textContent === exportCopyLabel('desktop'),
      'デスクトップ版の札',
    );
    expect(container.querySelector('[data-export-saved]')).toBeNull();
  });

  it('★ 札は shared の 1 つから出る (画面が綴りを持たない)', async () => {
    expect(exportCopyLabel('browser')).not.toBe(exportCopyLabel('desktop'));
    for (const kind of ['browser', 'desktop'] as const) {
      await act(async () => { root.unmount(); });
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      stubHub(kind);
      await act(async () => {
        root.render(createElement(ExportActions, { path: BROWSER_PATH, bytes: 4096 }));
      });
      await settleUntil(() => copyBtn()?.textContent === exportCopyLabel(kind), `${kind} の札`);
      expect(copyBtn()?.textContent, kind).toBe(exportCopyLabel(kind));
    }
  });
});
