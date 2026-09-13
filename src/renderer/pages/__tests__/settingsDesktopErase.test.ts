/** @vitest-environment jsdom */
/**
 * **デスクトップ版の「Vault 管理」— 保管庫は無いのに、パスワード変更と施錠が出ていた。** (2026-09-09 · パス 137)
 *
 * デスクトップ版のトークンは main の secrets.json に在り、renderer の保管庫は使われていない。それでも
 * 設定画面は「マスターパスワード変更」「Vault を今すぐロック」を出し、「すべてのデータを削除」は
 * renderer の保存領域しか消せなかった。ここは橋を Electron 版の顔 (version が '0.1.0-web' でない) にして、
 * 保管庫の操作が消え、削除はデスクトップの範囲を言い、main の報告どおりに振る舞う (全部消えたら
 * 「再起動します」で再読込しない / 残れば名指しして再読込しない) ことを留める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DesktopEraseReport } from '../../../shared/eraseReport';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../security/vault', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../security/vault')>();
  return {
    MIN_PASSWORD_LENGTH: real.MIN_PASSWORD_LENGTH,
    // 天井も本物を読む (パス 167 —— 画面の `maxLength` がこれを読むようになった)。
    MAX_TOKEN_CHARS: real.MAX_TOKEN_CHARS,
    describeWipeOutcome: real.describeWipeOutcome,
    getVault: () => ({
      isUnlocked: () => false,
      lock: () => {},
      changePassword: async () => {},
      wipeAndReset: async () => 'deleted' as const,
    }),
  };
});

function desktopReport(allDeleted: boolean, stuck = '/home/me/.local/business-hub/talent.json'): DesktopEraseReport {
  return {
    kind: 'desktop',
    files: allDeleted ? { '/home/me/.config/service-hub/service-hub-secrets.json': 'deleted' } : { [stuck]: 'failed' },
    renderer: 'deleted',
    allDeleted,
  };
}

let eraseImpl: () => Promise<DesktopEraseReport> = async () => desktopReport(true);
const calls: string[] = [];
let container: HTMLDivElement;
let root: Root | null = null;
let reload: ReturnType<typeof vi.fn>;

const text = (): string => container.textContent ?? '';
function buttonSaying(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label));
}
async function click(el: Element | undefined): Promise<void> {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 10));
  });
}

async function renderControls(): Promise<void> {
  const { VaultControls } = await import('../SettingsPage');
  await act(async () => {
    root!.render(createElement(VaultControls));
  });
  await settle();
}

async function runHardReset(): Promise<void> {
  await renderControls();
  await click(buttonSaying('すべてのデータを削除…'));
  const box = container.querySelector<HTMLInputElement>('input[placeholder="DELETE"]');
  await act(async () => {
    typeInto(box as HTMLInputElement, 'DELETE');
  });
  await click(buttonSaying('確定して削除'));
  await settle();
}

beforeEach(() => {
  calls.length = 0;
  eraseImpl = async () => desktopReport(true);
  reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: async () => '1.2.3', // Electron 版の顔
    eraseAll: async () => {
      calls.push('eraseAll');
      return eraseImpl();
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('デスクトップ版の Vault 管理 (パス 137)', () => {
  it('★ 保管庫の操作 (パスワード変更・施錠) を出さない — 保管庫が無いので', async () => {
    await renderControls();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(text()).not.toContain('マスターパスワード変更');
    expect(text()).not.toContain('Vault を今すぐロック');
    // 対照: 削除の節は在る。
    expect(buttonSaying('すべてのデータを削除…')).toBeDefined();
  });

  it('★ 説明はデスクトップの範囲 (トークンのファイル・状態ファイル・画面側の保存領域) と消えない物を言う', async () => {
    await renderControls();
    expect(text()).toContain('このパソコンにアプリが保存した物をすべて消します');
    expect(text()).toContain('状態ファイル');
    expect(text()).toContain('消えない物');
    expect(text()).toContain('アプリが再起動し');
    // 標本つきの不在: ブラウザ版の文 (localStorage の鍵の数) ではない。
    expect(text()).not.toContain('このブラウザにアプリが保存した物');
  });

  it('★ 全部消えたら「再起動します」— 再読込しない (main が再起動する)', async () => {
    await runHardReset();
    expect(calls).toEqual(['eraseAll']);
    expect(text()).toContain('再起動します');
    expect(reload).not.toHaveBeenCalled();
    expect(text()).not.toContain('データは残っています');
  });

  it('★ 残った物が在れば、そのパスを名指しして再読込せず、押し直せる', async () => {
    const stuck = '/home/me/.local/business-hub/talent.json';
    eraseImpl = async () => desktopReport(false, stuck);
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    expect(text()).toContain(stuck);
    expect(text()).toContain('データは残っています');
    expect(text()).not.toContain('再起動します');
    expect(buttonSaying('確定して削除')).toBeDefined();
  });

  it('橋が投げたら message を出す (再読込しない)', async () => {
    eraseImpl = async () => {
      throw new Error('IPC が切れました');
    };
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    expect(text()).toContain('IPC が切れました');
  });
});
