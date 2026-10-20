/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "http://$({touch,pwned}).example.com:8080/"}
 */
/**
 * **Ollama 画面の案内コマンドへ、配信元の origin をシェルに安全な形でだけ埋める** (threat: T-114)
 *
 * T-103 は `ollamaWeb.ts` の組み立て側 (コピーボタン) を `shellSafeOrigin` へ通したが、同じ画面の
 * `<code>` 2 か所は生の `location.origin` を二重引用符の中へ埋めたままだった。二重引用符の中でも
 * `$(…)` と逆引用符は展開されるので、利用者がその行を選んで端末へ貼ると配信元の host 名が決めた
 * 命令が走る (実測: `bash` に貼ると空の作業ディレクトリに `pwned` ができた)。
 * 空白は URL の host に入れないので、ブレース展開 `{touch,pwned}` で再現する。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { SNAPSHOT } from '../../data/snapshot';
import { shellSafeOrigin } from '../../network/ollamaWeb';
import { waitForText } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: { ...SNAPSHOT.ollama, running: false }, source: 'live' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(OllamaPage));
  });
  await waitForText(() => container.textContent ?? '', 'OLLAMA_ORIGINS');
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  document.body.removeChild(container);
});

describe('OllamaPage の案内コマンド — 配信元の origin (threat: T-114)', () => {
  it('標本: この配信元はシェルに安全ではない (針が的に当たる)', () => {
    expect(location.origin).toContain('$(');
    expect(shellSafeOrigin(location.origin)).toBe('*');
  });

  it('<code> の OLLAMA_ORIGINS="…" に、シェルが展開する字が 1 つも入らない', () => {
    const lines = Array.from(container.querySelectorAll('code'))
      .map((c) => c.textContent ?? '')
      .filter((t) => t.includes('OLLAMA_ORIGINS='));
    // 2 か所 (LAN に公開する行・Tailscale/トンネルの行)。減ったら描画が消えている。
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const t of lines) {
      expect(t).not.toContain('$(');
      expect(t).not.toContain('`');
      expect(t).not.toContain('{touch');
    }
  });

  it('安全でない origin では LAN の行は「PC の IP」の見本へ、もう 1 行は * へ倒れる', () => {
    const lines = Array.from(container.querySelectorAll('code'))
      .map((c) => c.textContent ?? '')
      .filter((t) => t.includes('OLLAMA_ORIGINS='));
    expect(lines.some((t) => t.includes('OLLAMA_HOST=<PCのIP>:11434') && t.includes('http://<PCのIP>:8080'))).toBe(true);
    expect(lines.some((t) => t.trim() === 'OLLAMA_ORIGINS="*"')).toBe(true);
  });
});
