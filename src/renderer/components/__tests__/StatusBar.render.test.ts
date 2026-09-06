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
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
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

  it('source=snapshot (デフォルト) のとき "サンプル（未連携）" バッジを表示', () => {
    // serviceId を渡さない呼び出しは origin='remote' 扱い。未取得の remote は
    // 「スナップショット」ではなく未連携と言い切る — 前者だと実データを写した
    // ものと読め、同梱の架空データが実在と受け取られる。
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'TestService' }),
    );
    expect(html).toContain('サンプル（未連携）');
    expect(html).not.toContain('スナップショット');
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

/**
 * 2026-07 セキュリティ監査（多層防御）: avatarUrl は第三者 API 由来。
 * `safeImageSrc`（DataList.tsx）で許可スキームに限定してから src に渡す。
 */
describe('StatusBar — avatarUrl のスキーム検証', () => {
  it('javascript: の avatarUrl では img も src 属性も出力しない', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'user', avatarUrl: 'javascript:alert(1)' }),
    );
    expect(html).not.toContain('<img');
    // 空の src="" はページ自身を再取得してしまうため、属性ごと出さない。
    expect(html).not.toContain('src=');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('user'); // status-bar 本体は通常どおり描画される
  });

  it('data:image/* の avatarUrl は描画する', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'user', avatarUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it('data:text/html や file: の avatarUrl は描画しない', () => {
    for (const avatarUrl of ['data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
      const html = renderToStaticMarkup(createElement(StatusBar, { who: 'user', avatarUrl }));
      expect(html).not.toContain('<img');
    }
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

describe('StatusBar — 読み手のいない資格情報は求めない', () => {
  /**
   * 2026-08 監査の回帰。asana / discord / dropbox / line / linear / salesforce /
   * sentry / stripe は fetcher もアクションも token を読まないのに、トークン
   * 入力欄を出して暗号化保存していた。呼び出し元 8 ページからは `tokenSetup` を
   * 外したが、**この層でも塞ぐ**（新しいページが同じ形で足されても効くように）。
   */
  const setup = { label: 'API トークン', placeholder: 'Bearer token' } as const;

  it("credentialUse が 'none' のサービスでは tokenSetup を無視する", () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'Dropbox', serviceId: 'dropbox', tokenSetup: setup }),
    );
    expect(html).not.toContain('API トークン');
    expect(html).not.toContain('トークン設定');
    expect(html).not.toContain('type="password"');
  });

  it("credentialUse が 'fetch' のサービスでは今までどおり出す", () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'GitHub', serviceId: 'github', tokenSetup: setup }),
    );
    expect(html).toContain('API トークン');
  });

  it("credentialUse が 'action' のサービスでも出す", () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: 'Security', serviceId: 'security', tokenSetup: setup }),
    );
    expect(html).toContain('API トークン');
  });

  it('serviceId が無い呼び出し元では出さない (保存も削除もできないため)', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, { who: '汎用パネル', tokenSetup: setup }),
    );
    expect(html).not.toContain('API トークン');
  });

  it("'none' のサービスでも認証エラーの再入力へ落ちない", () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        who: 'Stripe',
        serviceId: 'stripe',
        tokenSetup: setup,
        status: 'error',
        errorKind: 'auth',
      }),
    );
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('再認証');
  });
});

/*
 * **バッジが 1 枠しか無いせいで、いちばん要るときに取得元が消えていた。**
 *
 * `status === 'error'` のときバッジは「認証エラー」等になり、
 * 「サンプル（未連携）」が押し出される。ところが画面の下には
 * `SNAPSHOT[id]` の同梱データがそのまま並んでいる —— トークンを保存して
 * 「更新」を押し 401 が返った人には、**数字の入ったダッシュボードと
 * `401 Bad credentials` の 1 行だけ**が見える (2026-09-06 実測)。
 *
 * 取得元の宣言はエラーのときこそ要るので、別枠 (`data-stale-note`) で出す。
 */
describe('StatusBar — エラーのときも数字の出どころを言う', () => {
  const render = (props: Record<string, unknown>): string =>
    renderToStaticMarkup(createElement(StatusBar, { who: 'TestService', ...props } as never));

  it('★ snapshot + エラー: 同梱のサンプルだと言う (バッジは「認証エラー」のまま)', () => {
    const html = render({ status: 'error', errorKind: 'auth', errorMessage: '401 Bad credentials' });
    expect(html).toContain('認証エラー'); // バッジは従来どおり (e2e が字面で見ている)
    expect(html).toContain('data-stale-note');
    expect(html).toContain('表示中の数字は同梱のサンプルです（まだあなたのデータではありません）');
  });

  it('★ live + エラー: 前回取得した内容だと言う (実データだが今回の更新は入っていない)', () => {
    const html = render({ source: 'live', status: 'error', errorMessage: 'fetch failed' });
    expect(html).toContain('表示中の数字は前回取得できた内容です（今回の更新は反映されていません）');
    expect(html).not.toContain('同梱のサンプル');
  });

  it('★ レート制限でも出す (エラーの種別で消えない)', () => {
    const html = render({ status: 'error', errorKind: 'rate_limit' });
    expect(html).toContain('レート制限');
    expect(html).toContain('data-stale-note');
  });

  it('対照: 正常時は出さない (バッジ自身が取得元を言っている)', () => {
    expect(render({ status: 'idle' })).not.toContain('data-stale-note');
    expect(render({ source: 'live', status: 'idle' })).not.toContain('data-stale-note');
  });

  it('対照: 読込中は出さない (すぐ決まるので急かさない)', () => {
    expect(render({ status: 'loading' })).not.toContain('data-stale-note');
  });

  it('★ 取得しない画面には出さない (同梱データの注記と二重にならない)', () => {
    // `origin='sample'` の画面は `data-sample-note` が常に同梱データだと書いている。
    const html = render({ serviceId: 'sample', status: 'error' });
    expect(html).toContain('data-sample-note');
    expect(html).not.toContain('data-stale-note');
  });
});
