/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "http://[::1]:8080/standalone.html"}
 */
/**
 * **配信元を特定できないとき(file:// など)、Ollama の案内は `*` を許可すると正直に言う** (threat: T-132)
 *
 * 単一 HTML を file:// で開くと origin は "null" (jsdom は file:// に localStorage を出さないので、同じ「* に倒れる」形の IPv6 host で再現する) で、案内のコマンドは `OLLAMA_ORIGINS="*"` に倒れる。
 * 以前の脚注は「上のコマンドはこのページのオリジンだけを許可します」と言い切り、この利用者には偽だった。
 * `*` を永続設定にすると、ブラウザで開いた他のサイトがこの PC の Ollama を読み書きできる。
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

describe('OllamaPage — 配信元が特定できないとき (threat: T-132)', () => {
  it('標本: 特定できない配信元 (IPv6 の host など) は * に倒れる (針が的に当たる)', () => {
    expect(shellSafeOrigin(location.origin)).toBe('*');
  });

  it('★ * を許可するコマンドを出すなら、そのことと恒久設定にしない勧めを述べる', () => {
    const t = container.textContent ?? '';
    const warn = container.querySelector('[data-ollama-wildcard-origin-warning]');
    expect(warn).not.toBeNull();
    const w = warn?.textContent ?? '';
    expect(w).toContain('どのウェブページからでも');
    expect(w).toContain('恒久設定にはせず');
    expect(w).toContain('npm run ollama');
    // 偽になった言い切りを、* の利用者に出さない (針は直す前の文そのもの)。
    const CLAIM = 'このページのオリジンだけを許可します';
    expect(CLAIM.length).toBeGreaterThan(0);
    expect(t).not.toContain(CLAIM);
  });
});
