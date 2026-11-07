/** @vitest-environment jsdom */
/**
 * **背骨: 読み手のいない資格情報は、画面に入力欄が出ない** (2026-09-24 · パス 452)。
 *
 * ## なぜ要るか
 *
 * `scripts/lint-credential-use.cjs` は「`none` と宣言したサービスの画面が `tokenSetup` を
 * 渡していないか」を**綴りで**落とす。ところが `StatusBar` にはもう 1 枚、
 * **渡されても描かない**層が在る (`StatusBar.tsx:121` の
 * `collectsCredential(credentialUseOf(serviceId)) ? tokenSetup : undefined`)。
 * その層に検査は 1 つも無かった —— つまり**削除しても 18,900 件すべて緑**になる。
 *
 * 2026-09-24 に `shopify` を `action` → `none` へ直した (画面は「API トークン」を
 * 預かるのに、どの handler も `ctx.token` を読まなかった —— 7 つのコネクタは
 * `ctx.payload` から**連携先**の資格情報を取り出す)。その直しが持つ意味は
 * 「**宣言を直せば面も閉じる**」であり、それを保つのはこの層である。
 *
 * ## ここで見るもの
 *
 * - ★ `none` のサービスは、`tokenSetup` を渡しても**欄もボタンも出ない**
 *   (母集団は宣言から導く —— サービス名を書き写すと宣言を動かした日に古びる)。
 * - ★ 針が的に当たる標本: 読む側のサービスなら**出て、押すと欄が現れる**。
 * - ★ 実物の `ShopifyPage` を描いて、資格情報の欄が 1 つも無いこと
 *   (prop を外した層と、この層の**両方**を同時に通す)。
 * - ★ 既に保存した人の逃げ口 —— `unusedStoredCredentials` が拾う
 *   (法則 `escape-hatch-stays-open`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBar } from '../StatusBar';
import { SERVICES } from '../../services';
import { waitForElement } from '../../__tests__/jsdomWait';
import {
  SERVICE_CREDENTIAL_USE,
  credentialUseOf,
  unusedStoredCredentials,
} from '../../../shared/credentialUse';
import type { ServiceId } from '../../../shared/serviceId';

const SETUP = { label: 'テスト用の鍵', placeholder: 'k-…' } as const;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'not_configured', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'not_configured', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
    storageProtection: () =>
      Promise.resolve({ ok: true, data: { encrypted: true, plainCount: 0, mechanism: 'test' } }),
    checkUpdate: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    revealInFolder: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve({ ok: true }),
    eraseAll: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    authorize: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  stubHub();
  if (!Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, writable: true });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = null;
  }
  container.remove();
  vi.restoreAllMocks();
});

function buttonTexts(): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
}

const ids = Object.keys(SERVICE_CREDENTIAL_USE) as ServiceId[];
/** 母集団は宣言から導く (名前を書き写すと宣言を動かした日に古びる)。 */
const NONE = ids.filter((id) => credentialUseOf(id) === 'none');
const COLLECTS = ids.filter((id) => credentialUseOf(id) !== 'none');

describe('StatusBar: 読み手のいない資格情報は求めない', () => {
  it('母集団が両側とも空でない (走査が死んでいない)', () => {
    expect(NONE.length).toBeGreaterThanOrEqual(40);
    expect(COLLECTS.length).toBeGreaterThanOrEqual(15);
  });

  it('★ `none` のサービスは `tokenSetup` を渡しても欄もボタンも出ない', async () => {
    // 先頭の 6 件で足りる (この層は宣言 1 つだけを見るので、サービスごとの分岐は無い)。
    for (const id of NONE.slice(0, 6)) {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          createElement(StatusBar, { who: id, serviceId: id, tokenSetup: SETUP, isConfigured: false }),
        );
      });
      expect(buttonTexts(), `${id}: 鍵のボタンが出ている`).not.toContain(SETUP.label);
      expect(
        container.querySelector('input[type="password"]'),
        `${id}: 鍵の入力欄が出ている`,
      ).toBeNull();
      const r = root;
      await act(async () => r.unmount());
      root = null;
    }
  }, 20_000);

  it('★ 針が的に当たる —— 読む側のサービスなら出て、押すと欄が現れる', async () => {
    const id = COLLECTS[0]!;
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(StatusBar, { who: id, serviceId: id, tokenSetup: SETUP, isConfigured: false }),
      );
    });
    const open = await waitForElement<HTMLButtonElement>(
      () =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => b.textContent?.trim() === SETUP.label,
        ) ?? null,
      `${id}: 「${SETUP.label}」のボタン`,
    );
    // **錠は構造** —— 欄は押した後に現れる (ラベルはボタンの文字として先に在る)。
    await act(async () => open.click());
    const field = await waitForElement<HTMLInputElement>(
      () => container.querySelector<HTMLInputElement>('input[type="password"]'),
      `${id}: 開いた後に現れる鍵の入力欄`,
    );
    expect(field.placeholder).toBe(SETUP.placeholder);
  }, 20_000);
});

describe('shopify: 読まない資格情報を預からない (パス 452)', () => {
  it('★ 実物の画面に資格情報の欄が 1 つも無い', async () => {
    const def = SERVICES.find((s) => s.id === 'shopify');
    expect(def, 'shopify がサイドバーに無い').toBeDefined();
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(def!.page));
    });
    // 画面が届いた印 (行が出る前の姿を測らないための錠)。
    await waitForElement<HTMLElement>(
      () =>
        Array.from(container.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === '売上集計に記録',
        ) ?? null,
      'shopify: 「売上集計に記録」のボタン',
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(buttonTexts()).not.toContain('API トークン');
  }, 20_000);

  it('★ 既に保存した分は設定画面の掃除から消せる (逃げ口)', () => {
    expect(credentialUseOf('shopify')).toBe('none');
    expect(unusedStoredCredentials(['shopify'])).toEqual(['shopify']);
    // 針が的に当たる標本: 読み手の居るサービスは掃除の節に出ない。
    const reader = COLLECTS[0]!;
    expect(unusedStoredCredentials([reader])).toEqual([]);
  });
});
