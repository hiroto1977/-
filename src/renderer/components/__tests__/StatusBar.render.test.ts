/** @vitest-environment jsdom */
/**
 * StatusBar / Section コンポーネントのレンダー回帰・props 分岐テスト。
 *
 * renderToStaticMarkup で同期 SSR し、バッジテキスト / エラー表示 /
 * tokenSetup の有無 / avatarUrl の有無などの props 分岐を検証する。
 * useEffect / 非同期ハンドラは SSR では走らないため window.serviceHub への
 * 副作用アクセスは発生しない。
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBar, Section } from '../StatusBar';

beforeAll(() => {
  // renderToStaticMarkup では useEffect は動かないが、型整合のために最小スタブを設定。
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
  };
});

describe('StatusBar — badge テキスト', () => {
  it('status=loading のとき "読込中…" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService', status: 'loading' }),
    );
    expect(html).toContain('読込中…');
  });

  it('source=live, status=idle のとき "ライブ" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService', source: 'live', status: 'idle' }),
    );
    expect(html).toContain('ライブ');
  });

  it('source=snapshot (デフォルト) のとき "スナップショット" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService' }),
    );
    expect(html).toContain('スナップショット');
  });

  it('status=error, errorKind=auth のとき "認証エラー" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService', status: 'error', errorKind: 'auth' }),
    );
    expect(html).toContain('認証エラー');
  });

  it('status=error, errorKind=rate_limit のとき "レート制限" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService', status: 'error', errorKind: 'rate_limit' }),
    );
    expect(html).toContain('レート制限');
  });

  it('status=error, errorKind=unknown のとき汎用 "エラー" バッジを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService', status: 'error', errorKind: 'unknown' }),
    );
    expect(html).toContain('エラー');
  });
});

describe('StatusBar — who / avatarUrl', () => {
  it('who テキストをレンダー', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'GitHub Pages' }),
    );
    expect(html).toContain('GitHub Pages');
  });

  it('avatarUrl 指定時は img タグを出力', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'user',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('https://example.com/avatar.png');
  });

  it('avatarUrl 未指定時は img タグを出力しない', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'user' }),
    );
    expect(html).not.toContain('<img');
  });
});

describe('StatusBar — errorMessage', () => {
  it('errorMessage があれば表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        status: 'error',
        errorMessage: 'HTTP 500 サーバーエラー',
      }),
    );
    expect(html).toContain('HTTP 500 サーバーエラー');
  });

  it('errorMessage がなければエラー span を出力しない', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService' }),
    );
    // status-bar 自体は出るが、エラーメッセージ専用 span は不在。
    expect(html).not.toContain('var(--danger)');
  });
});

describe('StatusBar — tokenSetup ボタンラベル', () => {
  it('tokenSetup 指定 + isConfigured=false → tokenSetup.label ボタンを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        serviceId: 'github',
        tokenSetup: { label: 'トークン設定', placeholder: 'PAT' },
        isConfigured: false,
      }),
    );
    expect(html).toContain('トークン設定');
  });

  it('tokenSetup 指定 + isConfigured=true → "トークン更新" ボタンを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        serviceId: 'github',
        tokenSetup: { label: 'トークン設定' },
        isConfigured: true,
      }),
    );
    expect(html).toContain('トークン更新');
  });

  it('tokenSetup 未指定 → トークン設定ボタンを出力しない', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService' }),
    );
    expect(html).not.toContain('トークン設定');
    expect(html).not.toContain('トークン更新');
  });
});

describe('StatusBar — 更新ボタン', () => {
  it('onRefresh 指定時に "更新" ボタンを表示', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        onRefresh: () => {},
      }),
    );
    expect(html).toContain('更新');
  });

  it('onRefresh 未指定時は "更新" ボタンを表示しない', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService' }),
    );
    // "更新" という文字自体はバッジに無いため安全に確認できる。
    expect(html).not.toContain('>更新<');
  });

  it('status=loading のとき "更新中…" テキストになる', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        status: 'loading',
        onRefresh: () => {},
      }),
    );
    expect(html).toContain('更新中…');
  });
});

describe('StatusBar — right スロット', () => {
  it('right prop に渡したノードをレンダー', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'TestService',
        right: createElement('span', { id: 'extra' }, '追加コンテンツ'),
      }),
    );
    expect(html).toContain('追加コンテンツ');
    expect(html).toContain('id="extra"');
  });
});

describe('Section コンポーネント', () => {
  it('タイトルをレンダー', () => {
    const html = renderToStaticMarkup(
      createElement(Section, { title: 'テストセクション', children: createElement('span', null, 'child') }),
    );
    expect(html).toContain('テストセクション');
  });

  it('count が数値のとき "N 件" を表示', () => {
    const html = renderToStaticMarkup(
      createElement(Section, { title: 'S', count: 42, children: createElement('span', null, 'c') }),
    );
    expect(html).toContain('42 件');
  });

  it('count が undefined のとき件数を表示しない', () => {
    const html = renderToStaticMarkup(
      createElement(Section, { title: 'S', children: createElement('span', null, 'c') }),
    );
    expect(html).not.toMatch(/\d+ 件/);
  });

  it('children をレンダー', () => {
    const html = renderToStaticMarkup(
      createElement(Section, { title: 'S', children: createElement('p', null, 'チルドレン') }),
    );
    expect(html).toContain('チルドレン');
  });

  it('action prop に渡したノードをレンダー', () => {
    const html = renderToStaticMarkup(
      createElement(Section, {
        title: 'S',
        action: createElement('button', null, 'アクションボタン'),
        children: createElement('span', null, 'c'),
      }),
    );
    expect(html).toContain('アクションボタン');
  });
});
