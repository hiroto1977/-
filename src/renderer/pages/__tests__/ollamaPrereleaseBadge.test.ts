/** @vitest-environment jsdom */
/**
 * **プレリリース版で実行中であることを、画面が言う。** (2026-09-22 · パス 402)
 *
 * パス 402 は `compareVersions` がプレリリース識別子を捨てていたのを直した。
 * その結果 `0.31.2-rc1` の利用者は `versionSafe = false` の側に来るが、
 * **番号だけ読むと足りているように見える** —— 警告は「0.31.2 で修正・0.31.2 以上へ
 * 更新してください」と言い、利用者は自分が 0.31.2 だと思う。**判定を直しただけだと、
 * 画面が矛盾した文を出す状態を 1 つ作ることになる。**
 *
 * これは同じファイルのパス 264 (「版が読めなかったことを『古い』と言わない」) の
 * **4 つ目の状態**で、法則 `blank-states-its-reason` / `user-facing-claim-held-at-render`
 * の形である。原因の選択は `shared/ollama.ts` の `unsafeVersionCause` ただ 1 つ
 * (面ごとに `version === '' ? … : …` と書き分けていた 2 か所の写しは消した)。
 *
 * ここは**動かして**見る —— 原因と文面そのものは
 * `shared/__tests__/prereleaseVersionOrder.test.ts` が留めるので、この検査が
 * 受け持つのは「**その文が実際に DOM へ出るか**」だけである。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { MIN_SAFE_VERSION, unsafeVersionTexts } from '../../../shared/ollama';
import { waitForElement } from '../../__tests__/jsdomWait';

function snapshotFor(version: string, versionSafe: boolean): unknown {
  return {
    running: true,
    version,
    versionSafe,
    versionMinRecommended: MIN_SAFE_VERSION,
    models: [
      {
        name: 'llama3.2:1b',
        family: 'llama',
        parameterSize: '1B',
        quantization: 'Q4_K_M',
        sizeMb: 1300,
        modifiedAt: '2026-09-01',
      },
    ],
    warnings: [] as string[],
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

/** 画面を描き、版の帯が出るまで待つ (固定回数では待たない — 法則 wait-for-condition-not-ticks)。 */
async function mount(version: string, versionSafe: boolean): Promise<HTMLElement> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshotFor(version, versionSafe) }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: { reply: 'x', durationMs: 1 } })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(OllamaPage));
  });
  return waitForElement<HTMLElement>(
    () => container.querySelector<HTMLElement>('[data-version-badge]'),
    `版の帯 (${version || '(空)'})`,
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

describe('Ollama 画面は「安全でない理由」を原因ごとに言う', () => {
  it('★ プレリリース版: 札と 1 行が「プレリリース」を名指しし、全文が番号の矛盾を説明する', async () => {
    const badge = await mount(`${MIN_SAFE_VERSION}-rc1`, false);
    const want = unsafeVersionTexts('prerelease');

    expect(badge.getAttribute('data-version-cause')).toBe('prerelease');
    expect(badge.textContent).toBe(want.badge);
    expect(badge.getAttribute('title')).toBe(want.note);

    // 全文は「番号は足りて見えるが、プレリリースは正式版より前」を述べる
    expect(want.note).toContain('プレリリース');
    expect(want.note).toContain('正式版');

    // 対照: 古いだけの版の文面は出さない (原因を取り違えていない)
    const t = container.textContent ?? '';
    expect(t).toContain(want.badge);
    expect(t).not.toContain(unsafeVersionTexts('outdated').badge);
  });

  it('★ 版が読めない: パス 264 の分け方はそのまま (「古い」とは言わない)', async () => {
    const badge = await mount('', false);
    expect(badge.getAttribute('data-version-cause')).toBe('unreadable');
    expect(badge.textContent).toBe(unsafeVersionTexts('unreadable').badge);
    const t = container.textContent ?? '';
    expect(t).not.toContain(unsafeVersionTexts('outdated').badge);
    expect(t).not.toContain(unsafeVersionTexts('prerelease').badge);
  });

  it('★ 単に古い版: 従来どおり既知 CVE の札', async () => {
    const badge = await mount('0.1.33', false);
    expect(badge.getAttribute('data-version-cause')).toBe('outdated');
    expect(badge.textContent).toBe(unsafeVersionTexts('outdated').badge);
    expect(container.textContent ?? '').not.toContain(unsafeVersionTexts('prerelease').badge);
  });

  it('★ 安全な版: 帯は「Up to date」で、理由の札は 1 つも出ない', async () => {
    const badge = await mount(MIN_SAFE_VERSION, true);
    expect(badge.getAttribute('data-version-cause')).toBeNull();
    expect(badge.textContent).toBe('Up to date');
    const t = container.textContent ?? '';
    for (const cause of ['unreadable', 'prerelease', 'outdated'] as const) {
      expect(t, `${cause} の札が出ている`).not.toContain(unsafeVersionTexts(cause).badge);
    }
  });
});
