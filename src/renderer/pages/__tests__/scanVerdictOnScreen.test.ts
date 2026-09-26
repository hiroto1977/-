/** @vitest-environment jsdom */
/**
 * **未解析の URL に緑の帯を出さない。** (2026-09-22 · パス 403)
 *
 * 判定そのものは `shared/__tests__/scanVerdict.test.ts` が留める。ここが受け持つのは
 * **その判定が実際に DOM へ出るか**だけである (法則 `user-facing-claim-held-at-render`)。
 *
 * 直す前の画面は `scanResult.positives === 0 ? 'badge ok'` と書いており、
 * **まだどのエンジンも解析していない `0 / 0` を緑にしていた** —— しかもしきい値を
 * className と style の 2 か所に書き写していたので、片方だけ直る形でもあった。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SecurityPage } from '../SecurityPage';
import { SNAPSHOT } from '../../data/snapshot';
import { describeScan } from '../../../shared/api/security';
import { waitForElement } from '../../__tests__/jsdomWait';

const URL_ = 'https://example.com/x';

let container: HTMLDivElement;
let root: Root | null = null;

/** 画面を描き、URL を打って「実行」を押し、帯が出るまで待つ。 */
async function scan(summary: { positives: number; total: number }): Promise<HTMLElement> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['security']),
    // VirusTotal の鍵が設定済みでないとスキャンの枠ごと出ない。
    // **形は見本から借りる** —— 手で組むと欄が 1 つずれただけで画面が投げる。
    fetchSnapshot: () =>
      Promise.resolve({
        ok: true,
        data: { ...SNAPSHOT.security, keysConfigured: { hibp: true, vt: true } },
      }),
    invoke: vi.fn((_id: string, action: string) =>
      Promise.resolve(
        action === 'scan-url' ?
          { ok: true, data: { url: URL_, ...summary, reportUrl: 'https://www.virustotal.com/gui/url/abc' } }
        : { ok: false, code: 'x', message: 'x' },
      ),
    ),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SecurityPage));
  });

  // 枠は「スキャン」を押すまで閉じている。
  const open = await waitForElement<HTMLButtonElement>(
    () =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'スキャン') ?? null,
    'スキャンの枠を開くボタン',
  );
  await act(async () => {
    open.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const input = await waitForElement<HTMLInputElement>(
    () =>
      Array.from(container.querySelectorAll('input')).find((i) =>
        (i.getAttribute('placeholder') ?? '').includes('http'),
      ) ?? null,
    'URL の入力欄',
  );
  // React の値の tracker を通すため prototype の setter で入れてから input を撃つ。
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, URL_);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const run = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '実行');
  if (!run) throw new Error('「実行」ボタンが見つからない');
  await act(async () => {
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return waitForElement<HTMLElement>(
    () => container.querySelector<HTMLElement>('[data-scan-verdict]'),
    `スキャンの帯 (${summary.positives}/${summary.total})`,
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe('Security 画面: スキャンの帯は「未解析」と「きれい」を分ける', () => {
  it('★ 0 / 0 (誰も解析していない) は緑にならず、理由を述べる', async () => {
    const badge = await scan({ positives: 0, total: 0 });
    const want = describeScan({ positives: 0, total: 0 });

    expect(badge.getAttribute('data-scan-verdict')).toBe('unscanned');
    expect(badge.className, '緑 (badge ok) にしてはいけない').not.toContain('ok');
    expect(badge.textContent).toBe(want.label);

    const note = container.querySelector('[data-scan-note]');
    expect(note?.textContent).toBe(want.note);
    expect(note?.getAttribute('role'), '安全でない側は読み上げる').toBe('alert');
  });

  it('★ 0 / 75 (75 エンジンが解析して検出 0) は緑で、別の文を出す', async () => {
    const badge = await scan({ positives: 0, total: 75 });
    expect(badge.getAttribute('data-scan-verdict')).toBe('clean');
    expect(badge.className).toContain('ok');
    expect(badge.textContent).toBe('0 / 75 エンジン検出');
    const note = container.querySelector('[data-scan-note]');
    expect(note?.textContent).toBe(describeScan({ positives: 0, total: 75 }).note);
    expect(note?.getAttribute('role'), '緑のときは alert にしない').toBeNull();
    // 対照: 未解析の文言は出ていない
    expect(container.textContent ?? '').not.toContain('まだどのエンジンも解析していません');
  });

  it('★ 3 件以上の検出は danger の見た目になる', async () => {
    const badge = await scan({ positives: 9, total: 75 });
    expect(badge.getAttribute('data-scan-verdict')).toBe('many-detections');
    expect(badge.className).not.toContain('ok');
    expect(badge.getAttribute('style') ?? '', '赤の地色が付く').toContain('248');
    expect(container.textContent ?? '').toContain('開かないでください');
  });
});
