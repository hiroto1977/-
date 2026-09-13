/** @vitest-environment jsdom */
/**
 * **資格情報の札が「読めなかった」を「未設定」に畳んでいた** (2026-09-12 · パス 159)。
 *
 * `CredentialRow` (API キーとトークンの節に 16 枚並ぶ) の `refresh()` は
 *
 * ```ts
 *   try { setConfigured(list.includes(slot.vaultKey)); }
 *   catch { setConfigured(false); }          // ← 「未設定」に畳む
 * ```
 *
 * だった。保管庫が施錠中・IndexedDB が容量超過・プライベートウィンドウで拒まれた
 * 端末では **16 枚すべてが「未設定」** になり、設定した本人に「設定する」を勧める。
 *
 * **同じファイルの中に規準が 3 つ在った** —— パス 86 / 87 が `ProxySection`・
 * `FsaSection`・「使われていない資格情報」の節で直した形 (「確認できません」+ 理由)。
 * この 1 枚だけが取り残されていた。
 *
 * ついでに測ったこと: 読みを断った保管庫は書きも断るので、そのときに
 * 「設定する」を出しても同じ所で失敗する。しかも**既に入っているかどうかが
 * 分からない状態で新しい値を書く**と、見えていない資格情報を黙って上書きしうる。
 * だから読めていない間は「やり直す」だけを出す (パス 155 の Google カードは
 * トークンの保管層が別だったので「サインインは止めない」が正しかった —— 状況が違う)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  _resetDeviceStoreFailureForTests,
  currentDeviceStoreFailure,
} from '../../data/deviceStoreFailure';

/**
 * 保管庫はモックする —— 読みの拒否を再現したいので、実物の IndexedDB では
 * 種類ごとの例外を作れない (`settingsCredentialDelete.test.ts` と同じ置き方)。
 */
let listConfigured: () => Promise<string[]>;
let setTokenCalls: { key: string; value: string }[];
vi.mock('../../security/vault', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../security/vault')>();
  return {
    // 天井は**本物を読み直す** (画面の `maxLength` がこれを読む —— パス 167)。
    MAX_TOKEN_CHARS: real.MAX_TOKEN_CHARS,
    MIN_PASSWORD_LENGTH: real.MIN_PASSWORD_LENGTH,
    getVault: () => ({
      listConfigured: () => listConfigured(),
      setToken: (key: string, value: string) => {
        setTokenCalls.push({ key, value });
        return Promise.resolve();
      },
      clearToken: () => Promise.resolve(),
      getToken: () => Promise.resolve(null),
      status: () => Promise.resolve('unlocked'),
    }),
  };
});

const { CredentialRow } = await import('../SettingsPage');

const SLOT = {
  vaultKey: 'github',
  label: 'GitHub',
  emoji: '🐙',
  description: 'Personal Access Token',
  placeholder: 'ghp_…',
} as const;

let container: HTMLDivElement;
let root: Root | null = null;
let changes: number;

function stubHub(): void {
  // 札は `openExternal` しか橋を使わない (保管庫はモック)。
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(CredentialRow, {
        slot: SLOT as unknown as Parameters<typeof CredentialRow>[0]['slot'],
        onChange: () => {
          changes += 1;
        },
      }),
    );
  });
  await settle();
}

function text(): string {
  return container.textContent ?? '';
}

/**
 * **「未設定」の札そのものを探す。** カード全体の文字列では見られない ——
 * 読めなかった理由の文 (`deviceStoreFailure` の `settings.read`) が
 * 「『未設定』と出ていても、設定が消えたとは限りません」と**引用している**ので、
 * `text()` には必ず「未設定」が含まれる。その文は 75 画面の StatusBar が今も
 * 「未設定」を出すので正しい (`useServiceData.ts` にその理由が書いてある)。
 * **不在を主張する検査は、見る範囲を間違えると永遠に通らない。** (最初に
 * `text()).not.toContain('未設定')` と書いて 2 本落とした。)
 */
function hasNotConfiguredBadge(): boolean {
  return Array.from(container.querySelectorAll('span')).some(
    (el) => (el.textContent ?? '').trim() === '未設定',
  );
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  _resetDeviceStoreFailureForTests();
  changes = 0;
  listConfigured = () => Promise.resolve<string[]>([]);
  setTokenCalls = [];
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
});

describe('資格情報の札 — 読める端末 (標本: 規則が空振りしていない)', () => {
  it('未設定なら「未設定」と「設定する」', async () => {
    await mount();
    expect(hasNotConfiguredBadge()).toBe(true);
    expect(button('設定する')).toBeDefined();
    expect(container.querySelector('[data-credential-unreadable]')).toBeNull();
  });

  it('設定済みなら「設定済み」と「変更」「削除」', async () => {
    listConfigured = () => Promise.resolve(['github']);
    await mount();
    expect(text()).toContain('設定済み');
    expect(button('変更')).toBeDefined();
    expect(button('削除')).toBeDefined();
  });
});

describe('資格情報の札 — 読めない端末 (パス 159)', () => {
  function failWith(name: string): void {
    listConfigured = () => Promise.reject(Object.assign(new Error('nope'), { name }));
  }

  it('★ 「未設定」と言わない —— 「確認できません」と理由を出す', async () => {
    failWith('QuotaExceededError');
    await mount();
    expect(container.querySelector('[data-credential-unreadable]')).not.toBeNull();
    // 札としての「未設定」は出ない (理由の文が引用するのは別の話)。
    expect(hasNotConfiguredBadge()).toBe(false);
    const why = container.querySelector('[data-credential-unreadable-reason]');
    expect(why).not.toBeNull();
    expect(why!.textContent).toContain('この端末に保存した設定を読めませんでした');
    expect(why!.textContent).toContain('保存領域が一杯です');
  });

  it('★ 「設定する」を勧めない (見えていない資格情報を上書きさせない)', async () => {
    failWith('SecurityError');
    await mount();
    expect(button('設定する')).toBeUndefined();
    expect(button('変更')).toBeUndefined();
    expect(button('削除')).toBeUndefined();
    expect(button('やり直す')).toBeDefined();
  });

  it('拒否の理由ごとに打ち手が変わる (プライベートモード)', async () => {
    failWith('SecurityError');
    await mount();
    const why = container.querySelector('[data-credential-unreadable-reason]');
    expect(why!.textContent).toContain('プライベートモード');
    expect(why!.textContent).toContain('通常のウィンドウで開き直してください');
  });

  it('★ 上端の帯の経路にも写る (札を見ていない利用者にも届く)', async () => {
    failWith('QuotaExceededError');
    await mount();
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('settings');
    expect(f?.op).toBe('read');
    // どの札で起きたかは診断のために残す (画面には出さない)。
    expect(f?.where).toBe('credential:github');
  });

  it('★ 対照: 「やり直す」で読めるようになれば、普通の札に戻る', async () => {
    failWith('QuotaExceededError');
    await mount();
    expect(button('やり直す')).toBeDefined();
    listConfigured = () => Promise.resolve(['github']);
    await click(button('やり直す')!);
    expect(container.querySelector('[data-credential-unreadable]')).toBeNull();
    expect(text()).toContain('設定済み');
    expect(button('削除')).toBeDefined();
  });

  it('★ 対照: 読めていた札が読めなくなると、逆向きにも動く', async () => {
    listConfigured = () => Promise.resolve(['github']);
    await mount();
    expect(text()).toContain('設定済み');
    // 保存が通ると `refresh()` が走る —— そこで読めなくなった場合。
    failWith('InvalidStateError');
    await click(button('変更')!);
    const input = container.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, 'ghp_newtoken');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    await click(button('保存')!);
    // 保存自体は通ったので onChange は呼ばれる。
    expect(changes).toBe(1);
    // だが読み直せなかったので「設定済み」とは言い切らない。
    expect(container.querySelector('[data-credential-unreadable]')).not.toBeNull();
    expect(hasNotConfiguredBadge()).toBe(false);
    expect(text()).not.toContain('設定済み');
  });
});
