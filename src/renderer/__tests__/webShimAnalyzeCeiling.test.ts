/** @vitest-environment jsdom */
/**
 * **ブラウザ版が「外へ送る前」に掛ける唯一の天井を、実際に走らせる** (2026-09-20 · パス 350)。
 *
 * ## 何が在ったか
 *
 * 2026-09-20 の変異検査 (`reports/mutation/mutation.json`) を `web-shim.ts` の
 * 天井の行だけで読み直すと、こうだった:
 *
 * ```
 *   506 / 522 / 523 / 529   相手の応答を検める天井      Killed 15
 *   748                     外へ送る本文の天井          **NoCoverage 2**
 * ```
 *
 * **受け取る側の天井は全部走っていて、送る側の天井だけが 1 度も走っていなかった。**
 * `countChars(text) > MAX_ANALYZE_TEXT_CHARS` の行に到達する検査が 1 つも無く、
 * `>` を `>=` にしても `<` にしても、branch ごと消しても、誰も鳴らない状態だった。
 *
 * ## なぜ気付かれなかったか
 *
 * 天井が**無いわけではない**。`aiInputCaps.test.ts` がこの定数を見ているが、
 * その docblock 自身が「パス 112 の印は**名前**で当てていた
 * (`MAX_ANALYZE_TEXT_CHARS` が本体に在れば合格)」と書いている ——
 * **字面では留めてあるが、振る舞いは 1 度も測っていない**。
 * 法則 `mention-vs-declaration` が言う「名前が在るかで照合する検査」の形である。
 *
 * ## ここで測るもの
 *
 * 1. **境界** —— ちょうど `MAX_ANALYZE_TEXT_CHARS` 字は通り、+1 字で断る。
 *    (`>` → `>=` / `<` の変異はここで死ぬ)
 * 2. **単位は文字** —— 絵文字 5,000 個は **`.length` なら 10,000** だが
 *    `countChars` では 5,000 なので**通る**。実装が `.length` に戻れば落ちる
 *    (法則 `ceiling-counts-characters`)。
 * 3. **断るときは送らない・鍵も読まない** —— 天井の判定は
 *    `vault.getToken('emotions')` より**前**に在る。断る要求のために
 *    資格情報を読み出さないことを、呼び出し回数で留める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join as joinPath, relative as relativePath } from 'node:path';
import { globSync } from 'tinyglobby';
import { MAX_ANALYZE_TEXT_CHARS } from '../../shared/emotionsLimits';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const tokenReads: string[] = [];
vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => {
      tokenReads.push(id);
      return id === 'emotions' ? 'sk-ant-test-key' : null;
    },
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['emotions'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string };
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  fetchCalls.length = 0;
  tokenReads.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ scores: { joy: 0.8 }, sentiment: 'positive', dominant: 'joy' }),
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('ブラウザ版 emotions/analyze-text — 外へ送る前の天井 (パス 350)', () => {
  it('★ ちょうど上限の長さは通り、Anthropic へ送られる', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', { text: 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS) });
    expect(r.ok, r.message).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('★ 1 字超えると断り、送らず、鍵も読まない', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', {
      text: 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS + 1),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
    expect(r.message).toContain(String(MAX_ANALYZE_TEXT_CHARS));
    expect(r.message).toContain('長すぎます');
    // 送らない (切って送る、ではない)。
    expect(fetchCalls).toEqual([]);
    // 断る要求のために資格情報を読み出さない (天井は鍵の読み出しより前に在る)。
    expect(tokenReads).toEqual([]);
  });

  it('★ 数えるのは文字 —— 絵文字 5,000 個 (コード単位 10,000) は通る', async () => {
    const text = '😀'.repeat(MAX_ANALYZE_TEXT_CHARS);
    // 標本: この入力は「文字では上限ちょうど・コード単位では 2 倍」である。
    expect(text.length).toBe(MAX_ANALYZE_TEXT_CHARS * 2);
    expect([...text]).toHaveLength(MAX_ANALYZE_TEXT_CHARS);
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', { text });
    expect(r.ok, r.message).toBe(true);
    expect(fetchCalls).toHaveLength(1);
  });

  it('★ 絵文字でも 1 字超えれば断る (文字で数えた上での上限)', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', {
      text: '😀'.repeat(MAX_ANALYZE_TEXT_CHARS + 1),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('長すぎます');
    expect(fetchCalls).toEqual([]);
  });

  it('空文字と空白だけは別の理由で断る (天井の文面と混ぜない)', async () => {
    const hub = await loadHub();
    for (const text of ['', '   ', '\n\t']) {
      fetchCalls.length = 0;
      const r = await hub.invoke('emotions', 'analyze-text', { text });
      expect(r.ok, JSON.stringify(text)).toBe(false);
      expect(r.message).toContain('text を入力してください');
      expect(r.message).not.toContain('長すぎます');
      expect(fetchCalls).toEqual([]);
    }
    // 標本: 針が天井の文面に当たることを見せる (当たらなければ上の not は空の検査)。
    expect('text が長すぎます (5000 字以内)').toContain('長すぎます');
  });

  it('文字列でない text も断る (送らない)', async () => {
    const hub = await loadHub();
    for (const text of [undefined, null, 123, { a: 1 }, ['x']]) {
      fetchCalls.length = 0;
      const r = await hub.invoke('emotions', 'analyze-text', { text });
      expect(r.ok, JSON.stringify(text)).toBe(false);
      expect(fetchCalls).toEqual([]);
    }
  });
});

/**
 * **同じ天井を持つ層が 3 つ在り、走っていたのは 2 つだった** (2026-09-20 · パス 350)。
 *
 * `MAX_ANALYZE_TEXT_CHARS` を**比べている**のは 3 か所:
 *
 * ```
 *   pages/EmotionsPage.tsx      画面の断り        ← emotionsCeilingOnScreen.test.ts が走らせていた
 *   main/clients/emotions.ts    デスクトップ版の handler ← emotions.test.ts が走らせていた
 *   renderer/web-shim.ts        ブラウザ版の handler    ← **誰も走らせていなかった**
 * ```
 *
 * handler の天井は「画面を通らずに来た要求」のために在る —— つまり
 * **画面の天井が破られたときのための層**である。その層のうち、
 * ブラウザ版だけが 1 度も実行されていなかった (2026-09-20 の変異検査で
 * `NoCoverage`)。**デスクトップ版の双子は走っていた**ので、
 * 「両ビルドに同じ判定を 2 度書かない」の裏側 ——
 * **2 度書いたうち片方しか測っていない**——の形である。
 *
 * 台帳は**両方向**。新しい層が天井を持てば「どの検査が走らせるのか」を
 * 書くことになり、層が消えれば台帳が落ちる。
 */
describe('MAX_ANALYZE_TEXT_CHARS を比べている層の母集団 (パス 350)', () => {
  const REPO = joinPath(__dirname, '..', '..', '..');

  /** 定数を**比べている** (言及ではない) 行を持つ出荷モジュール。 */
  function comparingFiles(): string[] {
    const files = globSync(['src/**/*.ts', 'src/**/*.tsx'], {
      cwd: REPO,
      absolute: true,
      ignore: ['**/__tests__/**', '**/*.d.ts'],
    });
    const out: string[] = [];
    for (const abs of files) {
      const hit = stripComments(readOriginalSource(abs))
        .split('\n')
        .some((line) => {
          const t = line.trim();
          if (!t.includes('MAX_ANALYZE_TEXT_CHARS')) return false;
          return /[<>]\s*MAX_ANALYZE_TEXT_CHARS|MAX_ANALYZE_TEXT_CHARS\s*[<>]|charsOverCeiling\(|max=\{MAX_ANALYZE_TEXT_CHARS\}/.test(t);
        });
      if (hit) out.push(relativePath(REPO, abs).split('\\').join('/'));
    }
    return out.sort();
  }

  const LAYERS: Readonly<Record<string, { layer: string; provenBy: string; why: string }>> = {
    'src/renderer/pages/EmotionsPage.tsx': {
      layer: '画面',
      provenBy: 'src/renderer/pages/__tests__/emotionsCeilingOnScreen.test.ts',
      why: '人が本文を貼る欄。maxLength に任せると超過分が黙って落ち、先頭 5,000 字への分析が全文への分析として出る (パス 168)。',
    },
    'src/main/clients/emotions.ts': {
      layer: 'デスクトップ版の handler',
      provenBy: 'src/main/clients/__tests__/emotions.test.ts',
      why: 'IPC 境界。画面を通らずに来た要求を throw で断る。',
    },
    'src/renderer/web-shim.ts': {
      layer: 'ブラウザ版の handler',
      provenBy: 'src/renderer/__tests__/webShimAnalyzeCeiling.test.ts',
      why: 'デスクトップ版の handler の双子。2026-09-20 (パス 350) まで、3 層のうちここだけが 1 度も実行されていなかった (変異検査で NoCoverage)。',
    },
  };

  it('★ 台帳と実物が一致する (両方向)', () => {
    expect(comparingFiles()).toEqual(Object.keys(LAYERS).sort());
  });

  it('★ どの層も「走らせる検査」を名指ししており、その検査は実在して定数を読む', () => {
    for (const [file, row] of Object.entries(LAYERS)) {
      const abs = joinPath(REPO, row.provenBy);
      expect(existsSync(abs), `${file} の provenBy が無い: ${row.provenBy}`).toBe(true);
      expect(readOriginalSource(abs), row.provenBy).toContain('MAX_ANALYZE_TEXT_CHARS');
      expect(row.why.length, file).toBeGreaterThan(20);
      expect(row.layer.length, file).toBeGreaterThan(1);
    }
  });

  it('標本: 言及だけの行は母集団に入らない (コメントと定義)', () => {
    const mentionOnly = [
      'src/shared/emotionsLimits.ts',
      'src/shared/talent.ts',
      'src/renderer/data/emotionsWeb.ts',
    ];
    for (const f of mentionOnly) {
      expect(readOriginalSource(joinPath(REPO, f)), f).toContain('MAX_ANALYZE_TEXT_CHARS');
      expect(comparingFiles(), f).not.toContain(f);
    }
  });
});
