/** @vitest-environment jsdom */
/**
 * **見ていない端末に「Norton は無い」と警告しない** (2026-09-12 · パス 165)。
 *
 * 直す前の実測 (ブラウザ版として描いた): `[badge warn] Not detected   ·` ——
 * 警告色の札と、**区切りだけの説明**。`web-shim` の注記は「これは嘘ではない」と
 * 書いていたが、警告の札は主張である。
 *
 * ここは**画面を実際に描いて**確かめる (文面の関数だけでは、画面が呼んでいる
 * 保証が無い —— パス 66 で「3 か所のうち 1 か所しか直していなかった」形)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SecurityPage } from '../SecurityPage';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { NORTON_UNAVAILABLE_DETAILS } from '../../../shared/nortonDetection';

/** `fetchSnapshot` の返し方を差し替えて、実行形態ごとの payload を描く。 */
let snapshotResult: { ok: boolean; code?: string; message?: string; data?: unknown };
/**
 * 自動取得は**資格情報が在るときだけ**走る (`useServiceData` が `listConfigured` を見る)。
 * 空にすると同梱値のまま止まるので、payload を描きたい回だけ 'security' を入れる。
 * (最初これに気付かず 3 本落とした —— 画面は正しく、私の仕込みが届いていなかった。)
 */
let configured: string[] = [];

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve(configured),
    fetchSnapshot: () => Promise.resolve(snapshotResult),
    invoke: () => Promise.resolve({ ok: false, code: 'not_implemented', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SecurityPage));
  });
  await settle();
}

function badge(): HTMLElement | null {
  return container.querySelector('[data-norton-badge]');
}
function details(): string {
  return container.querySelector('[data-norton-details]')?.textContent ?? '';
}

beforeEach(() => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  // 既定は「取得できない」 = 同梱値が出る道 (ブラウザ版と、取得に失敗したデスクトップ版)。
  snapshotResult = { ok: false, code: 'not_implemented', message: 'x' };
  configured = [];
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
});

describe('Norton 360 の札 (パス 165)', () => {
  it('★ 同梱値のとき、警告色を出さない (見ていない端末に警告しない)', async () => {
    await mount();
    const b = badge();
    expect(b).not.toBeNull();
    expect(b!.getAttribute('data-norton-badge')).toBe('unavailable');
    expect(b!.className).toContain('muted');
    expect(b!.className).not.toContain('warn');
  });

  it('★ 同梱値のとき「確認できません」と言い、理由を述べる', async () => {
    await mount();
    expect(badge()!.textContent).toBe('確認できません');
    expect(details()).toBe(NORTON_UNAVAILABLE_DETAILS);
  });

  it('★ 区切りだけの行を出さない (直す前は「·」だけが出ていた)', async () => {
    await mount();
    expect(details().trim()).not.toBe('·');
    expect(details()).not.toMatch(/^\s*·/);
    expect(details().length).toBeGreaterThan(10);
  });

  it('★ 探して見つからなかったときは警告色で「Not detected」', async () => {
    configured = ['security'];
    snapshotResult = {
      ok: true,
      data: {
        norton: {
          installed: false,
          installPath: '',
          platform: 'win32',
          details: '既知のパスに Norton 360 のインストールは見つかりませんでした',
          detection: 'absent',
        },
        breaches: [],
        lastUrlScan: null,
        keysConfigured: { hibp: false, vt: false },
      },
    };
    await mount();
    expect(badge()!.className).toContain('warn');
    expect(badge()!.textContent).toBe('Not detected');
    expect(details()).toContain('win32');
    expect(details()).toContain('見つかりませんでした');
  });

  it('★ 製品が無い OS は警告ではなく「検出対象外」', async () => {
    configured = ['security'];
    snapshotResult = {
      ok: true,
      data: {
        norton: {
          installed: false,
          installPath: '',
          platform: 'linux',
          details: 'Norton 360 は Linux 版が無いため検出対象外です',
          detection: 'unsupported',
        },
        breaches: [],
        lastUrlScan: null,
        keysConfigured: { hibp: false, vt: false },
      },
    };
    await mount();
    expect(badge()!.className).toContain('muted');
    expect(badge()!.className).not.toContain('warn');
    expect(badge()!.textContent).toBe('検出対象外');
  });

  it('見つかったときは緑で Installed・パスも出る (対照: 直しが緑の枝を壊していない)', async () => {
    configured = ['security'];
    snapshotResult = {
      ok: true,
      data: {
        norton: {
          installed: true,
          installPath: 'C:\\Program Files\\Norton 360',
          platform: 'win32',
          details: 'Norton 360 を検出',
          detection: 'found',
        },
        breaches: [],
        lastUrlScan: null,
        keysConfigured: { hibp: false, vt: false },
      },
    };
    await mount();
    expect(badge()!.className).toContain('ok');
    expect(badge()!.textContent).toBe('Installed');
    expect(details()).toBe('win32 · Norton 360 を検出');
    expect(container.textContent).toContain('C:\\Program Files\\Norton 360');
  });
});
