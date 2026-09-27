import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { isCancelEscape, isImeComposing, isSubmitEnter } from '../keyIntent';

/*
 * **Enter / Escape を「意図」として読む口は `renderer/keyIntent.ts` の 1 つ** (2026-09-27 · パス 493i)。
 *
 * 2026-09-27 まで、keydown を直に読む 12 か所がどれも `e.key === 'Enter'` / `'Escape'` を
 * 素で比べていた。実 chromium (141) は変換中の keydown を `key` のまま `isComposing: true` で
 * 届けるので、**日本語の変換を確定した瞬間に**アドバイザーへの質問が有料の AI へ送られ、
 * サイドバーは打ちかけの語の先頭ヒットへ移り、変換の取り消しで検索語とドロワーが消えた
 * (振る舞いは `pages/__tests__/imeEnterDoesNotSend.test.ts` と
 * `__tests__/sidebarSearchIme.test.ts` が実物を押して留める)。
 *
 * 規則: `src/renderer` と `src/shared` のコード (検査を除く) に、Enter / Escape を表す
 * 文字列リテラル (`'Enter'` / `'Escape'` / `'Esc'` / `'NumpadEnter'`)・`case 'Enter':`・
 * `keyCode` / `which` の 13 / 27 との比較が、`keyIntent.ts` の外に 1 つも無いこと。
 * 13 か所目を素で書いた日に、その 1 か所だけが変換の確定で動く —— 判定が 1 つなら起きない。
 *
 * **注記は落として数える** (説明文の中の `'Enter'` は判定ではない)。リテラルの中身は残す
 * (探しているのがリテラルそのものなので、`stripNonCode` では空の検査になる)。
 */

const REPO = path.resolve(__dirname, '../../..');
const ROOTS = ['src/renderer', 'src/shared'];
const HOME = 'src/renderer/keyIntent.ts';

/** キーの名前を素で比べる形。 */
export const RAW_KEY = /['"`](?:Enter|Escape|Esc|NumpadEnter)['"`]|\b(?:keyCode|which)\s*[!=]==?\s*(?:13|27)\b|\b(?:13|27)\s*[!=]==?\s*\w+\.(?:keyCode|which)\b/;

/** 理由つきの免除 (今日 0 件)。鍵はファイルの相対パス。 */
const EXEMPT: Readonly<Record<string, string>> = {};

function walk(rel: string): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(path.join(REPO, rel))) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      out.push(...walk(child));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(child);
    }
  }
  return out;
}

/** 1 ファイルの中で、素の比べ方をしている行 (1 始まり)。 */
export function rawKeyLines(src: string): number[] {
  const out: number[] = [];
  stripComments(src)
    .split('\n')
    .forEach((line, i) => {
      if (RAW_KEY.test(line)) out.push(i + 1);
    });
  return out;
}

describe('Enter / Escape を読む口は 1 つ (母集団は実装から)', () => {
  const files = ROOTS.flatMap(walk);

  it('走査は実物に当たる (歩いたファイルが 300 未満なら走査が死んでいる)', () => {
    expect(files.length).toBeGreaterThanOrEqual(300);
    expect(files).toContain(HOME);
  });

  it('★ keyIntent.ts の外に、Enter / Escape を素で比べる所が無い', () => {
    const problems: string[] = [];
    for (const f of files) {
      if (f === HOME || f in EXEMPT) continue;
      for (const line of rawKeyLines(readOriginalSource(path.join(REPO, f)))) problems.push(`${f}:${line}`);
    }
    expect(problems, `isSubmitEnter / isCancelEscape を通すこと:\n${problems.join('\n')}`).toEqual([]);
  });

  it('keyIntent.ts 自身は素の比べ方を持つ (針が的に当たる —— 無ければ針が死んでいる)', () => {
    expect(rawKeyLines(readOriginalSource(path.join(REPO, HOME))).length).toBeGreaterThanOrEqual(2);
  });

  it('keydown を読む画面が判定を通っている (12 か所の読み手)', () => {
    const readers = files.filter((f) =>
      /import \{[^}]*\b(?:isSubmitEnter|isCancelEscape)\b[^}]*\} from '[^']*keyIntent';/.test(
        stripComments(readOriginalSource(path.join(REPO, f))),
      ),
    );
    expect(readers.sort()).toEqual(
      [
        'src/renderer/App.tsx',
        'src/renderer/pages/BusinessPage.tsx',
        'src/renderer/pages/SettingsPage.tsx',
        'src/renderer/pages/StocksPage.tsx',
        'src/renderer/security/LockScreen.tsx',
      ].sort(),
    );
    const calls = readers
      .map((f) => stripComments(readOriginalSource(path.join(REPO, f))))
      .reduce((n, src) => n + (src.match(/\b(?:isSubmitEnter|isCancelEscape)\(e\)/g) ?? []).length, 0);
    expect(calls).toBe(12);
  });

  it('免除の台帳は両方向 (今日 0 件 —— 行を足すなら、そのファイルが実際に素で比べていること)', () => {
    for (const [f, why] of Object.entries(EXEMPT)) {
      expect(why.trim().length, `${f}: 理由が短い`).toBeGreaterThanOrEqual(30);
      expect(rawKeyLines(readOriginalSource(path.join(REPO, f))).length, `${f}: もう素で比べていない —— 台帳から外す`).toBeGreaterThan(0);
    }
    expect(Object.keys(EXEMPT)).toEqual([]);
  });
});

describe('針は標本に当たる (対照)', () => {
  it('★ 直す前の形はどれも当たる', () => {
    for (const s of [
      "if (e.key === 'Enter' && !advisorBusy) runAdvisor();",
      '} else if (e.key === "Escape") {',
      "if (e.key !== 'Enter') return;",
      "case 'Enter':",
      "if (['Enter', ' '].includes(e.key)) go();",
      'if (e.keyCode === 13) go();',
      'if (e.which == 27) close();',
      'if (13 === e.keyCode) go();',
      "if (e.key === 'NumpadEnter') go();",
    ]) {
      expect(RAW_KEY.test(s), s).toBe(true);
    }
  });

  it('判定を通した形・他のキー・注記の中は当たらない', () => {
    for (const s of ['if (isSubmitEnter(e) && !busy) save();', "if (e.key === ' ') go();", "if (e.key === 'ArrowDown') next();", 'const n = 13 + x;']) {
      expect(RAW_KEY.test(s), s).toBe(false);
    }
    expect(rawKeyLines("// e.key === 'Enter' を素で比べない\nconst x = 1;")).toEqual([]);
    expect(rawKeyLines("const x = 1;\nif (e.key === 'Enter') go();")).toEqual([2]);
  });
});

describe('isImeComposing / isSubmitEnter / isCancelEscape', () => {
  it('★ 変換中の 3 つの形 (React の nativeEvent・DOM の isComposing・Safari の 229) を変換中と読む', () => {
    expect(isImeComposing({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(true);
    expect(isImeComposing({ key: 'Enter', isComposing: true })).toBe(true);
    expect(isImeComposing({ key: 'Enter', keyCode: 229 })).toBe(true);
    expect(isImeComposing({ key: 'Enter', keyCode: 13, isComposing: false, nativeEvent: { isComposing: false } })).toBe(false);
    expect(isImeComposing({ key: 'Enter' })).toBe(false);
  });

  it('★ 変換中の Enter / Escape は送信・取り消しではない', () => {
    expect(isSubmitEnter({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
    expect(isSubmitEnter({ key: 'Enter', keyCode: 229 })).toBe(false);
    expect(isCancelEscape({ key: 'Escape', isComposing: true })).toBe(false);
    expect(isCancelEscape({ key: 'Escape', keyCode: 229 })).toBe(false);
  });

  it('変換していない Enter / Escape はそのまま読む。他のキーは読まない', () => {
    expect(isSubmitEnter({ key: 'Enter', keyCode: 13 })).toBe(true);
    expect(isSubmitEnter({ key: 'Enter' })).toBe(true);
    expect(isCancelEscape({ key: 'Escape', keyCode: 27 })).toBe(true);
    expect(isSubmitEnter({ key: 'Escape' })).toBe(false);
    expect(isCancelEscape({ key: 'Enter' })).toBe(false);
    expect(isSubmitEnter({ key: 'a' })).toBe(false);
  });

  // 実物の KeyboardEvent (jsdom) を React 越しに通す形は、画面の検査 2 本が持つ。
});
