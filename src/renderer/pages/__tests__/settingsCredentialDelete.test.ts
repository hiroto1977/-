/** @vitest-environment jsdom */
/**
 * **削除の失敗を黙らない。** 「消したつもりの資格情報が残っている」を画面に出す。
 *
 * main の `secrets:clear` は 2026-08 の監査からこの理由で `{ ok: false }` を返す
 * 設計で、注記にも「削除の失敗を黙ると『消したつもりの資格情報が残っている』
 * 状態になる」と書いてある。ところが設定画面の 2 か所がそれを捨てていた
 * (2026-09-06 実測):
 *
 *   `UnusedCredentialSection.forget`  戻り値を見ず、再読込するだけ
 *                                     → 行が残るのに理由が出ない。
 *                                       **預かりを減らす節が減らせていないことを黙る。**
 *   `CredentialRow.clear`             `catch` が無く、保管庫の施錠は
 *                                     unhandled rejection → 画面は無反応
 *
 * どちらも「押したのに何も起きない」に見える。ここでは失敗の文面が出ること、
 * そして**成功したときは出ないこと** (対照) を見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICE_IDS, type ServiceId } from '../../../shared/serviceId';
import { unusedStoredCredentials } from '../../../shared/credentialUse';

/** 保管庫はモックする (施錠を再現するため)。 */
const vaultClear = vi.fn<(key: string) => Promise<void>>();
vi.mock('../../security/vault', () => ({
  getVault: () => ({
    listConfigured: async () => ['anthropic'],
    clearToken: (key: string) => vaultClear(key),
    setToken: async () => {},
    getToken: async () => null,
    status: async () => 'unlocked',
  }),
}));

/** 台帳から「どの経路でも読まれない資格情報」を 1 つ取る (id を写さない)。 */
const UNUSED: ServiceId = unusedStoredCredentials([...SERVICE_IDS])[0]!;

type ClearResult = { ok: true } | { ok: false; message: string };
let clearResult: ClearResult = { ok: true };
let configured: ServiceId[] = [UNUSED];
/** 一覧そのものが読めない端末 (保管ファイルが大きすぎる / 壊れている)。 */
let listRejection: Error | null = null;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    listConfigured: () => (listRejection === null ? Promise.resolve(configured) : Promise.reject(listRejection)),
    clearToken: (_id: string) => {
      if (clearResult.ok) configured = [];
      return Promise.resolve(clearResult);
    },
  };
}

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

beforeEach(() => {
  clearResult = { ok: true };
  configured = [UNUSED];
  listRejection = null;
  vaultClear.mockReset();
  vaultClear.mockResolvedValue(undefined);
  stubHub();
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

describe('使われていない資格情報 — 数えられなかったら「0 件」と言わない', () => {
  /*
   * **この節は「0 件」に意味がある。** 預かりを減らすための節なので、一覧が
   * 読めなかっただけで空にすると「減らす物は無い」と読めてしまう
   * (実測 2026-09-06: `catch { setIds([]); }` で節ごと消えていた)。
   */
  it('★ 一覧が読めなければ、節を消さずに理由を出す', async () => {
    const { UnusedCredentialSection } = await import('../SettingsPage');
    listRejection = new Error('保管ファイルを読めませんでした (too large)。');
    await mount(createElement(UnusedCredentialSection, { refreshKey: 0 }));
    const alert = container.querySelector('[data-unused-unreadable]');
    expect(alert, '節ごと消えている').not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('この端末に保存した設定を読めませんでした');
    expect(alert?.textContent).toContain('「未設定」と出ていても、設定が消えたとは限りません');
  });

  it('対照: 読めるときは理由を出さず、これまでどおり件数を出す', async () => {
    const { UnusedCredentialSection } = await import('../SettingsPage');
    await mount(createElement(UnusedCredentialSection, { refreshKey: 0 }));
    expect(container.querySelector('[data-unused-unreadable]')).toBeNull();
    expect(container.textContent).toContain('使われていない資格情報 1 件');
  });
});

describe('使われていない資格情報 — 削除できなかったら言う', () => {
  it('★ 削除が {ok:false} なら理由を出し、行は残る', async () => {
    const { UnusedCredentialSection } = await import('../SettingsPage');
    clearResult = { ok: false, message: 'EACCES: permission denied' };
    await mount(createElement(UnusedCredentialSection, { refreshKey: 0 }));
    expect(container.querySelector(`[data-unused-credential="${UNUSED}"]`)).not.toBeNull();

    await click(button('削除'));

    const alert = container.querySelector('[data-forget-error]');
    expect(alert?.textContent).toContain('削除できませんでした');
    expect(alert?.textContent).toContain('EACCES: permission denied');
    expect(alert?.textContent).toContain('預かりは減っていません');
    // 行は残ったまま (消えたように見せない)
    expect(container.querySelector(`[data-unused-credential="${UNUSED}"]`)).not.toBeNull();
  });

  it('★ 削除が投げても同じ扱い (画面が無反応にならない)', async () => {
    const { UnusedCredentialSection } = await import('../SettingsPage');
    (globalThis as unknown as { serviceHub: { clearToken: () => Promise<never> } }).serviceHub = {
      listConfigured: () => Promise.resolve([UNUSED]),
      clearToken: () => Promise.reject(new Error('bridge gone')),
    } as unknown as { clearToken: () => Promise<never> };
    await mount(createElement(UnusedCredentialSection, { refreshKey: 0 }));

    await click(button('削除'));

    expect(container.querySelector('[data-forget-error]')?.textContent).toContain('bridge gone');
  });

  it('対照: 削除できたら理由は出ず、行も消える', async () => {
    const { UnusedCredentialSection } = await import('../SettingsPage');
    await mount(createElement(UnusedCredentialSection, { refreshKey: 0 }));

    await click(button('削除'));

    expect(container.querySelector('[data-forget-error]')).toBeNull();
    expect(container.querySelector(`[data-unused-credential="${UNUSED}"]`)).toBeNull();
  });
});

describe('保管庫スロット — 削除が投げたら画面に出す', () => {
  const SLOT = {
    vaultKey: 'anthropic',
    emoji: '🤖',
    label: 'Anthropic API キー',
    description: '感情分析と事業アドバイザーが使う',
    placeholder: 'sk-ant-…',
  };

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('★ 施錠された保管庫では「削除できませんでした」が出る', async () => {
    const { CredentialRow } = await import('../SettingsPage');
    vaultClear.mockRejectedValue(new Error('Vault がロックされています'));
    await mount(createElement(CredentialRow, { slot: SLOT, onChange: () => {} }));

    await click(button('削除'));

    expect(container.textContent).toContain('削除できませんでした');
    expect(container.textContent).toContain('Vault がロックされています');
  });

  it('対照: 削除できたら文面は出ない', async () => {
    const { CredentialRow } = await import('../SettingsPage');
    await mount(createElement(CredentialRow, { slot: SLOT, onChange: () => {} }));

    await click(button('削除'));

    expect(vaultClear).toHaveBeenCalledWith('anthropic');
    expect(container.textContent).not.toContain('削除できませんでした');
  });
});
