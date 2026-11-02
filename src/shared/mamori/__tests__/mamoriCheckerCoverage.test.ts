import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';
import type { MamoriDiagnostic } from '../checker';

/*
 * **規則が式・文のどこに置かれても効くこと** (2026-10-30 · パス 560 続き · threat: T-221)。
 *
 * 変異検査 (Stryker · checker.ts) を初めて当てると **73.14% / 生存 89 + 未到達 5** だった。生存の大半は、
 * 検査器が式と文を辿る枝 (if の then / else・try / catch・単項・二項・new・配列・arrow・引数の既定値・
 * 定数の初期値) を**どの検査も通っていなかった**こと —— `mamoriRules.test.ts` は規則ごとに破るプログラムを
 * 当てるが、破る所はいつも関数本体の `return` の直下だった。辿る枝を 1 つ消しても、その位置に置いた
 * 危ない口は**黙って変換を通る**。だからここでは、同じ違反 (plain 関数から extern sink を参照する = M2) を
 * 置ける位置すべてへ置き、どこでも M2 がちょうど 1 件・正しい場所で出ることを見る。
 *
 * 誤りの文 (利用者が直す手掛かり) も 1 字ずつ留める —— 文が空でも規則の番号は合うので、番号だけを見る
 * 検査では文を壊す変異体が生き残っていた。
 */

const VETTED = 'export vetted VettedUrl = "url";\n';
const SINK = 'extern sink { shell } from "electron";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const GATE = 'export gate fn urlOrNull(x: unknown) -> VettedUrl | null {\n  if (typeof x !== \'string\') {\n    return null;\n  }\n  return mint VettedUrl(x);\n}\n';
const EXTERN = 'extern sink { shell } from "electron";\n';

function diags(...sources: string[]): readonly MamoriDiagnostic[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics;
}
const rules = (...s: string[]): string[] => diags(...s).map((d) => d.rule);
/** plain 関数の本体に `body` を置く (`★` の印は M2 を起こす `shell` の位置)。 */
const plainFn = (body: string): string => `${EXTERN}export fn f(x: string, y: boolean) -> unknown {\n${body}\n  return null;\n}\n`;

describe('M2 はどの位置でも効く (検査器が式と文を辿りきる)', () => {
  const POSITIONS: readonly [string, string][] = [
    ['if の条件', '  if (shell) {\n    return 1;\n  }'],
    ['if の then', '  if (y) {\n    shell.beep();\n  }'],
    ['if の else', '  if (y) {\n    return 1;\n  } else {\n    shell.beep();\n  }'],
    ['else if', '  if (y) {\n    return 1;\n  } else if (shell) {\n    return 2;\n  }'],
    ['try の本体', '  try {\n    shell.beep();\n  } catch {\n    return 1;\n  }'],
    ['catch の本体', '  try {\n    return 1;\n  } catch {\n    shell.beep();\n  }'],
    ['let の初期値', '  const z = shell;'],
    ['代入の右辺', '  let z = 1;\n  z = shell;'],
    ['式の文', '  shell.beep();'],
    ['return の値', '  return shell;'],
    ['単項 (!) の中', '  const z = !shell;'],
    ['単項 (typeof) の中', '  const z = typeof shell;'],
    ['二項の左', '  const z = shell === 1;'],
    ['二項の右', '  const z = 1 === shell;'],
    ['new の呼ぶ側', '  const z = new shell();'],
    ['new の引数', '  const z = new URL(shell);'],
    ['配列の要素', '  const z = [1, shell];'],
    ['メンバの左', '  const z = shell.x;'],
    ['arrow の本体', '  const z = (a) => shell;'],
    ['呼び出しの引数', '  const z = String(shell);'],
    ['呼び出しの呼ぶ側', '  const z = shell();'],
  ];
  for (const [where, body] of POSITIONS) {
    it(`★ ${where}`, () => {
      const ds = diags(plainFn(body));
      expect(ds.map((d) => d.rule), `${where} に置いた shell が見逃された`).toEqual(['M2']);
      expect(ds[0]!.message).toBe('危ない口 shell (extern sink) は sink 関数の中でだけ使えます');
      // 場所は shell の綴りそのものを指す (行は関数の本体の中)
      expect(ds[0]!.line).toBeGreaterThanOrEqual(3);
    });
  }

  it('★ 引数の既定値 (fn f(x = shell))', () => {
    expect(rules(`${EXTERN}export fn f(x: unknown = shell) -> void {\n  return;\n}\n`)).toEqual(['M2']);
  });

  it('★ 定数の初期値の奥 (配列の中)', () => {
    expect(rules(`${EXTERN}export const W: unknown = [shell];\n`)).toEqual(['M2']);
  });

  it('★ sink 関数の引数の既定値でも、危ない口を値として持ち出せない (0.3 · T-225) —— 役割は関数の役割なので「呼ぶ形でしか」の文になる', () => {
    const ds = diags(`${VETTED}${EXTERN}export sink fn s(u: VettedUrl, b: unknown = shell) -> void {\n  return;\n}\n`);
    expect(ds.map((d) => d.rule)).toEqual(['M2']);
    expect(ds[0]!.message).toContain('sink 関数の中でも呼ぶ形');
  });

  it('対照: arrow の引数が外の口と同じ名前なら断る (T-251 · 局所の名前は外の宣言を隠せない)', () => {
    expect(rules(plainFn('  const z = (shell) => shell;'))).toEqual(['M6']);
  });

  it('対照: 注記の文は何も検めない', () => {
    expect(rules(plainFn('  // shell と書いても注記は名前ではない'))).toEqual([]);
  });
});

describe('来歴 (provenance) は式の形ごとに正しく運ばれる', () => {
  it('★ gate の中で mint した値は、印の型の変数へ入れられる', () => {
    expect(rules(VETTED + 'export gate fn g(x: string) -> VettedUrl {\n  const u: VettedUrl = mint VettedUrl(x);\n  return u;\n}\n')).toEqual([]);
  });

  it('★ await した関門の戻り値は印を運ぶ', () => {
    expect(rules(VETTED + GATE + SINK + 'export fn go(x: unknown) -> Promise<void> {\n  const u = await urlOrNull(x);\n  return openUrl(u);\n}\n')).toEqual([]);
  });

  it('★ await した素の値は印を運ばない', () => {
    expect(rules(VETTED + SINK + 'export fn go(x: string) -> Promise<void> {\n  return openUrl(await x);\n}\n')).toEqual(['M4']);
  });

  it('★ typeof / ! は印を運ばない (印つきの値に掛けても)', () => {
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl) -> Promise<void> {\n  return openUrl(typeof u);\n}\n')).toEqual(['M4']);
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl) -> Promise<void> {\n  return openUrl(!u);\n}\n')).toEqual(['M4']);
  });

  it('★ 印つきの値のメンバは印を運ばない', () => {
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl) -> Promise<void> {\n  return openUrl(u.x);\n}\n')).toEqual(['M4']);
  });

  it('★ 外形を持たない関数 (extern pure) の戻り値は印を運ばない —— 投げずに断る', () => {
    expect(rules(VETTED + SINK + 'extern pure { lower } from "./lower";\nexport fn go(x: string) -> Promise<void> {\n  return openUrl(lower(x));\n}\n')).toEqual(['M4']);
  });

  it('★ メンバを呼んだ戻り値は印を運ばない', () => {
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl) -> Promise<void> {\n  return openUrl(u.trim());\n}\n')).toEqual(['M4']);
  });

  it('★ 宣言していない名前を sink へ渡すと M6 と M4 を返す (投げない)', () => {
    expect(rules(VETTED + SINK + 'export fn go() -> Promise<void> {\n  return openUrl(nope);\n}\n')).toEqual(['M6', 'M4']);
  });

  it('★ arrow の引数の印の型は、arrow の中で印を運ぶ', () => {
    expect(rules(VETTED + SINK + 'export fn go() -> unknown {\n  return (u: VettedUrl) => openUrl(u);\n}\n')).toEqual([]);
  });

  it('★ 型の無い let でも、関門の戻り値の印を運ぶ (印を持たない値と取り違えない)', () => {
    expect(rules(VETTED + GATE + SINK + 'export fn go(x: unknown) -> Promise<void> {\n  const u = urlOrNull(x);\n  const v = u;\n  return openUrl(v);\n}\n')).toEqual([]);
  });

  it('★ 印の型の let を初期値なしで宣言するのは通る (入れる値が無いので M4 ではない)', () => {
    expect(rules(VETTED + 'export fn go() -> void {\n  let u: VettedUrl;\n  return;\n}\n')).toEqual([]);
  });

  it('★ 型の無い let に素の値を入れるのは通る', () => {
    expect(rules('export fn go(x: string) -> void {\n  const v = x;\n  return;\n}\n')).toEqual([]);
  });
});

describe('M5 / M6 の代入', () => {
  it('★ 印の無い変数へ印つきの値を代入するのは通る (洗浄ではない)', () => {
    expect(rules(VETTED + GATE + 'export fn f(x: unknown) -> void {\n  let y = \'a\';\n  y = urlOrNull(x);\n  return;\n}\n')).toEqual([]);
  });

  it('★ 引数への代入は断る (0.2 · パス 563 —— 0.1 は通して tsc にも任せていなかった。引数は let ではない)', () => {
    expect(rules('export fn f(x: string) -> void {\n  x = \'a\';\n  return;\n}\n')).toEqual(['M6']);
  });

  it('★ use で引いた名前へは代入できない', () => {
    const ds = diags('use { join } from "node:path";\nexport fn f() -> void {\n  join = 1;\n  return;\n}\n');
    expect(ds.map((d) => [d.rule, d.message])).toEqual([['M6', '外の名前 join へは代入できません']]);
  });

  it('★ use default で引いた名前も同じ (宣言した名前として引ける・代入はできない)', () => {
    expect(rules('use default path from "node:path";\nexport fn f() -> unknown {\n  return path;\n}\n')).toEqual([]);
    expect(rules('use default path from "node:path";\nexport fn f() -> void {\n  path = 1;\n  return;\n}\n')).toEqual(['M6']);
  });

  it('★ extern で宣言した名前へも代入できない', () => {
    expect(rules('extern pure { join } from "node:path";\nexport fn f() -> void {\n  join = 1;\n  return;\n}\n')).toEqual(['M6']);
  });
});

describe('誤りの文 (利用者が直す手掛かり) を 1 字ずつ留める', () => {
  const msg = (...s: string[]): string[] => diags(...s).map((d) => `[${d.rule}] ${d.message}`);

  it('M1: 宣言していない印・gate の外・名乗らない戻り値', () => {
    expect(msg(VETTED + 'export gate fn g(x: string) -> VettedUrl {\n  return mint Nope(x);\n}\n')).toEqual(['[M1] mint Nope: そんな印は宣言されていません']);
    expect(msg(VETTED + 'export fn g(x: string) -> string {\n  return mint VettedUrl(x);\n}\n')).toEqual([
      '[M1] 印 VettedUrl を作れるのは gate 関数の中だけです (関門を通らずに印を付けると、印の意味が無くなる)',
    ]);
    expect(msg('export vetted A = "a";\nexport vetted B = "b";\nexport gate fn g(x: string) -> A {\n  return mint B(x);\n}\n')).toEqual([
      '[M1] この gate 関数の戻り値は印 B を名乗っていません (作った印を外へ出せない)',
    ]);
  });

  it('M3: 引数の無い sink・型の無い行き先・素の型の行き先', () => {
    expect(msg('export sink fn s() -> void {\n  return;\n}\n')).toEqual(['[M3] sink 関数 s に行き先の引数がありません (第 1 引数を印の型で受けます)']);
    expect(msg(VETTED + 'export sink fn s(u) -> void {\n  return;\n}\n')).toEqual([
      '[M3] sink 関数 s の行き先 u (第 1 引数) は印の型 1 つで受けます (在ったのは 型なし) —— 素の値を行き先に受ける危ない口は作れません',
    ]);
    expect(msg(VETTED + 'export sink fn s(u: string) -> void {\n  return;\n}\n')).toEqual([
      '[M3] sink 関数 s の行き先 u (第 1 引数) は印の型 1 つで受けます (在ったのは `string`) —— 素の値を行き先に受ける危ない口は作れません',
    ]);
  });

  it('★ M3: 関数の名前を型に書いても印の型にはならない (印の表は vetted 宣言だけから作る)', () => {
    expect(rules(VETTED + 'export fn helper() -> void {\n  return;\n}\nexport sink fn s(u: helper) -> void {\n  return;\n}\n')).toEqual(['M3']);
  });

  it('M4: 印の型の変数・引数の印', () => {
    expect(msg(VETTED + 'export fn f(x: string) -> void {\n  const u: VettedUrl = x;\n  return;\n}\n')).toEqual(['[M4] u は印 VettedUrl の型ですが、入れる値は印を持ちません']);
    expect(msg(VETTED + SINK + 'export fn go(x: string) -> Promise<void> {\n  return openUrl(x);\n}\n')).toEqual([
      '[M4] openUrl の引数 1 は印 VettedUrl を持つ値だけを受けます (渡したのは印の無い値)',
    ]);
    expect(msg('export vetted VettedUrl = "url";\nexport vetted VettedPath = "path";\n' + SINK + 'export fn go(p: VettedPath) -> Promise<void> {\n  return openUrl(p);\n}\n')).toEqual([
      '[M4] openUrl の引数 1 は印 VettedUrl を持つ値だけを受けます (渡したのは印 VettedPath)',
    ]);
  });

  it('M5: 印の洗浄', () => {
    expect(msg(VETTED + GATE + 'export fn f(x: unknown) -> void {\n  let u = urlOrNull(x);\n  u = \'x\';\n  return;\n}\n')).toEqual([
      '[M5] 印 VettedUrl を持つ u を、印の無い値で上書きしています (印の洗浄)',
    ]);
  });

  it('M6: 宣言していない名前・代入・2 つの export', () => {
    expect(msg('export fn f() -> unknown {\n  return fetch;\n}\n')).toEqual([
      '[M6] 宣言していない名前 fetch —— 外の値は `use` / `extern` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)',
    ]);
    expect(msg('export fn f() -> void {\n  nope = 1;\n  return;\n}\n')).toEqual(['[M6] 宣言していない名前 nope へ代入しています']);
    expect(msg('export fn f() -> void {\n  return;\n}\n', 'export fn f() -> void {\n  return;\n}\n')).toEqual([
      '[M6] 関数 f が 2 つのモジュールで export されています (名前で引くので 1 つにする)',
    ]);
  });
});

describe('compileProject の順序', () => {
  it('★ 構文の誤りが 1 つでも在れば、来歴の検査は走らず M0 だけを返す', () => {
    // 2 つ目のモジュールには M6 が在るが、構文の段で止まるので並べない (壊れた木を検査すると、
    // 壊れたモジュールの名前が引けないことによる誤った M6 / M4 が混ざる)
    expect(rules('export fn f( -> void {}\n', 'export fn g() -> unknown {\n  return fetch;\n}\n')).toEqual(['M0']);
  });
});

describe('変異検査が教えた残りの形 (2 回目の測定)', () => {
  it('★ mint の中の値も検める (gate の中でも宣言していない名前は使えない)', () => {
    expect(rules(VETTED + 'export gate fn g() -> VettedUrl {\n  return mint VettedUrl(fetch);\n}\n')).toEqual(['M6']);
  });

  it('★ 印を受けない引数へは、印つきの値を渡しても通る (行き先でない引数は送る中身)', () => {
    expect(rules(VETTED + 'export sink fn write(u: VettedUrl, body: unknown) -> void {\n  return;\n}\nexport fn go(u: VettedUrl) -> void {\n  return write(u, u);\n}\n')).toEqual([]);
  });

  it('★ 印を受ける引数を渡さない呼び出しは M4 で断る (0.4 · T-238 —— 以前は「数は tsc に任せる」と素通りさせていた)・投げない', () => {
    expect(rules(VETTED + SINK + 'export fn go() -> Promise<void> {\n  return openUrl();\n}\n')).toEqual(['M4']);
  });

  it('★ 印の名前は値ではない (宣言していない名前として断る)', () => {
    expect(rules(VETTED + 'export fn f() -> unknown {\n  return VettedUrl;\n}\n')).toEqual(['M6']);
  });

  it('★ このモジュールの定数・関数の名前への代入は M6 (0.2 · パス 563 —— 0.1 は tsc に任せ、Mamori の規則には無かった)', () => {
    expect(rules('export const C: number = 1;\nexport fn f() -> void {\n  C = 2;\n  return;\n}\n')).toEqual(['M6']);
    expect(rules('export fn g() -> void {\n  return;\n}\nexport fn f() -> void {\n  g = 2;\n  return;\n}\n')).toEqual(['M6']);
  });

  it('★ 単項の - も印を運ばない', () => {
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl) -> Promise<void> {\n  return openUrl(-u);\n}\n')).toEqual(['M4']);
  });

  it('★ 印つきの値を二項の式に入れると印は落ちる (u ?? x も印を持たない)', () => {
    expect(rules(VETTED + SINK + 'export fn go(u: VettedUrl, x: string) -> Promise<void> {\n  return openUrl(u ?? x);\n}\n')).toEqual(['M4']);
  });
});
