/** @vitest-environment jsdom */
/**
 * ExportActions コンポーネントのレンダー回帰・props 分岐テスト。
 *
 * renderToStaticMarkup で同期 SSR し、
 * - ファイル名表示（basename 変換）
 * - bytes 有無による KB 表示
 * - openUrl / openLabel 有無による外部リンクボタン
 * を検証する。
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportActions } from '../ExportActions';

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openPath: () => Promise.resolve(),
    revealInFolder: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
  };
  // navigator.clipboard のスタブ (jsdom では未定義の場合がある)。
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.resolve() },
    configurable: true,
  });
});

describe('ExportActions — renders without crashing', () => {
  it('POSIX パスで描画できる', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        createElement(ExportActions, { path: '/home/user/export/report.csv' }),
      );
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });

  it('Windows パスで描画できる', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        createElement(ExportActions, { path: 'C:\\Users\\user\\report.csv' }),
      );
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });
});

describe('ExportActions — basename 表示', () => {
  it('POSIX パスのファイル名のみ表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/home/user/exports/data-2024-01-01.csv' }),
    );
    expect(html).toContain('data-2024-01-01.csv');
    expect(html).not.toContain('/home/user/exports/');
  });

  it('Windows パスのファイル名のみ表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: 'C:\\Documents\\report.xlsx' }),
    );
    expect(html).toContain('report.xlsx');
    expect(html).not.toContain('C:\\Documents\\');
  });

  it('スラッシュなしのファイル名をそのまま表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: 'report.csv' }),
    );
    expect(html).toContain('report.csv');
  });
});

describe('ExportActions — bytes 表示', () => {
  it('bytes 指定時に KB 表示を含む', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv', bytes: 51200 }),
    );
    // 51200 bytes ÷ 1024 = 50 KB
    expect(html).toContain('50');
    expect(html).toContain('KB');
  });

  it('bytes が 1 未満でも最低 1 KB を表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv', bytes: 100 }),
    );
    expect(html).toContain('1');
    expect(html).toContain('KB');
  });

  it('bytes 未指定時は KB 表示なし', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv' }),
    );
    expect(html).not.toContain('KB');
  });
});

describe('ExportActions — 常時表示ボタン', () => {
  it('"ファイルを開く" ボタンを常に表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv' }),
    );
    expect(html).toContain('ファイルを開く');
  });

  it('"保存先フォルダを開く" ボタンを常に表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv' }),
    );
    expect(html).toContain('保存先フォルダを開く');
  });

  it('"保存場所をコピー" ボタンを常に表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv' }),
    );
    expect(html).toContain('保存場所をコピー');
  });

  it('"✓ 保存しました:" を常に表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, { path: '/tmp/out.csv' }),
    );
    expect(html).toContain('保存しました');
  });
});

describe('ExportActions — openUrl / openLabel ボタン', () => {
  it('openUrl + openLabel 指定時に外部リンクボタンを表示', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, {
        path: '/tmp/out.csv',
        openUrl: 'https://www.canva.com',
        openLabel: 'Canva を開く',
      }),
    );
    expect(html).toContain('Canva を開く');
  });

  it('openUrl のみ (openLabel 未指定) の場合は外部リンクボタンを表示しない', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, {
        path: '/tmp/out.csv',
        openUrl: 'https://www.canva.com',
      }),
    );
    // openLabel が undefined なのでボタンを描画しない。
    expect(html).not.toContain('Canva');
  });

  it('openLabel のみ (openUrl 未指定) の場合は外部リンクボタンを表示しない', () => {
    const html = renderToStaticMarkup(
      createElement(ExportActions, {
        path: '/tmp/out.csv',
        openLabel: 'Canva を開く',
      }),
    );
    // openUrl が undefined なのでボタンを描画しない。
    expect(html).not.toContain('Canva');
  });
});
