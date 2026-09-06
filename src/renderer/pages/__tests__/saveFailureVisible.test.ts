/** @vitest-environment jsdom */
/**
 * **保存できなかったことが、画面に出る。**
 *
 * 書類スタジオは差込フォームの見出しに「入力は端末内に自動保存」と書いてある。2026-09-06 まで
 * `saveStore` は `catch {}` で失敗を捨てていたので、容量超過やプライベートモードでは**画面が嘘を
 * つく** —— 打ち続けられ、閉じると消える (2026-08 の監査で見つけた「クラウドに退避します、実際は
 * 1 バイトも送らない」と同じ形)。Team Radar の下書きも同じ。
 *
 * 測るのは**画面に出るか**。`Storage.prototype.setItem` を投げさせて (jsdom の setItem は実体では
 * なくプロトタイプ側に在る)、見出しと警告と、入力が画面に残っていることを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
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

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 容量超過を模す。jsdom の `setItem` はプロトタイプ側なので、そこへ挿さないと素通りする。 */
function failWrites(name = 'QuotaExceededError'): void {
  const err = new Error(name);
  err.name = name;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw err;
  });
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const firstTextInput = (): HTMLInputElement => {
  const el = Array.from(container.querySelectorAll('input')).find((i) => i.type === 'text');
  if (!el) throw new Error('text input not found');
  return el;
};
const banner = () => container.querySelector('[data-save-error]')?.textContent ?? '';

beforeEach(() => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  vi.restoreAllMocks();
});

describe('書類スタジオ: 端末に保存できなかったら見出しと警告に出る', () => {
  it('★ 容量超過: 見出しが「保存できていません」に変わり、打ち手つきの警告が出る', async () => {
    failWrites();
    await mount('docstudio');
    expect(container.textContent).toContain('⚠ 端末に保存できていません');
    expect(container.textContent).not.toContain('入力は端末内に自動保存');
    expect(banner()).toContain('保存領域が一杯');
    expect(banner()).toContain('控え');
  });

  it('★ プライベートモード (SecurityError) は別の文面で出る', async () => {
    failWrites('SecurityError');
    await mount('docstudio');
    expect(banner()).toContain('プライベートモード');
    expect(banner()).not.toContain('保存領域が一杯');
  });

  it('★ 警告が出ていても入力は画面に残る (保存の失敗で打ち込んだ物を捨てない)', async () => {
    failWrites();
    await mount('docstudio');
    const input = firstTextInput();
    await type(input, '株式会社テスト');
    expect(input.value).toBe('株式会社テスト');
    expect(container.querySelector('[data-save-error]')).not.toBeNull();
  });

  it('対照: 普通に書ければ警告は出ず、見出しは自動保存のまま、値は保存される', async () => {
    await mount('docstudio');
    expect(container.querySelector('[data-save-error]')).toBeNull();
    expect(container.textContent).toContain('入力は端末内に自動保存');
    const input = firstTextInput();
    await type(input, '株式会社テスト');
    expect(localStorage.getItem('servicehub.docstudio.v1') ?? '').toContain('株式会社テスト');
  });
});

describe('Team Radar: 下書きが保存できなかったら警告が出る', () => {
  it('★ 容量超過で警告が出る', async () => {
    failWrites();
    await mount('teamradar');
    expect(banner()).toContain('保存領域が一杯');
  });

  it('対照: 普通に書ければ警告は出ない', async () => {
    await mount('teamradar');
    expect(container.querySelector('[data-save-error]')).toBeNull();
  });
});
