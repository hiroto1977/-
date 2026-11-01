/** @vitest-environment jsdom */
/**
 * **版が読めなかったことを「古い」と言わない。** (2026-09-14 · パス 264)
 *
 * `isVersionSafe('')` は `false` を返す —— 安全の判定なので、読めないときは
 * 危険側へ倒すのが正しい。**倒すこと自体は残す** (バッジは出て、更新を促す)。
 * 直したのは**理由**である: 以前は `Outdated — known CVEs` と
 * 「既知 CVE。最低 N へ更新推奨」を出していたが、既知 CVE が在ると分かった
 * のではなく、`/api/version` の応答に `version` が無かっただけである。
 *
 * 両ビルドがこの 1 枚の画面を読み (renderer は 1 つ)、`version: ''` /
 * `versionSafe: false` を作るところも両方に在る (main/clients/ollama.ts と
 * renderer/network/ollamaWeb.ts が同じ既定値を持つ · 実測)。
 *
 * **チャット欄の中の同じ文 (`⚠ 古いバージョンで実行中`) はここでは見ない** ——
 * `showChat && running && models.length > 0` の内側に在るので、この見本
 * (`models: []`) では描かれない。見出しのバッジだけが常に出る面である。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { settleUntil } from './jsdomWait';
import { OllamaPage } from '../pages/OllamaPage';
import { SNAPSHOT } from '../data/snapshot';

type OllamaSnap = typeof SNAPSHOT.ollama;

/** 走っているが版が読めない / 走っていて版が古い、の 2 つを作る。 */
function snapWith(version: string, versionSafe: boolean): OllamaSnap {
  return { ...SNAPSHOT.ollama, running: true, version, versionSafe, models: [], warnings: [] };
}

let snapshot: OllamaSnap = snapWith('', false);

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshot }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  host.remove();
});

/** 画面を描いて、出た文字と title 属性をぜんぶ返す。 */
async function render(snap: OllamaSnap): Promise<string> {
  snapshot = snap;
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(OllamaPage));
  });
  // **固定回数の settle は待っていない、当てているだけ** —— jsdomWait.ts の
  // docblock が 2 度の実測つきでそう書いている (パス 169)。実際、この検査を
  // 固定 8 周で書いた直後の全件実行で 1 本落ちた (単独では 3/3 通る)。
  await settleUntil(() => (host.textContent ?? '').length > 0, 'Ollama の見出しが描かれた');
  const titles = [...host.querySelectorAll('[title]')]
    .map((el) => el.getAttribute('title') ?? '')
    .join(' | ');
  return `${host.textContent ?? ''} ||TITLES|| ${titles}`;
}

describe('Ollama の画面 — 版が読めなかったとき', () => {
  it('★ 版が空なら「読み取れませんでした」と言い、既知 CVE とは言わない', async () => {
    const text = await render(snapWith('', false));
    expect(text).toContain('Version unknown');
    expect(text).toContain('バージョンを読み取れませんでした');
    // **既知 CVE が在るとは言わない。**
    expect(text).not.toContain('Outdated — known CVEs');
    expect(text).not.toContain('既知 CVE');
  });

  it('★ 対照: 版が読めて古いなら、従来どおり既知 CVE と言う', async () => {
    const text = await render(snapWith('0.1.0', false));
    expect(text).toContain('Outdated — known CVEs');
    expect(text).toContain('既知 CVE');
    expect(text).not.toContain('Version unknown');
  });

  it('★ 対照: 版が安全なら警告そのものが出ない', async () => {
    const text = await render(snapWith('9.9.9', true));
    expect(text).toContain('Up to date');
    expect(text).not.toContain('Version unknown');
    expect(text).not.toContain('Outdated — known CVEs');
  });
});
