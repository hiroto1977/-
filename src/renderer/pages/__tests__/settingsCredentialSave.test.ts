/** @vitest-environment jsdom */
/**
 * **資格情報の入口が 2 通りの規則を持っていた。**
 *
 * `shared/tokenInput.ts` の冒頭は、この規則を **main と renderer で同じにする**
 * ために在ると書いてある。実際に `checkTokenInput` を通しているのは
 *
 *   `main.ts` の `secrets:set`        (デスクトップ版)
 *   `web-shim.ts` の `setToken`       (ブラウザ版・`serviceHub` 経由)
 *
 * の 2 か所だけで、**設定画面の資格情報スロット 9 枚は保管庫を直接叩いていた**
 * (`getVault().setToken(slot.vaultKey, value)`)。ブラウザ版でこの 9 つを入力する
 * 口はここしかないので、規則はこの経路では効いていなかった:
 *
 *   `value.length === 0` だけを見る → 前後の空白を落とさない・
 *                                     改行や制御文字を断らない
 *
 * `vault.setToken` 側も型・空・`MAX_TOKEN_CHARS` しか見ない。
 *
 * ## 何が起きるか
 *
 * 制御文字の混ざった値は `Authorization: Bearer …` / `hibp-api-key: …` に載る。
 * `new Headers()` が「is an invalid header value」で投げ、**その文面に値が入って**
 * 画面へ出る (`shared/__tests__/headerValueLeak.test.ts` が実測)。同じ値を
 * `serviceHub.setToken` へ渡せば「改行や制御文字が含まれています」と
 * **理由つきで断られる** —— 隣の口が断る物を、この口は受け取っていた。
 *
 * ## 測って分かった境目 (最初の見立ては外れていた)
 *
 * 「折り返して貼った鍵の**改行**」で書き始めたが、**改行はこの欄を通らない** ——
 * HTML の値の消毒が `<input>` の値から CR / LF を要素の側で落とす。落とすのは
 * 改行だけなので、**NUL や垂直タブといった他の C0 制御文字は素通りする**。
 * 下の「前提」がその境目を実物で留める。断りが要る理由は変わらない
 * (むしろ「改行だけを断る」と書いていたら、この経路では何も守らない検査に
 *  なっていた)。
 *
 * ここでは ★ が断りを、対照が「正しい値は今までどおり保存される」ことを見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { checkTokenInput } from '../../../shared/tokenInput';
import { MAX_TOKEN_CHARS } from '../../security/vault';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LF = String.fromCharCode(10);

const vaultSet = vi.fn<(key: string, token: string) => Promise<void>>();
vi.mock('../../security/vault', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../security/vault')>();
  return {
    MAX_TOKEN_CHARS: real.MAX_TOKEN_CHARS,
    MIN_PASSWORD_LENGTH: real.MIN_PASSWORD_LENGTH,
    getVault: () => ({
      listConfigured: async () => [] as string[],
      clearToken: async () => {},
      setToken: (key: string, token: string) => vaultSet(key, token),
      getToken: async () => null,
      status: async () => 'unlocked',
    }),
  };
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(el: ReturnType<typeof createElement>): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(el);
  });
  await settle();
}

const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => el.click());
  await settle();
};

const button = (text: string): HTMLButtonElement => {
  const el = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes(text),
  );
  if (!el) throw new Error(`button ${text} missing`);
  return el;
};

/**
 * React が管理する `value` へ書く。`el.value = …` の直代入だと React の
 * 値追跡が「変わっていない」と見なして `onChange` を落とすことがあるので、
 * prototype の setter を通す (既定の書き方)。
 */
function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 実物の 9 枚から 1 枚 (HIBP / VirusTotal の 64 桁 16 進を預かるスロット)。 */
const SLOT = {
  vaultKey: 'security',
  emoji: '🛡️',
  label: 'セキュリティ API キー',
  description: 'HIBP / VirusTotal',
  placeholder: '…',
};

beforeEach(() => {
  vaultSet.mockReset();
  vaultSet.mockResolvedValue(undefined);
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    listConfigured: () => Promise.resolve([]),
  };
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

async function mountRow(): Promise<void> {
  const { CredentialRow } = await import('../SettingsPage');
  await mount(createElement(CredentialRow, { slot: SLOT, onChange: () => {} }));
  await click(button('設定する'));
}

const field = (): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>('input');
  if (!el) throw new Error('input missing');
  return el;
};

const errorText = (): string =>
  container.querySelector(`[data-credential-error="${SLOT.vaultKey}"]`)?.textContent ?? '';

describe('設定画面の資格情報スロット — 隣の口が断る値を受け取らない', () => {
  /*
   * **どのバイトがこの欄を通り抜けるか、まず測る。**
   *
   * 最初は「折り返して貼った鍵の**改行**」で書いていた。実測すると通らない ——
   * HTML の値の消毒 (value sanitization) が `<input>` の値から CR と LF を
   * **要素の側で**落とすので、React の状態には届かない。落とすのは改行だけで、
   * **他の C0 制御文字は素通りする**。下の 2 件がその境目を留める
   * (境目を書かずに「改行を断る」とだけ書くと、この経路では**どの入力でも
   * 通る空の検査**になる)。
   */
  it('前提: CR・LF は `<input>` 自身が落とし、NUL は通り抜ける', async () => {
    await mountRow();
    type(field(), `${'c'.repeat(4)}${LF}${'c'.repeat(4)}`);
    expect(field().value, '要素が改行を落としていない').toBe('c'.repeat(8));
    const nul = `${'c'.repeat(4)}${String.fromCharCode(0)}${'c'.repeat(4)}`;
    type(field(), nul);
    expect(field().value, '要素が NUL を落としている').toBe(nul);
  });

  it('★ 制御文字 (NUL) を含む値は保存せず、理由を出す', async () => {
    await mountRow();
    const secret = `${'c'.repeat(32)}${String.fromCharCode(0)}${'c'.repeat(32)}`;
    type(field(), secret);
    await click(button('保存'));

    expect(vaultSet, '保管庫へ書いてしまっている').not.toHaveBeenCalled();
    // 文面は `checkTokenInput` から採る (写経するとずれた日に誰も気付かない)
    const check = checkTokenInput(secret);
    expect(check.ok).toBe(false);
    expect(errorText()).toContain(check.ok ? '' : check.message);
  });

  it('★ 垂直タブ (\u000b) も同じく断る (改行だけの話ではない)', async () => {
    await mountRow();
    type(field(), `${'c'.repeat(32)}${String.fromCharCode(11)}x`);
    await click(button('保存'));
    expect(vaultSet).not.toHaveBeenCalled();
    expect(errorText()).toContain('制御文字');
  });

  /*
   * 長さの側は**既に閉じている** —— `CeilingNotice` が `MAX_TOKEN_CHARS`
   * (保管庫の 8,192 字) を超えた時点で「保存」を無効にする (パス 167 / 196)。
   * `checkTokenInput` の天井 (65,536 字) より保管庫の方が厳しいので、
   * 効いているのはこちらである。**足した断りがこの守りを外していないこと**を
   * 対照として留める (断りを入れる場所を間違えると、先に無効化されている
   * ボタンを押せるようにしてしまう)。
   */
  it('対照: 天井を超えた貼り付けは、これまでどおり「保存」が押せない', async () => {
    await mountRow();
    type(field(), 'c'.repeat(MAX_TOKEN_CHARS + 1));
    expect(button('保存').disabled).toBe(true);
    expect(vaultSet).not.toHaveBeenCalled();
  });

  it('★ 前後の空白は落として保存する (隣の口と同じ)', async () => {
    await mountRow();
    type(field(), `  ${'c'.repeat(64)}${LF}`);
    await click(button('保存'));
    expect(vaultSet).toHaveBeenCalledWith('security', 'c'.repeat(64));
  });

  it('対照: 正しい値はこれまでどおり保存され、理由は出ない', async () => {
    await mountRow();
    type(field(), 'c'.repeat(64));
    await click(button('保存'));
    expect(vaultSet).toHaveBeenCalledWith('security', 'c'.repeat(64));
    expect(errorText()).toBe('');
  });

  it('対照: 空欄はこれまでどおり「入力してください」', async () => {
    await mountRow();
    await click(button('保存'));
    expect(vaultSet).not.toHaveBeenCalled();
    expect(errorText().length).toBeGreaterThan(0);
  });
});
