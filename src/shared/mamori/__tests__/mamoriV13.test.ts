import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.13 —— 既存言語 (JavaScript / TypeScript) の脆弱性クラスを材料にした解析で見つけた 5 つの穴** (2026-11-02)。
 *
 * 言語の脆弱性解析 (JS/TS の既知のクラス × コンパイラ自身 × Rust/Wasm の検算役) を 3 つの別の担当で並行して回し、
 * 報告を受けて塞いだ。どの穴も「Mamori が受け入れた生成物 (TypeScript) に、検めを受けないコードや偽の印が残る」形。
 *
 *   T-250 型の綴りの中へ文を隠せた (`>=` が 1 つの字句で、括弧の深さを偽装できた)
 *   T-251 局所の名前が同名の gate / 関数を隠すと、偽の関数の戻り値に gate の印が付いた
 *   T-252 `extern pure global` の禁止表の取りこぼし (`open` / `setTimeout` ほか) と、`use … from "electron"` が自動で pure
 *   T-253 隠し字の表が BMP の一部だけ (ALM・SHY・タグ文字 U+E0000 台ほか)
 *   T-254 注記に `// @ts-ignore` を書けて、生成物の型検査を黙らせられた
 */

function diag(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const fn = (body: string): string => `export fn f(a: unknown) -> unknown {\n${body}\n  return a;\n}\n`;

describe('T-250 (threat: T-250): 型の綴りに文を隠せない', () => {
  it('★ `>=` で括弧の深さを偽装して型へ式を隠す形を断る', () => {
    const d = diag(fn('  let x: Array<Array<number>= []; fetch("https://e.example"), 1 > 2;'));
    expect(d.join('\n')).toMatch(/型の中に `>=` は置けません/);
  });
  it('★ 比較・代入・論理・算術の記号は型の中に置けない', () => {
    for (const sym of ['<=', '===', '&&', '||', '??', '+', '*', '=', '!', '->']) {
      expect(diag(fn(`  let x: Array<number ${sym} number> = [];`)).join('\n'), sym).toMatch(/型の中に `.+` は置けません|型が閉じていません|型の括弧が合いません/);
    }
  });
  it('★ 閉じ括弧の種類が合わない型を断る', () => {
    expect(diag(fn('  let x: Array<number] = [];')).join('\n')).toMatch(/型の括弧が合いません/);
    expect(diag(fn('  let x: { a: string > = [];')).join('\n')).toMatch(/型の括弧が合いません|型が閉じていません/);
  });
  it('★ `;` は `{ … }` の直下だけ (オブジェクト型の欄の区切り)。`Array<…;…>` は断る', () => {
    expect(diag(fn('  let x: Array<string; number> = [];')).join('\n')).toMatch(/型の中に `;` は置けません/);
  });
  it('対照: 普通の型は通る', () => {
    expect(diag(fn('  const a1: Array<string> = [];\n  const a2: { a: string; b: number } | null = null;\n  const a3: (x: number) => string | null = null;\n  const a4: Array<Array<number>> = [];'))).toEqual([]);
  });
});

describe('T-251 (threat: T-251): 局所の名前はモジュール直下の名前を隠せない', () => {
  const PRE = 'export vetted VU = "u";\nextern sink global shellx;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\nexport sink fn openIt(u: VU) -> void {\n  shellx.open(u);\n}\n';
  it('★ 同名の const で gate を偽る形を断る', () => {
    const d = diag(`${PRE}export fn attack(raw: string) -> void {\n  const okUrl = (x: string) => JSON.parse(x);\n  const u = okUrl(raw);\n  openIt(u);\n}\n`);
    expect(d.join('\n')).toMatch(/局所の名前 okUrl は、モジュール直下の同名の宣言/);
  });
  it('★ 引数・for の変数・arrow の引数・catch の束縛でも同じ', () => {
    for (const form of [
      'export fn a1(okUrl: string) -> void {\n  return;\n}\n',
      'export fn a2(xs: string[]) -> void {\n  for (const okUrl of xs) { return; }\n}\n',
      'export fn a3(raw: string) -> unknown {\n  return [raw].map((okUrl) => okUrl);\n}\n',
      'export fn a4(raw: string) -> unknown {\n  try { return JSON.parse(raw); } catch (okUrl) { return null; }\n}\n',
    ]) {
      expect(diag(PRE + form).join('\n'), form).toMatch(/局所の名前 okUrl は、モジュール直下の同名の宣言/);
    }
  });
  it('対照: 別の名前の局所は通る', () => {
    expect(diag(`${PRE}export fn ok(raw: string) -> void {\n  const u = okUrl(raw);\n  if (u !== null) { openIt(u); }\n}\n`)).toEqual([]);
  });
});

describe('T-252 (threat: T-252): extern pure の許可表', () => {
  it('★ 許可表に無い host は pure で宣言できない (open / setTimeout / postMessage / console / Buffer ほか)', () => {
    for (const name of ['open', 'setTimeout', 'setInterval', 'postMessage', 'alert', 'Image', 'Blob', 'structuredClone', 'Buffer', 'console', 'queueMicrotask']) {
      expect(diag(`extern pure global ${name};\n`).join('\n'), name).toMatch(/extern pure global .+ は宣言できません/);
    }
  });
  it('対照: 許可表の名前 (Date など) は宣言できる', () => {
    expect(diag('extern pure global Date;\nexport fn now() -> number {\n  return Date.now();\n}\n')).toEqual([]);
  });
  it('★ 機能を持つ module は use / extern pure で読めない (electron / child_process / node:vm)', () => {
    expect(diag('use { shell } from "electron";\n').join('\n')).toMatch(/electron はコード・OS・プロセス・網の口を持つ/);
    expect(diag('extern pure { exec } from "node:child_process";\n').join('\n')).toMatch(/node:child_process はコード・OS・プロセス・網の口を持つ/);
    expect(diag('use { runInNewContext } from "vm";\n').join('\n')).toMatch(/vm はコード・OS・プロセス・網の口を持つ/);
  });
  it('対照: 同じ module を extern sink で宣言するのは通る', () => {
    expect(diag('extern sink { shell } from "electron";\nexport vetted VU = "u";\nexport sink fn openIt(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n')).toEqual([]);
  });
});

describe('T-253 (threat: T-253): 隠し字の表 (見えない文を運べない)', () => {
  const chars: [string, string][] = [
    ['ALM U+061C', '؜'],
    ['SHY U+00AD', '­'],
    ['CGJ U+034F', '͏'],
    ['Hangul filler U+3164', 'ㅤ'],
    ['Hangul filler U+115F', 'ᅟ'],
    ['Braille blank U+2800', '⠀'],
    ['bidi 非推奨 U+206A', '⁪'],
    ['U+2065 (未割当の不可視)', '⁥'],
    ['タグ文字 U+E0041', '\u{E0041}'],
    ['異体字選択子の補助 U+E0100', '\u{E0100}'],
    ['Mongolian VS U+180B', '᠋'],
  ];
  it('★ ALM・SHY・タグ文字・Hangul filler・Braille・bidi 非推奨ほか 11 種の隠し字を、注記と文字列のどちらでも断る', () => {
    for (const [name, ch] of chars) {
      expect(diag(`// a${ch}b\nexport fn f() -> string {\n  return "x";\n}\n`).join('\n'), `${name} 注記`).toMatch(/裸で置けません/);
      expect(diag(`export fn f() -> string {\n  return "a${ch}b";\n}\n`).join('\n'), `${name} 文字列`).toMatch(/裸で置けません/);
    }
    expect(chars.length).toBe(11);
  });
  it('対照: ZWJ・ZWNJ・絵文字の異体字選択子 U+FE0F・全角空白・日本語は通る', () => {
    expect(diag('// 日本語の注記 　 ⚠️ 👨‍👩\n// a‌b\nexport fn f() -> string {\n  return "x";\n}\n')).toEqual([]);
  });
});

describe('T-254 (threat: T-254): 注記で型検査を黙らせられない', () => {
  it('★ `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` を断る', () => {
    for (const d of ['@ts-ignore', '@ts-expect-error', '@ts-nocheck', '@ts-check']) {
      expect(diag(`export fn f(a: unknown) -> unknown {\n  // ${d}\n  return a;\n}\n`).join('\n'), d).toMatch(/注記に `@ts-…` の指示は書けません/);
    }
  });
  it('対照: 普通の注記・Stryker の指示は通る', () => {
    expect(diag('export fn f(a: unknown) -> unknown {\n  // Stryker disable next-line ConditionalExpression: 等価\n  // ts の話をしても @ だけなら通る\n  return a;\n}\n')).toEqual([]);
  });
});
