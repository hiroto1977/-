/** @vitest-environment jsdom */
/**
 * **Google OAuth の節を実際に押す** (2026-09-12 · パス 157)。
 *
 * `SettingsPage` の 2026-09-12 計測で、この節 (1607-1777 行) は**行カバレッジ 0%** ——
 * `start` も `complete` も一度も走ったことがなかった。押す前に読んで見つけた欠陥は
 * 2 つで、どちらも「画面の指示に従うと必ず失敗する」形である:
 *
 *  1. 説明文と placeholder は「認可後に表示される **code**」を求めるが、
 *     `parseGoogleCallback` は `code` と `state` の**両方**を要求する。
 *     しかも既定のリダイレクト URI (`urn:ietf:wg:oauth:2.0:oob`) は
 *     **構造上 state を持ち帰れない** —— 既定値のままではどうやっても完了できない。
 *  2. 生成した認可 URL は `authUrl` に入るが**画面には出ない** (段の切り替えにしか
 *     使っていない)。`openExternal` の失敗は main が記録だけ残して解決するので
 *     レンダラーに届かず、ブラウザが開かない端末では認可ページへ行く手が
 *     1 つも残らなかった。
 *
 * 直した形をここで押す。判定と文面は `oauth/callbackPaste.ts` に 1 組だけ置く。
 *
 * ## 待ちは回数ではなく条件で (2026-09-12 · パス 169)
 *
 * この節の 2 段目は **`crypto.subtle.digest` の後**に現れる (PKCE の
 * `code_challenge` = SHA-256)。最初の版は固定 8 周の `settle()` の後で欄を
 * `find(…)!` で掴んでおり、**全件実行 (15,244 件) でこの 1 本だけ落ちた** ——
 * 単独では通る。負荷の下で digest が 8 周に間に合わず、`undefined` が
 * `type` へ渡って `'set value' called on an object that is not a valid instance of
 * HTMLInputElement` で死んでいた (待ちとは無関係な言い方)。
 *
 * 対照で再現した: `digest` を 30 周ぶん遅くすると 13 件中 9 件が落ちる。
 * いまは `waitForElement` / `settleUntil` (`__tests__/jsdomWait.ts`) で
 * **条件を待ち**、間に合わなければ何を待っていたかを言って落ちる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GoogleOAuthSection } from '../SettingsPage';
import { LOOPBACK_REDIRECT_URI, OOB_REDIRECT_URI } from '../../oauth/callbackPaste';
import { readPkceSession } from '../../oauth/pkceSession';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

let opened: string[];
let container: HTMLDivElement;
let root: Root | null = null;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
  };
}

/**
 * 段の描き直しを進める。**これは「待ち」ではない** —— 回数を当てているだけなので、
 * `crypto.subtle` の後に現れる物は `waitForElement` / `settleUntil` で待つ
 * (パス 169。理由はファイル冒頭)。
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GoogleOAuthSection));
  });
  await settle();
}

function inputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
}

/**
 * 実際の入力として流す。**素の代入では React に届かない** (node ごとに `value` を
 * 上書きして最後の値を覚えているため)。
 *
 * 欄が未だ無いときは**ここで名前を言って落ちる** —— 以前は `undefined` が
 * そのまま `setter.call` に渡り、待ちとは無関係な言い方で死んでいた (パス 169)。
 */
async function type(el: HTMLInputElement | null | undefined, value: string): Promise<void> {
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`入力欄が無い状態で type を呼んでいる (待ちが足りない可能性)。値: ${JSON.stringify(value)}`);
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

/**
 * 2 段目の貼り付け欄。**`crypto.subtle.digest` の後に現れる**ので待つ
 * (固定回数の settle では負荷の下で間に合わない —— パス 169)。
 */
function pasteField(): Promise<HTMLInputElement> {
  return waitForElement(
    () => inputs().find((i) => i.placeholder.includes('state=')) ?? null,
    '貼り付け欄 (placeholder に state= を含む)',
  );
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').includes(label),
  );
  if (!b) throw new Error(`ボタンが見つからない: ${label}`);
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** クライアント ID を入れて「認可ページを開く」まで進める。 */
/** 押した後に出るはずの物 (待つ条件と、時間切れのときに言う名前)。 */
interface Expected {
  readonly ready: () => boolean;
  readonly label: string;
}

/** 既定: 進んで 2 段目が出る。 */
const PASTE_STAGE: Expected = {
  ready: () => inputs().some((i) => i.placeholder.includes('state=')),
  label: '2 段目の貼り付け欄',
};

/**
 * 1 段目を埋めて「認可ページを開く」を押し、**押した後に出るはずの物**を待つ。
 *
 * 何を待つかは呼び手が言う —— 進む場合と断る場合で出る物が違い、
 * 「どれか 1 つ」の union で当てると**どれも出ないときに待ちの意味が消える**
 * (union にした最初の版は、保存を拒む端末の 1 本で時間切れになった)。
 */
async function startFlow(
  redirect = LOOPBACK_REDIRECT_URI,
  after: Expected = PASTE_STAGE,
): Promise<void> {
  const [clientId, redirectField] = inputs();
  await type(clientId, 'abc.apps.googleusercontent.com');
  if (redirect !== LOOPBACK_REDIRECT_URI) await type(redirectField, redirect);
  await click(button('認可ページを開く'));
  // **`crypto.subtle.digest` の後**に段が変わるので、回数ではなく条件で待つ (パス 169)。
  await settleUntil(after.ready, `${after.label} が出る`);
}

function text(): string {
  return container.textContent ?? '';
}

beforeEach(() => {
  opened = [];
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
  vi.unstubAllGlobals();
  // **spy も戻す。** `crypto.subtle.digest` を投げさせる検査が在るので、
  // 戻さないと次の検査まで壊れたままになる (残したまま 3 件落とした)。
  vi.restoreAllMocks();
});

describe('Google OAuth の節 (カバレッジ 0% だった側 · パス 157)', () => {
  it('★ 既定のリダイレクト URI は http(s) —— 帯は出ない (標本: 規則が空振りしていない)', async () => {
    await mount();
    expect(inputs()[1]!.value).toBe(LOOPBACK_REDIRECT_URI);
    expect(container.querySelector('[data-redirect-unusable]')).toBeNull();
  });

  it('★ 以前の既定値 (OOB) を入れると、押す前に理由が出る', async () => {
    await mount();
    await type(inputs()[1], OOB_REDIRECT_URI);
    const band = container.querySelector('[data-redirect-unusable]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('完了できません');
    expect(band!.textContent).toContain('state');
  });

  it('★ OOB のまま押しても認可ページを開かない (往復させてから断らない)', async () => {
    await mount();
    await startFlow(OOB_REDIRECT_URI, {
      ready: () => container.querySelector('[data-redirect-unusable]') !== null,
      label: 'リダイレクト URI が使えない理由の帯',
    });
    expect(opened).toEqual([]);
    // 秘密も作らない (消す物を増やさない)。
    expect(readPkceSession()).toBeNull();
    expect(text()).toContain('完了できません');
  });

  it('クライアント ID が空なら押しても何も起きない', async () => {
    await mount();
    await click(button('認可ページを開く'));
    expect(opened).toEqual([]);
    expect(text()).toContain('Client ID を入力してください');
  });

  it('★ 認可 URL は画面に出る (ブラウザが開かなかった端末の唯一の手)', async () => {
    await mount();
    await startFlow();
    expect(opened).toHaveLength(1);
    const shown = container.querySelector('[data-google-auth-url]');
    expect(shown).not.toBeNull();
    // **画面に出る URL と、OS へ渡した URL は同じ物。**
    expect(shown!.textContent).toBe(opened[0]);
    expect(shown!.textContent).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(shown!.textContent).toContain('code_challenge_method=S256');
    expect(shown!.textContent).toContain(`redirect_uri=${encodeURIComponent(LOOPBACK_REDIRECT_URI)}`);
  });

  it('★ 2 段目の指示は URL 全体を求める (「code」だけを求めない)', async () => {
    await mount();
    await startFlow();
    expect(text()).toContain('アドレスバー');
    expect(text()).toContain('code だけでは完了できません');
    // 待って在ることを確かめる (無ければ waitForElement が名前を言って落ちる)。
    expect((await pasteField()).placeholder).toContain('state=');
  });

  it('★ 生の認可コードを貼ると、「それでは完了できない」と名指しで出る', async () => {
    await mount();
    await startFlow();
    const paste = await pasteField();
    await type(paste, '4/0AbCdEfGhIjKlMn');
    await click(button('token を取得して保存'));
    expect(text()).toContain('認可コードだけ');
    expect(text()).toContain('URL 全体');
  });

  it('code だけの URL を貼ると、欠けているのが state だと言う', async () => {
    await mount();
    await startFlow();
    const paste = await pasteField();
    await type(paste, 'http://localhost/?code=4%2F0Ab');
    await click(button('token を取得して保存'));
    expect(text()).toContain('state がありません');
    expect(text()).toContain('CSRF');
  });

  it('空欄で押すと、求める物 (URL 全体) を言う', async () => {
    await mount();
    await startFlow();
    await click(button('token を取得して保存'));
    expect(text()).toContain('URL 全体');
  });

  it('★ state が違う URL は CSRF として断る (交換へ進まない)', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    await mount();
    await startFlow();
    const paste = await pasteField();
    await type(paste, 'http://localhost/?code=4%2F0Ab&state=not-the-one');
    await click(button('token を取得して保存'));
    expect(text()).toContain('state が一致しません');
    // **token エンドポイントへは行かない。**
    expect(fetchSpy).not.toHaveBeenCalled();
    // 一時秘密は成否によらず捨てる (verifier は単回使用)。
    expect(readPkceSession()).toBeNull();
  });

  it('★ 交換が失敗しても「交換中…」で固まらず、理由が出て秘密は消える', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    await mount();
    await startFlow();
    const saved = readPkceSession();
    expect(saved).not.toBeNull();
    const paste = await pasteField();
    await type(paste, `http://localhost/?code=4%2F0Ab&state=${encodeURIComponent(saved!.state)}`);
    await click(button('token を取得して保存'));
    // ボタンは押せる状態に戻っている (`finally` の setBusy(false) が飛んでいない)。
    expect(button('token を取得して保存').disabled).toBe(false);
    expect(text()).toContain('invalid_grant');
    expect(readPkceSession()).toBeNull();
  });

  it('★ キャンセルは 1 段目に戻し、一時秘密を 4 つまとめて消す', async () => {
    await mount();
    await startFlow();
    expect(readPkceSession()).not.toBeNull();
    await click(button('キャンセル'));
    expect(readPkceSession()).toBeNull();
    // 1 段目に戻っている (認可 URL の表示は消え、「認可ページを開く」が在る)。
    expect(container.querySelector('[data-google-auth-url]')).toBeNull();
    expect(() => button('認可ページを開く')).not.toThrow();
  });

  /**
   * `crypto.subtle` が**無い**端末 (平文の http:// で配った形)。
   * `getRandomValues` は残す —— `generatePkce` はそれを先に呼ぶので、
   * 無くすと「どちらで落ちたか」が分からなくなる。
   */
  function withoutSubtle(): void {
    const real = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues: real });
  }

  it('★ 暗号が無い端末で押しても、黙って終わらない (パス 169)', async () => {
    /*
     * **これが直す前の実物の姿である。** `await generatePkce()` が素のままだったので、
     * `crypto.subtle` が無い端末では拒否が宙に浮き、押しても文が 1 つも増えなかった
     * (2026-09-12 実測: 1 段目のまま・openExternal 0 回・readPkceSession() は null)。
     */
    await mount();
    await type(inputs()[0], 'abc.apps.googleusercontent.com');
    withoutSubtle();
    await click(button('認可ページを開く'));
    await settleUntil(() => text().includes('WebCrypto'), '暗号が使えないという理由が出る');
    // 開かない・秘密も作らない・URL も出さない (半端に進まない)。
    expect(opened).toEqual([]);
    expect(readPkceSession()).toBeNull();
    expect(container.querySelector('[data-google-auth-url]')).toBeNull();
  });

  it('★ その文は内部 API の名前ではなく、打てる手を言う', async () => {
    await mount();
    await type(inputs()[0], 'abc.apps.googleusercontent.com');
    withoutSubtle();
    await click(button('認可ページを開く'));
    await settleUntil(() => text().includes('WebCrypto'), '理由が出る');
    const shown = text();
    for (const hint of ['https://', 'localhost', 'standalone.html']) {
      expect(shown, `打てる手 ${hint} が出ていない`).toContain(hint);
    }
    // 素の TypeError の文面を前に出さない。
    expect(shown).not.toContain('Cannot read properties');
  });

  it('★ 暗号は在るのに失敗したときは、元の文を残す (調べる手がかり)', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('operation not supported'));
    await mount();
    await type(inputs()[0], 'abc.apps.googleusercontent.com');
    await click(button('認可ページを開く'));
    await settleUntil(() => text().includes('暗号処理に失敗'), '失敗の理由が出る');
    expect(text()).toContain('operation not supported');
    expect(opened).toEqual([]);
    expect(readPkceSession()).toBeNull();
  });

  it('★ 保存できない端末では、認可ページを開く前に理由を出して止まる', async () => {
    // `savePkceSession` が投げる形 (プライベートウィンドウ・Web Storage 拒否)。
    const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const original = proto.setItem;
    (proto as unknown as Record<string, unknown>).setItem = () => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    };
    try {
      await mount();
      await startFlow(LOOPBACK_REDIRECT_URI, {
        ready: () => /SecurityError|保存/.test(text()),
        label: '保存できないという理由',
      });
      // 開かない (開いてから「保存できませんでした」と言うと、認可が無駄になる)。
      expect(opened).toEqual([]);
      expect(container.querySelector('[data-google-auth-url]')).toBeNull();
      expect(text()).toMatch(/SecurityError|保存/);
    } finally {
      (proto as unknown as Record<string, unknown>).setItem = original;
    }
  });
});
