import { describe, expect, it } from 'vitest';
import type { Expr, Pos } from '../ast';
import { compileProject, formatDiagnostic } from '../compile';
import { parse } from '../parser';

/*
 * **Mamori 0.49 —— 構築子の名前についての断りは、名前の頭を指す** (2026-11-17 · MG-089 · 穴ではなく、断りの場所を直す周)。
 *
 * `new 名前(…)` の構文木は、構築子の名前の場所を持つ。0.48 までの parser は、名前を読んだ**後**の字句の場所を付けていた
 * (`{ name: ident(), pos: peek().pos }` —— 物の字面は左から評価されるので、`ident()` が先に進めてから `peek()` していた)。
 * その場所を使う断り —— 宣言していない名前・同じブロックの宣言より前の使用 (0.45)・直下の宣言より前の使用 (0.46 / 0.47)・
 * sink の外で使った危ない口 (M2) —— は、名前の直後の字句 (`(` / `<` / `.`) を指していた。名前の後で改行すると、**次の行**を指す。
 * 0.49 は、名前を読む前の場所を取る。受け入れる集合も、断りの文も、生成物も変わらない —— 変わるのは場所だけである。
 */

function compile(source: string): { ok: boolean; diagnostics: string[] } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic) };
}

const at = (pos: readonly [number, number], message: string): string => `src/x/m0.mamori:${pos[0]}:${pos[1]}: ${message}`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const BEFORE = (name: string): string =>
  `[M6] 局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
const EARLY = (name: string): string =>
  `[M6] モジュール直下の名前 ${name} を、宣言より前で使っています —— 直下の const / let / クラスは書いた順に作られ、宣言の文に届く前に読むと読み込みの時点で投げます (使う宣言を先に置くか、関数・arrow の中から使います)`;
const SINK_OUTSIDE = (name: string): string => `[M2] 危ない口 ${name} (extern sink) は sink 関数の中でだけ使えます`;

/** 断る形: Mamori の綴り・構築子の名前 (メンバの連なりなら先頭の名前)・断りの場所・0.48 までの場所・断りの文。 */
interface Refused {
  readonly mamori: string;
  readonly name: string;
  readonly at: readonly [number, number];
  readonly was: readonly [number, number];
  readonly message: string;
}

/** 構築子の名前の場所を使う断り (2026-11-17 の実測 —— `was` は 0.48 の parser で同じ綴りを測った場所)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  '宣言していない名前を構築する': { mamori: 'export fn t() -> number {\n  const v = new Nope();\n  return 0;\n}\n', name: 'Nope', at: [2, 17], was: [2, 21], message: UNDECLARED('Nope') },
  '宣言していない名前を構築する (名前の後で改行)': { mamori: 'export fn t() -> number {\n  const v = new Nope\n    ("x");\n  return 0;\n}\n', name: 'Nope', at: [2, 17], was: [3, 5], message: UNDECLARED('Nope') },
  '宣言していない名前を構築する (型引数つき)': { mamori: 'export fn t() -> number {\n  const v = new Nope<number>();\n  return 0;\n}\n', name: 'Nope', at: [2, 17], was: [2, 21], message: UNDECLARED('Nope') },
  '宣言していない名前のメンバを構築する': { mamori: 'export fn t() -> number {\n  const v = new nope.inner.Thing();\n  return 0;\n}\n', name: 'nope', at: [2, 17], was: [2, 21], message: UNDECLARED('nope') },
  '同じブロックの宣言より前で構築する': { mamori: 'export fn t(make: number, c: boolean) -> number {\n  if (c) {\n    const v = new make();\n    const make = 2;\n    return make;\n  }\n  return 0;\n}\n', name: 'make', at: [3, 19], was: [3, 23], message: BEFORE('make') },
  '同じブロックの宣言より前で構築する (名前の後で改行)': { mamori: 'export fn t() -> number {\n  const m = new Map\n    <string, number>();\n  const Map = 2;\n  return m.size + Map;\n}\n', name: 'Map', at: [2, 17], was: [3, 5], message: BEFORE('Map') },
  '後ろのクラスを構築する': { mamori: 'const e: Error = new Bad("x");\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', name: 'Bad', at: [1, 22], was: [1, 25], message: EARLY('Bad') },
  '後ろのクラスを構築する (名前の後で改行)': { mamori: 'const e: Error = new Bad\n  ("x");\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', name: 'Bad', at: [1, 22], was: [2, 3], message: EARLY('Bad') },
  'その場で呼ぶ arrow の中で、後ろのクラスを構築する': { mamori: 'const e: Error = (() => new Bad("x"))();\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', name: 'Bad', at: [1, 29], was: [1, 32], message: EARLY('Bad') },
  '危ない口を sink の外で構築する': { mamori: 'extern sink { RegExp } from "x";\nexport fn go(raw: string) -> boolean {\n  const r = new RegExp(raw);\n  return true;\n}\n', name: 'RegExp', at: [3, 17], was: [3, 23], message: SINK_OUTSIDE('RegExp') },
  '危ない口を sink の外で構築する (名前の後で改行)': { mamori: 'extern sink { RegExp } from "x";\nexport fn go(raw: string) -> boolean {\n  const r = new RegExp\n    (raw);\n  return true;\n}\n', name: 'RegExp', at: [3, 17], was: [4, 5], message: SINK_OUTSIDE('RegExp') },
};

/** 受け入れる形 (0.48 と同じ —— 場所の直しは、受け入れる集合を動かさない)。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '対照: 組み込みを構築する': 'export fn t() -> number {\n  const m = new Map<string, number>();\n  return m.size;\n}\n',
  '対照: 前のクラスを構築する': 'class Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nconst e: Error = new Bad("x");\nexport fn t() -> number {\n  return 0;\n}\n',
  '対照: 名前の後で改行して組み込みを構築する': 'export fn t() -> number {\n  const m = new Map\n    <string, number>();\n  return m.size;\n}\n',
};

/** その場所から始まる原文 (行と桁は 1 始まり)。 */
function textAt(source: string, pos: readonly [number, number]): string {
  return (source.split('\n')[pos[0] - 1] ?? '').slice(pos[1] - 1);
}

/** 構文木の中の `new` をすべて拾う (物・配列を端まで歩く)。 */
function newNodes(node: unknown, out: Extract<Expr, { kind: 'new' }>[] = []): Extract<Expr, { kind: 'new' }>[] {
  if (Array.isArray(node)) node.forEach((x) => newNodes(x, out));
  else if (node !== null && typeof node === 'object') {
    if ((node as { kind?: unknown }).kind === 'new') out.push(node as Extract<Expr, { kind: 'new' }>);
    Object.values(node).forEach((x) => newNodes(x, out));
  }
  return out;
}

/** 構築子の式の先頭の名前の場所 (`new a.b.C()` なら `a`)。 */
function headPos(callee: Expr): Pos {
  let e = callee;
  while (e.kind === 'member') e = e.object;
  return e.pos;
}

describe('Mamori 0.49: 構築子の名前についての断りは、名前の頭を指す (MG-089)', () => {
  it('★ 断りの場所は、構築子の名前の頭である (場所と文の全文)', () => {
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(11);
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual([at(form.at, form.message)]);
    }
  });

  it('★ 場所を独立に検める —— その場所から始まる原文は、構築子の名前そのものである', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(textAt(form.mamori, form.at).startsWith(form.name), name).toBe(true);
      // 名前の 1 つ前の字句は `new` (名前の頭であって、別の出現ではない)。
      const before = (form.mamori.split('\n')[form.at[0] - 1] ?? '').slice(0, form.at[1] - 1);
      expect(/\bnew $/.test(before), name).toBe(true);
    }
  });

  it('対照: 0.48 までの場所は名前の直後の字句で、名前を指していなかった (改行を挟むと別の行)', () => {
    let otherLine = 0;
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(form.was, name).not.toEqual(form.at);
      // 古い場所の原文は、名前ではなく `(` / `<` / `.` で始まる。
      expect(textAt(form.mamori, form.was), name).toMatch(/^[(<.]/);
      expect(textAt(form.mamori, form.was).startsWith(form.name), name).toBe(false);
      // 今の断りは、古い場所を 1 つも報告しない。
      expect(compile(form.mamori).diagnostics.join('\n'), name).not.toContain(`src/x/m0.mamori:${form.was[0]}:${form.was[1]}:`);
      if (form.was[0] !== form.at[0]) otherLine += 1;
    }
    // 名前の後で改行した形では、古い場所は次の行だった (標本が 4 つ在ること)。
    expect(otherLine).toBeGreaterThanOrEqual(4);
  });

  it('★ 構文木: どの `new` も、構築子の先頭の名前の場所に `new` の次の名前が在る (断らない形も含む)', () => {
    const sources = [...Object.values(REFUSED).map((f) => f.mamori), ...Object.values(ACCEPTED)];
    let seen = 0;
    for (const source of sources) {
      for (const node of newNodes(parse('src/x/m0.mamori', source))) {
        const pos = headPos(node.callee);
        const rest = textAt(source, [pos.line, pos.col]);
        expect(rest, source).toMatch(/^[A-Za-z_$]/);
        // `new` 自身の場所から名前の場所までは、`new` と空白だけ。
        const lines = source.split('\n');
        expect(pos.line, source).toBe(node.pos.line);
        expect((lines[pos.line - 1] ?? '').slice(node.pos.col - 1, pos.col - 1), source).toBe('new ');
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(sources.length);
  });

  it('対照: 受け入れる形は変わらない (組み込み・前のクラス・名前の後の改行)', () => {
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(3);
    for (const [name, source] of Object.entries(ACCEPTED)) expect(compile(source), name).toEqual({ ok: true, diagnostics: [] });
  });
});
