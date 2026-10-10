/** @vitest-environment jsdom */
/**
 * **この実行形態で、Google のカードが名乗る事は真か** (2026-09-25 · パス 457)。
 *
 * カードは Drive / Calendar / Gmail の **3 画面**が共有する。直す前の実測 (jsdom で実物を
 * 描き、実際に打って押す):
 *
 * | 見るもの | 直す前 (ブラウザ版) |
 * | --- | --- |
 * | 方法 A（推奨・恒久）の手順 3 段 | 出る |
 * | クライアント ID の欄 | 出る |
 * | Google でサインイン | 出る・打てば押せる |
 * | 押した結果 | **ブラウザ版では OAuth フローを実行しません** |
 * | localStorage | クライアント ID は**実際に保存される** |
 * | 末尾の主張 | **ライブ接続（実データ取得・送信）はデスクトップ版の機能で、…** |
 *
 * 2 つとも偽だった:
 *
 * 1. **送信はブラウザ版でも走る** —— `web-shim.ts` の invoke が 3 つの action を
 *    `runProxyBearer` → `saasWriteWeb` の writer へ振り分け、googleapis.com へ POST する
 *    (下の ★ が実物の writer で数える)。1 文が「この実行形態では何も外へ出ない」と
 *    読めるまま、同じ 3 画面に実際の書き込みフォームが在った。
 * 2. **方法 A はブラウザ版で走らない** —— しかも断りは Google Cloud Console で
 *    クライアント ID を作り 3 つの API を有効化した**後**に来る。
 *
 * ここは**振る舞いで**留める —— 綴りの走査は「文が在る」しか言わない。
 * 母集団 (どの action がブラウザ版から実際に送るか) は
 * `renderer/__tests__/browserSendClaimCensus.test.ts` が両方向で持つ。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as path from 'node:path';
import { GoogleConnectCard } from '../GoogleConnectCard';
import { createDriveFolder, createCalendarEvent, createGmailDraft } from '../../data/saasWriteWeb';
import {
  GOOGLE_BROWSER_SEND,
  googleLiveScopeNote,
  type GoogleServiceId,
} from '../../../shared/buildDestinations';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ID = '1234-abcd.apps.googleusercontent.com';
const CLIENT_ID_KEY = 'google-client-id';

/** ブラウザ版の橋 (`web-shim.ts` の実物と同じ答え)。 */
const BROWSER = {
  getVersion: (): Promise<string> => Promise.resolve('0.1.0-web'),
  oauthSupported: (): Promise<boolean> => Promise.resolve(false),
} as const;
/** デスクトップ版の橋。 */
const DESKTOP = {
  getVersion: (): Promise<string> => Promise.resolve('0.1.0'),
  oauthSupported: (): Promise<boolean> => Promise.resolve(true),
} as const;
/** **まだ分からない** —— `getVersion` が解決しない。 */
const UNKNOWN = {
  getVersion: (): Promise<string> => new Promise<string>(() => {}),
  oauthSupported: (): Promise<boolean> => Promise.resolve(false),
} as const;

let authorized: { id: string; clientId: string | undefined }[];
let container: HTMLDivElement;
let root: Root | null = null;

function stubHub(
  kind: typeof BROWSER | typeof DESKTOP | typeof UNKNOWN,
  authorizeOk = false,
): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    ...kind,
    authorize: (id: string, clientId?: string) => {
      authorized.push({ id, clientId });
      return Promise.resolve(
        authorizeOk
          ? { ok: true, data: {} }
          : { ok: false, code: 'not_supported', message: 'ブラウザ版では OAuth フローを実行しません' },
      );
    },
    openExternal: () => Promise.resolve(),
  };
}

/**
 * **待つのは条件で、回数ではない** —— `__tests__/jsdomWait.ts` の 1 組を通す
 * (固定回数の `settle()` は `renderer/__tests__/fixedTickAssertionCensus.test.ts` が
 * 数えている当の形で、実際にその門がこのファイルを捕まえた · パス 368 / 457)。
 *
 * `ready` はその `it` が**真に見たい物**を渡す。実行形態が分からない場合
 * (`UNKNOWN`) は待てる印が構造的に無い —— `buildKind` が永久に `null` なので
 * 実行形態に依る物は 1 つも現れない。そのときは**最初の描画で在る物**
 * (クライアント ID の欄) を待つ: 0 周で満たされるので回数に依らない。
 */
async function mount(serviceId: GoogleServiceId, ready: () => boolean, label: string): Promise<void> {
  root = createRoot(container);
  await act(async () => { root!.render(createElement(GoogleConnectCard, { serviceId })); });
  await settleUntil(ready, label);
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const field = (): HTMLInputElement | null =>
  container.querySelector<HTMLInputElement>('[aria-label="Google OAuth クライアント ID"]');
const signInButton = (): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Google でサインイン'));
const refusal = (): string | null => {
  const el = container.querySelector('[data-google-signin-unsupported]');
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};
const scopeNote = (): string | null => {
  const el = container.querySelector('[data-google-live-scope]');
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};

beforeEach(() => {
  authorized = [];
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  if (root !== null) await act(async () => { root!.unmount(); });
  root = null;
  container.remove();
  delete (globalThis as unknown as { serviceHub?: unknown }).serviceHub;
});

describe('Google のカード: 実行形態ごとの門 (パス 457)', () => {
  it('ブラウザ版では方法 A の欄もボタンも出さず、断りを出す (押す前に言う)', async () => {
    stubHub(BROWSER);
    await mount('drive', () => refusal() !== null, '実行形態の断り');
    expect(field()).toBeNull();
    expect(signInButton()).toBeUndefined();
    // Google Cloud Console の手順を出してから断るのでは遅い。
    expect(text()).not.toContain('方法 A（推奨・恒久）');
    const r = refusal();
    expect(r).not.toBeNull();
    expect(r).toContain('ブラウザ版はこのサインイン');
  });

  it('★ 断りは働く道を 2 つ名指しする (どちらも実在する)', async () => {
    stubHub(BROWSER);
    await mount('gmail', () => refusal() !== null, '実行形態の断り');
    const r = refusal() ?? '';
    // ① 同じカードの下に在る方法 B
    expect(r).toContain('方法 B');
    expect(text()).toContain('方法 B（即時・お試し）');
    // ② 設定ページの貼り付け式 (パス 454 が実行形態で門を置いた当の節)
    expect(r).toContain('設定ページの Google OAuth');
    const settings = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/pages/SettingsPage.tsx'));
    expect(settings).toContain("Section title=\"Google OAuth (Phase C)\"");
  });

  it('★ 逃げ口を閉じない —— 方法 B とトークンの案内はブラウザ版でも残る', async () => {
    stubHub(BROWSER);
    await mount('calendar', () => refusal() !== null, '実行形態の断り');
    const t = text();
    expect(t).toContain('OAuth 2.0 Playground を開く');
    expect(t).toContain('トークン設定');
  });

  it('デスクトップ版の答えは 1 つも変わらない (方法 A が出て、押せば authorize へ届く)', async () => {
    stubHub(DESKTOP, true);
    await mount('drive', () => scopeNote() !== null, '取得・送信の文');
    expect(refusal()).toBeNull();
    expect(text()).toContain('方法 A（推奨・恒久）');
    const input = await waitForElement(
      () => container.querySelector<HTMLInputElement>('[aria-label="Google OAuth クライアント ID"]'),
      'クライアント ID の欄',
    );
    // React の制御された欄は act の外で打つ (act で包むと state が動かない · パス 456 の自戒)
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, ID);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settleUntil(() => signInButton()?.disabled === false, 'サインインが押せる');
    await act(async () => { signInButton()!.click(); });
    // 押した結果を**画面の印**で待つ (回数ではなく条件)。
    await waitForText(text, 'サインインしました');
    expect(authorized).toEqual([{ id: 'drive', clientId: ID }]);
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBe(ID);
  });

  it('★ 分からないあいだ (null) は断らない —— 1 フレーム遅れるほうが害が小さい', async () => {
    stubHub(UNKNOWN);
    // 実行形態に依る印は構造的に現れない (`buildKind` が永久に `null`) ので、
    // **最初の描画で在る物**を待つ —— 0 周で満たされるので回数に依らない。
    await mount('drive', () => field() !== null, 'クライアント ID の欄');
    expect(refusal()).toBeNull();
    // 実行形態に依る文も、分かるまで出さない。
    expect(scopeNote()).toBeNull();
  });

  it('★ 取得と送信を向きごとに分けて言い、3 サービスそれぞれの作る物を名乗る', async () => {
    for (const id of Object.keys(GOOGLE_BROWSER_SEND) as GoogleServiceId[]) {
      const label = GOOGLE_BROWSER_SEND[id].label;
      for (const [hub, kind] of [[BROWSER, 'browser'], [DESKTOP, 'desktop']] as const) {
        stubHub(hub);
        await mount(id, () => scopeNote() !== null, `取得・送信の文 (${id} / ${kind})`);
        const note = scopeNote();
        expect(note, `${id} / ${kind}`).toBe(googleLiveScopeNote(kind, id));
        expect(note, `${id} / ${kind}`).toContain(label);
        if (kind === 'browser') {
          // 直す前の 1 文は「送信もデスクトップ版の機能」と読めた。
          expect(note).toContain('ブラウザ版でも実際に Google へ送信します');
        }
        await act(async () => { root!.unmount(); });
        root = null;
        container.innerHTML = '';
      }
    }
  });

  it('★ 背骨: ブラウザ版の 3 つの書き込みは本当に googleapis へ送る (だから上の文が要る)', async () => {
    const sent: { url: string; auth: string | null }[] = [];
    const transport = (url: string, init: RequestInit): Promise<Response> => {
      sent.push({ url, auth: new Headers(init.headers).get('authorization') });
      return Promise.resolve(new Response(
        JSON.stringify({ id: 'X1', name: 'n', webViewLink: 'https://drive.google.com/drive/folders/X1', htmlLink: 'https://calendar.google.com/x', summary: 's', message: { id: 'M1' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    };
    const TOK = 'ya29.LIVE';
    await createDriveFolder({ name: 'f' }, TOK, transport);
    await createCalendarEvent({ summary: 's', start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z' }, TOK, transport);
    await createGmailDraft({ to: 'a@example.com', subject: 's', body: 'b' }, TOK, transport);
    expect(sent).toHaveLength(3);
    for (const s of sent) {
      expect(s.url).toMatch(/^https:\/\/(www\.googleapis\.com|gmail\.googleapis\.com)\//);
      expect(s.auth).toBe(`Bearer ${TOK}`);
    }
  });

  it('★ 床: signIn は保存より前に断る (欄が消えても、別の入口が生えた日に効く)', () => {
    const src = readOriginalSource(path.join(REPO_ROOT, 'src/renderer/components/GoogleConnectCard.tsx'));
    const body = src.slice(src.indexOf('const signIn = async ()'), src.indexOf('return (\n    <Section'));
    expect(body).not.toBe('');
    const floor = body.indexOf('if (signInUnsupported !== null)');
    const write = body.indexOf('writeLocalString(');
    const call = body.indexOf('.authorize(');
    expect(floor, '床が無い').toBeGreaterThanOrEqual(0);
    expect(write, '保存が無い').toBeGreaterThan(floor);
    expect(call, 'authorize が無い').toBeGreaterThan(floor);
  });
});
