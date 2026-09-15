/** @vitest-environment jsdom */
/**
 * **画面が、この実行形態で本当に起きることを言う** (2026-09-12 · パス 161)。
 *
 * 5 画面がデスクトップのパスを無条件に刷っていた。ブラウザ版 (単一 HTML) は
 * そこへ 1 バイトも書かず、`~/.claude/skills` は読めず、銘柄の登録先は
 * localStorage で、登録が無ければ一覧は**空**である (デスクトップだけが見本 5 銘柄に倒す)。
 *
 * 実行形態は `runtimeMode.isBrowserBuild()` が橋の version で判定するので、
 * ここでは `getVersion()` を差し替えて**両方の形態を実際に描く**。
 * (モジュールのモックは要らない —— 判定は橋への問い合わせ 1 本で決まる。)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

let version: string;
/** `getVersion` を保留させる (分かる前の描画を見るため)。null なら即座に答える。 */
let releaseVersion: (() => void) | null;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () =>
      releaseVersion === null
        ? Promise.resolve(version)
        : new Promise<string>((resolve) => {
            releaseVersion = () => resolve(version);
          }),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'not_implemented', message: 'x' }),
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

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function text(): string {
  return container.textContent ?? '';
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  version = '0.1.0';
  releaseVersion = null;
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

describe('株式 — 保存先と「登録が無いとき」の文 (パス 161)', () => {
  it('デスクトップ版は state.json と見本の銘柄を言う (標本: 規則が空振りしていない)', async () => {
    await mount('stocks');
    const band = container.querySelector('[data-watchlist-storage]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('~/.local/business-hub/state.json');
    expect(band!.textContent).toContain('見本');
  });

  it('★ ブラウザ版は state.json を名乗らず、一覧が空だと言う', async () => {
    version = '0.1.0-web';
    await mount('stocks');
    const band = container.querySelector('[data-watchlist-storage]');
    expect(band).not.toBeNull();
    expect(band!.textContent).not.toContain('state.json');
    expect(band!.textContent).toContain('このブラウザの保存領域');
    expect(band!.textContent).toContain('一覧は空です');
  });

  it('★ ブラウザ版の書き出し先はダウンロードとライブラリ (パスを出さない)', async () => {
    version = '0.1.0-web';
    await mount('stocks');
    expect(text()).not.toContain('~/.local/business-hub/data/dashboard.html');
    expect(text()).toContain('ライブラリ');
  });
});

describe('Skills — 読み取り元 (パス 161)', () => {
  it('デスクトップ版はパスと「ディレクトリを作って」の案内を出す', async () => {
    await mount('skills');
    expect(text()).toContain('~/.claude/skills');
    expect(text()).toContain('SKILL.md');
  });

  it('★ ブラウザ版は「読み取れません」と言い、できない指示を出さない', async () => {
    version = '0.1.0-web';
    await mount('skills');
    const note = container.querySelector('[data-skills-unavailable]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('読み取れません');
    expect(note!.textContent).toContain('デスクトップ版で開く');
    // 「ディレクトリを作って SKILL.md を置け」は出さない (やっても一覧は空のまま)。
    expect(text()).not.toContain('ディレクトリを作って');
  });
});

describe('実行形態が分かる前 (パス 161)', () => {
  /**
   * **間違った文を 1 フレームも出さない。** `useBuildKind` が既定を 'desktop' に
   * 倒していると、ブラウザ版で一瞬だけ在りもしないパスが出る。
   * (この検査を書くまで、対照「既定を 'desktop' にする」は**鳴らなかった** ——
   *  `settle()` が待ってから見ていたので、分かる前の一瞬を誰も見ていなかった。
   *  **鳴らない対照は合格ではなく、検査についての報せである。**)
   */
  it('★ 判定が返るまで、実行形態に依る文を出さない', async () => {
    version = '0.1.0-web';
    // `getVersion` を保留させたまま描く。
    releaseVersion = () => undefined;
    await mount('stocks');
    expect(container.querySelector('[data-watchlist-storage]')).toBeNull();
    expect(text()).not.toContain('~/.local');
    expect(text()).not.toContain('このブラウザの保存領域');
    // 答えが返ったら出る (出ないままでは「黙って消した」ことになる)。
    const release = releaseVersion;
    releaseVersion = null;
    await act(async () => {
      release();
    });
    await settle();
    const band = container.querySelector('[data-watchlist-storage]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('このブラウザの保存領域');
  });
});

describe('Team Radar / テンプレート — 書き出し先 (パス 161)', () => {
  it('デスクトップ版は SVG のパスを言う', async () => {
    await mount('teamradar');
    expect(text()).toContain('~/.local/business-hub/data/team-radar.svg');
  });

  it('★ ブラウザ版はパスを言わない', async () => {
    version = '0.1.0-web';
    await mount('teamradar');
    expect(text()).not.toContain('~/.local');
    expect(container.querySelector('[data-export-destination]')).not.toBeNull();
  });

  it('★ テンプレートも同じ (1 画面だけ直して満足しない)', async () => {
    version = '0.1.0-web';
    await mount('templates');
    expect(text()).not.toContain('~/.local');
    expect(container.querySelector('[data-export-destination]')).not.toBeNull();
  });
});
