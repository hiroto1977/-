/** @vitest-environment jsdom */
/**
 * **Ollama の案内が、利用者に外から届く穴をあけさせない** (2026-10-20 · パス 541 · threat: T-129)。
 *
 * Ollama には認証が無い。この画面の「スマホなど別の端末から使う」は、以前
 *   - `OLLAMA_HOST=0.0.0.0` で**全部の網**へ出させ
 *   - 「許可するのはこのページのオリジンだけ」と書き (`OLLAMA_ORIGINS` はブラウザの CORS を絞るだけで、
 *     curl などブラウザ以外の接続は止めない —— 誰が繋げるかを絞ったように読めた)
 *   - `python3 -m http.server 8080` を**居るフォルダのまま**全インターフェースへ配り (そこがリポジトリなら
 *     `.git` も `.env` も LAN から一覧で見える)
 *   - 外出先用には `cloudflared tunnel --url …` の**認証の無い公開 URL** を勧めていた (注意書きは 1 行)。
 * どれも「利用者が自分で外から届く穴をあける」案内である。実物の案内を描いて、危ない形が戻らないことを留める。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { SNAPSHOT } from '../../data/snapshot';
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

const codes = (): string[] => Array.from(container.querySelectorAll('code')).map((c) => c.textContent ?? '');

describe('Ollama の案内 — 外から届く穴をあけさせない (threat: T-129)', () => {
  it('★ どの案内コマンドも、全インターフェース (0.0.0.0) への公開を勧めない', () => {
    const bad = codes().filter((t) => /OLLAMA_HOST=0\.0\.0\.0|--bind\s+0\.0\.0\.0/.test(t));
    expect(bad).toEqual([]);
    // 標本: 針は直す前の案内そのものに当たる
    expect(/OLLAMA_HOST=0\.0\.0\.0/.test('OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS="x" ollama serve')).toBe(true);
  });

  it('★ LAN に出す案内は PC の LAN 側 IP に限り、配信も --bind で絞る', () => {
    const t = codes();
    expect(t.some((c) => c.startsWith('OLLAMA_HOST=<PCのIP>:11434'))).toBe(true);
    const serve = t.filter((c) => c.includes('http.server'));
    expect(serve.length).toBeGreaterThanOrEqual(1);
    for (const c of serve) expect(c, c).toContain('--bind');
  });

  it('★ 認証が無いこと・ORIGINS はブラウザ以外を止めないこと・使ってはいけない場面を述べる', () => {
    const w = container.querySelector('[data-ollama-exposure-warning]')?.textContent ?? '';
    expect(w).toContain('認証がありません');
    expect(w).toContain('ブラウザ以外の接続は止めません');
    expect(w).toContain('公共の Wi-Fi');
    expect(w).toContain('ポート開放');
  });

  it('★ 「オリジンだけ許可する」は誰が繋げるかの制限に読める言い方をしない', () => {
    expect(container.textContent ?? '').not.toContain('許可するのはこのページのオリジンだけ');
  });

  it('★ 外出先の案内は私設の tailnet を先に出し、公開の funnel と認証の無いクイックトンネルを止める', () => {
    const text = container.textContent ?? '';
    const tailscale = text.indexOf('tailscale serve');
    expect(tailscale).toBeGreaterThan(-1);
    expect(text).toContain('tailscale funnel');
    expect(text).toContain('公開インターネット');
    const warn = container.querySelector('[data-ollama-tunnel-warning]')?.textContent ?? '';
    expect(warn).toContain('クイックトンネルは使わないでください');
    expect(warn).toContain('認証の無い');
    // cloudflared の手順は「手順」ではなく警告の中にだけ在る
    const outside = codes().filter((c) => c.includes('cloudflared tunnel') && !container.querySelector('[data-ollama-tunnel-warning]')?.contains(
      Array.from(container.querySelectorAll('code')).find((el) => el.textContent === c) ?? null,
    ));
    expect(outside).toEqual([]);
  });
});

describe('Ollama の案内 — 配信元が特定できるときは、その origin だけを許可すると言う (threat: T-132 の対照)', () => {
  it('警告は * の利用者にだけ出る (この環境の配信元は特定できる)', () => {
    expect(container.querySelector('[data-ollama-wildcard-origin-warning]')).toBeNull();
    expect(container.textContent ?? '').toContain('このページのオリジンだけを許可します');
  });
});
