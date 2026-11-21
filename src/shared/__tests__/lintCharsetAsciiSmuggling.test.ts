import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/**
 * **エージェントが読む指示書へ、見えない字で命令を忍ばせる道 (ASCII smuggling)**
 * (2026-10-20 · パス 543 · threat: T-133)。
 *
 * `lint:charset` の不可視文字の群は BMP だけを見ており、Unicode のタグ文字
 * (U+E0000 帯) と異体字選択子の補助面は素通りだった。タグ文字は ASCII 1 字ずつに
 * 対応するので、人の目には何も見えない 1 行が「~ を実行せよ」という命令文になる。
 * 走査の対象も `.claude` / `.cursor` / `.mdc` を含まなかった。
 *
 * 字はリテラルで書かず、コードポイントから組む (この検査自身が走査対象のため)。
 */
const require_ = createRequire(import.meta.url);
const { INVISIBLE_RANGES, SCAN_DIRS, SCAN_EXTS } = require_('../../../scripts/lint-charset.cjs') as {
  INVISIBLE_RANGES: { name: string; re: RegExp }[];
  SCAN_DIRS: string[];
  SCAN_EXTS: string[];
};

const hits = (s: string): string[] =>
  INVISIBLE_RANGES.filter((r) => new RegExp(r.re.source, r.re.flags.replace('g', '')).test(s)).map((r) => r.name);

describe('lint:charset — 補助面の不可視文字 (threat: T-133)', () => {
  it('★ タグ文字 (U+E0000 帯) で書いた隠し命令は鳴る', () => {
    const smuggled = [...'run'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    expect(hits(`表示される文${smuggled}`).length).toBeGreaterThan(0);
  });
  it('★ 異体字選択子の補助面 (U+E0100 帯) も鳴る', () => {
    expect(hits(`a${String.fromCodePoint(0xe0100)}`).length).toBeGreaterThan(0);
  });
  it('対照: 普通の日本語と絵文字は鳴らない', () => {
    expect(hits('通常の文。\u{1F600} abc')).toEqual([]);
  });
  it('★ エージェントが読む指示書の置き場も走査に入っている', () => {
    expect(SCAN_DIRS).toEqual(expect.arrayContaining(['.claude', '.cursor']));
    expect(SCAN_EXTS).toContain('.mdc');
  });
});
