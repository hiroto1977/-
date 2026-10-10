/** @vitest-environment jsdom */
/**
 * **モデル一覧の meta 行に、相手の生の値がそのまま出ない。** (2026-09-22 · パス 408)
 *
 * 値そのものの判定は `shared/__tests__/ollamaModelFieldCeilings.test.ts` が見る。
 * ここが受け持つのは**描く所** —— 天井を `normalizeModels` に置いても、画面が
 * 別の経路で生の値を持ってきたら意味が無い (法則 `user-facing-claim-held-at-render`)。
 *
 * 併せて空欄の理由も見る: `modifiedAt` は読めないとき `null` で、パス 407 まで
 * 画面は空文字を素で挿し **「更新 」とだけ刷っていた** —— 「まだ取れていない」と
 * 「相手が読めない値を返した」が同じ見え方になる (法則 `blank-states-its-reason`)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { MAX_OLLAMA_MODEL_DETAIL_CHARS, MIN_SAFE_VERSION, normalizeModels } from '../../../shared/ollama';
import { waitForText } from '../../__tests__/jsdomWait';

/** 相手 (利用者が設定した Ollama ホスト) の生の応答から、画面が読む形を作る。 */
function snapshotFrom(rawTags: unknown): unknown {
  return {
    running: true,
    version: MIN_SAFE_VERSION,
    versionSafe: true,
    versionMinRecommended: MIN_SAFE_VERSION,
    models: normalizeModels(rawTags),
    warnings: [] as string[],
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(rawTags: unknown, waitFor: string): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshotFrom(rawTags) }),
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
  // 固定回数では待たない (法則 wait-for-condition-not-ticks)。
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
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

describe('Ollama のモデル一覧が画面へ出すもの (パス 408)', () => {
  it('★ 相手が 200,000 字を名乗っても、画面はその綴りを持たない', async () => {
    const big = 'x'.repeat(200_000);
    const t = await mount(
      {
        models: [
          {
            name: 'llama3:8b',
            size: 1024 * 1024,
            modified_at: '2026-07-01T12:00:00Z',
            details: { family: big, parameter_size: big, quantization_level: big },
          },
        ],
      },
      'llama3:8b',
    );
    // 生の長さがそのまま載っていない (**この 1 行が主題**)。
    expect(t).not.toContain('x'.repeat(200));
    // 切った印は**その値に付いて**出る (黙って切らない)。
    // ★ 素の `toContain('…')` では錠にならない —— この画面は別の所でも
    //   「1 個の…」のように三点リーダを使う (対照を書いて気付いた)。
    expect(t).toContain('x'.repeat(MAX_OLLAMA_MODEL_DETAIL_CHARS) + '…');
    // 画面ぜんぶでも 200,000 字に遠く及ばない = 1 行が膨らんでいない。
    expect(t.length).toBeLessThan(50_000);
  });

  it('★ 読めない更新日は「日付が読めません」と言う (空欄のまま出さない)', async () => {
    const t = await mount(
      {
        models: [
          {
            name: 'llama3:8b',
            size: 1024 * 1024,
            modified_at: 20260922, // 数 —— RFC 3339 の文字列ではない
            details: { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_K_M' },
          },
        ],
      },
      'llama3:8b',
    );
    expect(t).toContain('日付が読めません');
    // **1970 を捏造していない** (数を epoch ミリ秒として読むとそうなる)。
    expect(t).not.toContain('1970');
  });

  it('★ 対照: 正常な応答では日付が出て、断りの文は出ない', async () => {
    const t = await mount(
      {
        models: [
          {
            name: 'llama3:8b',
            size: 1024 * 1024,
            modified_at: '2026-07-01T12:00:00Z',
            details: { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_K_M' },
          },
        ],
      },
      'llama3:8b',
    );
    expect(t).toMatch(/更新 \d{4}-\d{2}-\d{2}/);
    expect(t).not.toContain('日付が読めません');
    // 正常な値は切られていない (`…` はこの画面の他の文にも出るので、**値に付いた**印を見る)。
    expect(t).toContain('Q4_K_M');
    expect(t).not.toContain('Q4_K_M…');
    // 生の ISO 文字列 (T 付き) は画面に出さない —— build をまたいで同じ形。
    expect(t).not.toContain('2026-07-01T12:00:00Z');
  });
});
