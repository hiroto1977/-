/**
 * **端末から読む / 消すときも、断られることを想定していなければならない。**
 *
 * 書き込み側は `storageWritePolicy.test.ts` が台帳で留めた。ところが `localStorage` /
 * `sessionStorage` は**触れること自体が投げる** —— Chrome はサイトデータをブロックした
 * オリジンで `SecurityError: Access is denied for this document.` を返し、プライベート
 * モードでも同じ形になる。`localWrite.ts` の冒頭が「書き込み禁止」を 3 つの現実の理由の
 * 1 つとして数えているのに、**読みと消しの側は誰も見ていなかった** (2026-09-06 実測:
 * 読み 21 か所のうち 3 か所が `try` の外、消しは `oauth/pkceSession.ts` の 4 連が素で並んでいた)。
 *
 * 素で呼ぶと何が起きるか、実際に踏んだ形で書く:
 *
 *   `recordEncryption.loadMeta()` … `isEncryptionEnabled()` が投げる。これは
 *     `BackupPanel` の**描画中**に呼ばれるので、保存領域が怪しい端末に限って
 *     **控えを取り出す画面が消える** (PageErrorBoundary の中身に置き換わる)。
 *   `clearPkceSession()`     … 4 連の 2 つ目で投げると残り 2 つが残る。残るのは
 *     `code_verifier` すなわち RFC 7636 の秘密で、しかも呼び出しは `finally` に
 *     在るため、本当の失敗 (state 不一致 = CSRF の疑い) を**投げ替えて**しまう。
 *
 * 規則: `src/renderer` の `getItem` / `removeItem` は、**同じ関数の中で失敗を受ける**
 * 形でなければならない (`try` の内側に在ること)。走査が死んだら落ちるよう床を置く。
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';

const REPO = join(__dirname, '..', '..', '..');
const ACCESS_RE = /\b(?:localStorage|sessionStorage)\.(?:getItem|removeItem|clear)\(/g;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly guarded: boolean;
}

/**
 * `try` の内側かどうかを波括弧の入れ子で判定する。AST は入れない (このリポジトリの
 * ゲートは全て素の Node —— `scripts/` と同じ方針)。`{` を積むときに直前の語が `try`
 * かどうかを覚え、`}` で降ろす。
 */
function guardedAt(text: string, index: number): boolean {
  const stack: boolean[] = [];
  for (let i = 0; i < index; i += 1) {
    const c = text[i];
    if (c === '{') {
      let k = i - 1;
      while (k >= 0 && (text[k] === ' ' || text[k] === '\n' || text[k] === '\t')) k -= 1;
      stack.push(text.slice(Math.max(0, k - 2), k + 1) === 'try');
    } else if (c === '}') {
      stack.pop();
    }
  }
  return stack.includes(true);
}

function scan(files: readonly { readonly file: string; readonly text: string }[]): Site[] {
  const found: Site[] = [];
  for (const { file, text } of files) {
    for (const m of text.matchAll(ACCESS_RE)) {
      found.push({
        file,
        line: text.slice(0, m.index).split('\n').length,
        guarded: guardedAt(text, m.index),
      });
    }
  }
  return found;
}

function rendererSources(): { file: string; text: string }[] {
  return globSync(['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**'],
  }).map((abs) => ({
    file: relative(REPO, abs).split('\\').join('/'),
    text: readFileSync(abs, 'utf8'),
  }));
}

const SITES = scan(rendererSources());

describe('端末から読む / 消す側の作法', () => {
  it('走査が生きている (床: 20 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(20);
  });

  it('★ 素で読む / 消す場所は無い', () => {
    const bare = SITES.filter((s) => !s.guarded).map((s) => `${s.file}:${s.line}`);
    expect(bare, '`getItem` / `removeItem` は同じ関数の中で失敗を受けること (SecurityError は触れるだけで飛ぶ)').toEqual([]);
  });

  it('標本: 判定は素の呼び出しを実際に素と読む', () => {
    const bare = scan([{ file: 'x.ts', text: 'export function f() {\n  return localStorage.getItem(K);\n}\n' }]);
    expect(bare.map((s) => s.guarded)).toEqual([false]);
  });

  it('標本: 判定は try の中を守られていると読む', () => {
    const ok = scan([{ file: 'x.ts', text: 'export function f() {\n  try {\n    return localStorage.getItem(K);\n  } catch { return null; }\n}\n' }]);
    expect(ok.map((s) => s.guarded)).toEqual([true]);
  });

  it('標本: catch の中の呼び出しは守られていない (retry を守りと読まない)', () => {
    const inCatch = scan([{ file: 'x.ts', text: 'export function f() {\n  try { g(); } catch {\n    localStorage.removeItem(K);\n  }\n}\n' }]);
    expect(inCatch.map((s) => s.guarded)).toEqual([false]);
  });

  it('標本: 走査は .tsx も sessionStorage も見ている', () => {
    expect(SITES.some((s) => s.file.endsWith('.tsx'))).toBe(true);
    expect(SITES.some((s) => s.file === 'src/renderer/oauth/pkceSession.ts')).toBe(true);
  });
});
