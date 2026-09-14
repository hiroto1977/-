/**
 * **天井の写しを数える走査は在った。数えていなかったのは「単位」である。** (2026-09-14 · パス 252)
 *
 * ## 隣の走査の死角
 *
 * `ceilingLiteralCensus.test.ts` (パス 174) は `.slice(0, 200)` のように**天井の数を
 * 字面で写した**箇所を数える。だから `text.slice(0, MAX_MEMBER_NOTE_CHARS)` は
 * 「定数を読んでいる」ので**合格**になる —— 数は 1 つなので、走査としては正しい。
 *
 * しかしパス 195 が決めたのは数の話ではなかった:
 *
 * > **述べる数と、守る数と、切る位置は、同じ単位で数えなければならない。**
 *
 * `.slice(0, MAX_…_CHARS)` は**定数を正しく読んだうえで、コード単位で切る**。
 * 数の走査には掛からず、単位だけが割れている。実測 (2026-09-14) で 3 家系:
 *
 * | 場所 | 直す前 | 実測した結果 |
 * | --- | --- | --- |
 * | `main/clients/assistant.ts` ×2 | `system.slice(0, MAX_SYSTEM)` | 60,000 字目が絵文字だと末尾が**孤立サロゲート** (`isWellFormed()` が false・`JSON.stringify` は `\ud83d` を本文に載せる)。絵文字 50,000 字の system で main は **30,000 字**・ブラウザ版は **50,000 字**を送っていた (同じ定数・違う単位)。同じ関数の 40 行上は既に `clampToCeiling` |
 * | `security/vault.ts` `meetsPasswordPolicy` (+ 写し 2 つ) | `password.length >= MIN_PASSWORD_LENGTH` | 画面と例外が 9 か所で「12 文字以上」と述べるのに `'😀'.repeat(6)` (実文字数 **6**) が通る —— **宣言した床の半分**。同じファイルの `setToken` は既に `countChars` |
 * | `security/vault.ts` 上限 ×3 | `password.length > 256` | 実文字数 200 の絵文字パスワードを「256 字以内」と述べながら**断って**いた (安全側だが宣言と食い違う) |
 *
 * 床の側が厄介なのは**向き**である。天井をコード単位で切ると「切り過ぎ + 壊れた文字列」
 * になるが、床をコード単位で数えると**緩む** —— 同じ 1 つの単位の食い違いが、
 * 向きによって害を変える。
 *
 * ## この走査が数えるもの
 *
 * 「**文字で数えると宣言した定数**が、`.length` の比較か `.slice(` の引数に現れる」
 * 箇所。母集団であって欠陥の一覧ではない —— 正しい例外 (バイト数を測る所) は
 * 理由つきの台帳に載せる。台帳は**双方向**: 実物から消えた行も鳴る。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripNonCode } from './stripNonCode';

const SRC = path.resolve(__dirname, '../..');

/**
 * 名前が単位を宣言していない「文字の定数」。
 *
 * 規則は「`_CHARS` で終わる名前は文字で数える」だが、`MIN_PASSWORD_LENGTH` は
 * 2026-07 に付いた名前で `LENGTH` と言う。**画面と例外は 9 か所で「文字」と述べる**
 * ので、単位は文字である。名前を変えると保存済みの参照 (文書・検査) が散るので、
 * ここに理由つきで載せる。
 */
const CHAR_UNIT_ALIASES: Readonly<Record<string, string>> = {
  MIN_PASSWORD_LENGTH: '画面 (LockScreen / SettingsPage の placeholder) と例外 3 本・バックアップの断り 2 本が「12 文字以上」と述べる。単位は文字',
};

/** `.length` / `.slice(` と組んでよい理由つきの例外。`<file>:<定数>` → 理由。 */
const EXEMPT: Readonly<Record<string, string>> = {};

/** src 配下の実装 (検査は除く)。 */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') out.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/** 文字で数えると宣言した定数の名前 (`_CHARS` で終わる物 + 別名の台帳)。 */
export function charUnitConstants(files: readonly string[]): string[] {
  const names = new Set<string>(Object.keys(CHAR_UNIT_ALIASES));
  for (const f of files) {
    for (const m of readOriginalSource(f).matchAll(
      /export const ([A-Z][A-Z0-9_]*_CHARS)\s*(?::\s*number\s*)?=/g,
    )) {
      names.add(m[1]!);
    }
  }
  return [...names].sort();
}

/**
 * **ファイルの中で付け替えられた別名を辿る。** (2026-09-14 · パス 252 の対照で見つけた)
 *
 * 最初の版は `_CHARS` で終わる名前と台帳の別名だけを見ていた。ところが
 * `main/clients/assistant.ts` は `const MAX_SYSTEM = MAX_ASSISTANT_SYSTEM_CHARS;` と
 * **局所名に付け替えてから**使う (`atlassian.ts` も `MAX_EMAIL` などで同じ形)。
 * 対照で直した所を壊してみたら、**走査は鳴らなかった** —— 綴りで数える走査の、
 * この一日で 6 度目の死角である。1 段の別名を辿る (別名の別名は実測 0 件)。
 */
export function withLocalAliases(src: string, names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const code = stripNonCode(src);
  const out = new Set(names);
  const alt = names.join('|');
  for (const m of code.matchAll(new RegExp(String.raw`\bconst ([A-Z][A-Z0-9_]*)\s*=\s*(${alt})\s*;`, 'g'))) {
    out.add(m[1]!);
  }
  return [...out];
}

/** コード単位で数え・切っている箇所 (コメントと文字列は落としてから見る)。 */
export function codeUnitUses(src: string, given: readonly string[]): { name: string; line: number; how: string }[] {
  if (given.length === 0) return [];
  const names = withLocalAliases(src, given);
  const code = stripNonCode(src);
  const alt = names.join('|');
  const out: { name: string; line: number; how: string }[] = [];
  const at = (index: number): number => code.slice(0, index).split('\n').length;
  // `x.length > MAX_…` / `x.length >= MAX_…` (と逆順)
  for (const m of code.matchAll(new RegExp(String.raw`\.length\s*[<>]=?\s*(${alt})\b`, 'g'))) {
    out.push({ name: m[1]!, line: at(m.index), how: '.length との比較' });
  }
  for (const m of code.matchAll(new RegExp(String.raw`\b(${alt})\s*[<>]=?\s*[A-Za-z_$][\w.$]*\.length\b`, 'g'))) {
    out.push({ name: m[1]!, line: at(m.index), how: '.length との比較 (逆順)' });
  }
  // `x.slice(0, MAX_…)` / `x.substring(0, MAX_…)`
  for (const m of code.matchAll(new RegExp(String.raw`\.(?:slice|substring)\(\s*0\s*,\s*(${alt})\b`, 'g'))) {
    out.push({ name: m[1]!, line: at(m.index), how: 'コード単位で切る' });
  }
  return out;
}

describe('天井と床の単位 — 文字の定数をコード単位で扱っていない (パス 252)', () => {
  const files = sourceFiles();
  const names = charUnitConstants(files);

  const found: { key: string; where: string; how: string }[] = [];
  let goodUses = 0;
  for (const file of files) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const src = readOriginalSource(file);
    for (const u of codeUnitUses(src, names)) {
      found.push({ key: `${rel}:${u.name}`, where: `${rel}:${u.line}`, how: u.how });
    }
    // 正しい綴り (文字で数える / 文字境界で切る) の件数 —— 走査の生存を測る床。
    const code = stripNonCode(src);
    const alt = withLocalAliases(src, names).join('|');
    if (names.length > 0) {
      for (const _m of code.matchAll(
        new RegExp(String.raw`(?:countChars|clampToCeiling|charsOverCeiling|atLeastChars|moreThanChars)\([^)]*\b(?:${alt})\b`, 'g'),
      )) {
        goodUses += 1;
      }
    }
  }

  it('★ 走査が実物に当たる (文字の定数と、正しい綴りの両方が見つかる)', () => {
    // 床は「違反の件数」ではなく走査そのものに置く (パス 174 と同じ理由)。
    expect(names.length, '文字で数えると宣言した定数が見つからない').toBeGreaterThanOrEqual(10);
    expect(names, 'MIN_PASSWORD_LENGTH が台帳から落ちた').toContain('MIN_PASSWORD_LENGTH');
    expect(goodUses, '正しい綴りが 1 つも見つからない (走査かコメント落としが死んでいる)').toBeGreaterThanOrEqual(10);
  });

  it('★ 文字の定数を .length / .slice と組んでいない (例外は理由つきの台帳のみ)', () => {
    const bad = found.filter((f) => !(f.key in EXEMPT)).map((f) => `${f.where} ${f.how} (${f.key.split(':')[1]})`);
    expect(bad, '文字で数える定数をコード単位で扱っている — countChars / clampToCeiling / atLeastChars / moreThanChars を通す').toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (直った行が残っていない)', () => {
    const keys = new Set(found.map((f) => f.key));
    expect(Object.keys(EXEMPT).filter((k) => !keys.has(k)), '台帳の古い行').toEqual([]);
  });

  it('★ 別名の台帳に理由が書かれている', () => {
    for (const [name, why] of Object.entries(CHAR_UNIT_ALIASES)) {
      expect(why.length, `${name}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 対照: 直す前の 3 家系の綴りを、走査が実際に掴む', () => {
    const samples: readonly (readonly [string, string])[] = [
      ['main の system プロンプト', "const sys = typeof system === 'string' ? system.slice(0, MAX_ASSISTANT_SYSTEM_CHARS) : '';"],
      ['床 (パスワード)', 'return password.length >= MIN_PASSWORD_LENGTH;'],
      ['上限 (パスワード)', 'if (password.length > MAX_PASSWORD_CHARS) throw new Error("long");'],
      ['逆順の比較', 'if (MAX_TOKEN_CHARS < token.length) return null;'],
      ['substring の綴り', 'const head = note.substring(0, MAX_MEMBER_NOTE_CHARS);'],
      // **局所名への付け替え** —— これを見ていなかったので対照が鳴らなかった。
      [
        '局所名に付け替えた天井 (main/clients/assistant.ts の形)',
        'const MAX_SYSTEM = MAX_ASSISTANT_SYSTEM_CHARS;\nconst sys = system.slice(0, MAX_SYSTEM);',
      ],
      [
        '局所名に付け替えた天井で .length を比べる (atlassian.ts の形)',
        'const MAX_TOKEN = MAX_TOKEN_CHARS;\nif (obj.token.length > MAX_TOKEN) return null;',
      ],
    ];
    const probe = ['MIN_PASSWORD_LENGTH', 'MAX_PASSWORD_CHARS', 'MAX_ASSISTANT_SYSTEM_CHARS', 'MAX_TOKEN_CHARS', 'MAX_MEMBER_NOTE_CHARS'];
    for (const [label, sample] of samples) {
      expect(codeUnitUses(sample, probe).length, `${label} を掴めていない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('★ 対照: 正しい綴りとコメント・文字列の中は掴まない', () => {
    const probe = ['MIN_PASSWORD_LENGTH', 'MAX_ASSISTANT_SYSTEM_CHARS'];
    const ok = [
      'return atLeastChars(password, MIN_PASSWORD_LENGTH);',
      'const sys = clampToCeiling(system, MAX_ASSISTANT_SYSTEM_CHARS);',
      'if (countChars(token) > MAX_ASSISTANT_SYSTEM_CHARS) return null;',
      '// password.length >= MIN_PASSWORD_LENGTH と書いてあった',
      '/* system.slice(0, MAX_ASSISTANT_SYSTEM_CHARS) は昔の形 */',
      "const s = 'x.length > MIN_PASSWORD_LENGTH';",
      // 配列の長さは単位の話ではない (同じ名前は文字の定数に付かないが、綴りとして確かめる)
      'if (rows.length > MAX_ADVICE_ROWS) return null;',
      // 別名を辿っても、正しい綴りは掴まない。
      'const MAX_SYSTEM = MAX_ASSISTANT_SYSTEM_CHARS;\nconst sys = clampToCeiling(system, MAX_SYSTEM);',
    ].join('\n');
    expect(codeUnitUses(ok, probe), '正しい綴りかコメント・文字列を掴んでいる').toEqual([]);
  });

  it('★ パス 252 で直した 3 家系が、いま正しい綴りを読む', () => {
    const wiring: readonly (readonly [string, string])[] = [
      ['main/clients/assistant.ts', 'clampToCeiling(system, MAX_SYSTEM)'],
      ['renderer/security/vault.ts', 'atLeastChars(password, MIN_PASSWORD_LENGTH)'],
      ['renderer/security/vault.ts', 'moreThanChars(password, MAX_PASSWORD_CHARS)'],
      // 下限の規則は 1 か所だけ —— 写しは式ごと関門を読む。
      ['renderer/data/backup.ts', 'meetsPasswordPolicy(password)'],
      ['renderer/pages/SettingsPage.tsx', 'meetsPasswordPolicy(newPw)'],
    ];
    for (const [rel, expected] of wiring) {
      expect(readOriginalSource(path.join(SRC, rel)), `${rel} が ${expected} を読んでいない`).toContain(expected);
    }
  });
});
