import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.8 —— 添字 `x[k]` を足す** (2026-11-01 · MG-007) と、その周の攻撃の電池が見つけた穴 (T-244)。
 *
 * 添字は「鍵を実行時に組める」ので、`x["constructor"]` が T-224 の表 (`.constructor` を断る) を迂回する道になる —— MG-003 で先送りした理由。
 * 塞ぎ方を先に決めてから足した:
 *
 * 1. **識別子として読める文字列の鍵** (`x["name"]`・`"constructor"` のような綴り違いも解いてから) は **`member` に畳む** ——
 *    `.name` と同じ FORBIDDEN_MEMBERS ・組み込みのメンバの表・`?.` の検めをそのまま通るので、迂回は構造上ありえない。
 * 2. 識別子にならない文字列 (`"content-type"`) と数リテラルは `index` のまま (禁じた名前にも組み込みのメンバにもなりえない)。
 * 3. それ以外の鍵は「静的に数と分かる式」だけ (M6)。**生成物では数に寄せる** (`x[+(k)]`) —— 型の宣言は実行時には守られないので、
 *    `number` と宣言した引数へ `"constructor"` が渡されても NaN になって表に届かない (検査器の静的な検めの上の、実行時の二重の守り)。
 * 4. 文字列で引く表は `Map` の `get` を使う。`x[k] = v` (添字への代入) と `?.[` は無い。
 *
 * **T-244**: 電池の揺さぶりが `(q = module) => q` を受け入れるのを見つけた —— arrow の引数の既定値は式なのに検めを受けず、
 * plain 関数の中で宣言していない名前 (`fetch`)・危ない口 (`shell.openExternal(raw)`)・印の無い値での印つきの口の呼び出しを隠せた
 * (0.2 で arrow を足した時からの穴)。全ての式の位置に `fetch("x")` を置く総当たり 37 位置で、検めを受けなかったのはここだけだった。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'u: string, o: unknown, xs: string[], n: number'): string => `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const ret = (expr: string): string => go(`  return ${expr};`);
const emitted = (expr: string): string => compile(ret(expr)).output;

describe('0.8: 添字 x[k]', () => {
  it('数リテラル・16 進・桁区切りの鍵は、そのまま通る', () => {
    expect(emitted('xs[0]')).toContain('return xs[0];');
    expect(emitted('xs[0x1]')).toContain('return xs[0x1];');
    expect(emitted('xs[1_0]')).toContain('return xs[1_0];');
    expect(emitted('xs[0][1]')).toContain('return xs[0][1];');
    expect(emitted('xs[0].length')).toContain('return xs[0].length;');
    expect(emitted('xs[0]()')).toContain('return xs[0]();');
  });
  it('★ 識別子として読める文字列の鍵は `.name` に畳まれる (threat: T-224)', () => {
    expect(emitted('o["name"]')).toContain('return o.name;');
    expect(emitted("o['name']")).toContain('return o.name;');
    expect(emitted('Math["floor"](1.5)')).toContain('return Math.floor(1.5);');
  });
  it('★ 禁じた名前は、字面・単引用符・括弧・unicode escape のどの綴りでも `.name` と同じ文面で断る (threat: T-224)', () => {
    for (const k of ['"constructor"', "'constructor'", '("constructor")', '"\\u0063onstructor"', '"__proto__"', '"prototype"', '"__defineGetter__"', '"__lookupSetter__"']) {
      const d = compile(ret(`o[${k}]`)).diagnostics;
      expect(d, k).toHaveLength(1);
      expect(d[0], k).toContain('[M0]');
      expect(d[0], k).toMatch(/`\.(constructor|__proto__|prototype|__defineGetter__|__lookupSetter__)` は Mamori に在りません/);
    }
  });
  it('★ 組み込みの表も `.name` と同じに効く: `Object["setPrototypeOf"]` / `RegExp["$1"]` は断る (threat: T-232)', () => {
    expect(compile(ret('Object["setPrototypeOf"](o, null)')).diagnostics[0]).toContain('Object.setPrototypeOf は使えません');
    expect(compile(ret('RegExp["$1"]')).diagnostics[0]).toContain('RegExp.$1 は使えません');
    expect(compile(ret('Math[0]')).diagnostics[0]).toContain('組み込みの Math は値として持ち出せません');
  });
  it('識別子にならない文字列の鍵 (`"content-type"`) は添字のまま通る', () => {
    expect(emitted('o["content-type"]')).toContain('return o["content-type"];');
  });
  it('★ 静的に数と分かる鍵だけが通り、生成物では数に寄せる `+(…)` が付く (threat: T-224)', () => {
    for (const [src, out] of [
      ['xs[n]', 'xs[+(n)]'], ['xs[n - 1]', 'xs[+(n - 1)]'], ['xs[n + 1]', 'xs[+(n + 1)]'], ['xs[xs.length - 1]', 'xs[+(xs.length - 1)]'],
      ['xs[Math.floor(n / 2)]', 'xs[+(Math.floor(n / 2))]'], ['xs[Number(u)]', 'xs[+(Number(u))]'], ['xs[u === "" ? 0 : n]', 'xs[+(u === "" ? 0 : n)]'],
      ['xs[-1]', 'xs[+(-1)]'], ['xs[xs[0].length]', 'xs[+(xs[0].length)]'],
    ] as const) {
      expect(emitted(src), src).toContain(`return ${out};`);
    }
  });
  it('★ 文字列になりうる鍵は断る: 変数・連結・typeof・呼び出し・文字列で宣言した let (threat: T-224)', () => {
    for (const k of ['o[u]', 'xs[u + "x"]', 'xs[typeof u]', 'xs[o.f()]', 'o["con" + "structor"]', 'xs[o]']) {
      const d = compile(ret(k)).diagnostics;
      expect(d, k).toHaveLength(1);
      expect(d[0], k).toContain('[M6]');
      expect(d[0], k).toContain('添字の鍵は');
    }
    expect(compile(go('  let i = "a"; return xs[i];')).diagnostics[0]).toContain('添字の鍵は');
  });
  it('数と宣言した let / const / 引数 / 数の初期値は鍵に使える。このモジュールの名前で隠した Math は組み込みではない', () => {
    expect(compile(go('  let i = 0; return xs[i];')).output).toContain('xs[+(i)]');
    expect(compile(go('  const k: number = n; return xs[k];')).output).toContain('xs[+(k)]');
    expect(compile(`const FIRST = 0;\nexport fn go(xs: string[]) -> unknown {\n  return xs[FIRST];\n}\n`).output).toContain('xs[+(FIRST)]');
    expect(compile(`const FIRST: number = 0;\nexport fn go(xs: string[]) -> unknown {\n  return xs[FIRST];\n}\n`).output).toContain('xs[+(FIRST)]');
    expect(compile(go('  const Math = [1]; return xs[Math.length];')).diagnostics).toEqual([]);
    expect(compile(go('  const Math = [1]; return xs[Math.floor(1)];')).diagnostics[0]).toContain('添字の鍵は');
    expect(compile(go('  const Number = [1]; return xs[Number(1)];')).diagnostics[0]).toContain('添字の鍵は');
    expect(compile('export fn go(xs: string[]) -> unknown {\n  return xs.map((i: number) => xs[i]);\n}\n').output).toContain('xs[+(i)]');
  });
  it('添字の結果は印を運ばない (印の洗浄にならない) し、添字は印を受ける口を値として運び出す道にならない (threat: M4)', () => {
    expect(compile(go('  const v: VettedUrl = xs[0]; return v;')).diagnostics[0]).toContain('[M4]');
    expect(compile(go('  return openUrl(xs[0]);')).diagnostics[0]).toContain('[M4]');
    expect(compile(go('  return [openUrl][0](u);')).diagnostics[0]).toContain('[M4]');
    expect(compile(go('  return shell["openExternal"](u);')).diagnostics[0]).toContain('[M2]');
  });
  it('添字への代入と `?.[` は無い', () => {
    expect(compile(go('  xs[0] = u;\n  return 1;')).diagnostics).toHaveLength(1);
    expect(compile(ret('xs?.[0]')).diagnostics[0]).toContain('`?.(` と `?.[` は在りません');
    expect(compile(ret('xs[0')).diagnostics).toHaveLength(1);
  });
  it('文字列の鍵の綴りが読めなければ位置つきで断る (コンパイラごと落ちない)', () => {
    const d = compile(ret("o['\\x41']")).diagnostics;
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('`\\` の綴りが読めません');
  });
});

describe('T-244: arrow の引数の既定値も式として検める', () => {
  it('★ 宣言していない名前・危ない口・印の無い値での印つきの口・mint は、既定値に隠せない (threat: T-244)', () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ['fetch("x")', 'M6', '宣言していない名前 fetch'],
      ['module', 'M6', '宣言していない名前 module'],
      ['shell.openExternal(u)', 'M2', '危ない口 shell'],
      ['openUrl(u)', 'M4', 'openUrl の引数 1 は印 VettedUrl'],
      ['mint VettedUrl(u)', 'M1', '印 VettedUrl を作れるのは gate 関数の中だけ'],
      ['"".constructor', 'M0', '`.constructor` は Mamori に在りません'],
    ];
    for (const [def, rule, text] of cases) {
      const d = compile(ret(`xs.map((q = ${def}) => q)`)).diagnostics;
      expect(d, def).toHaveLength(1);
      expect(d[0], def).toContain(`[${rule}]`);
      expect(d[0], def).toContain(text);
    }
  });
  it('既定値が正当なら通り、前の引数を参照できる', () => {
    expect(compile(ret('xs.map((q = 5) => q)')).diagnostics).toEqual([]);
    expect(compile(ret('xs.map((a, b = a) => b)')).output).toContain('(a, b = a) => b');
  });
});

describe('0.8: 添字の鍵「静的に数と分かる式」の真理値表 (変異検査が教えた —— 各枝が決め手になる入力)', () => {
  const ok = (key: string, params?: string): boolean => compile(go(`  return xs[${key}];`, params)).diagnostics.length === 0;
  const P = 'u: string, o: unknown, xs: string[], n: number';
  it('★ `-` `*` `/` `%` は、どちらの側が文字列でも数になるので通る (threat: T-224)', () => {
    for (const k of ['u - u', 'u * 2', '2 * u', 'u / 2', 'u % 2', '-u']) expect(ok(k), k).toBe(true);
  });
  it('★ `+` は両側が数のときだけ通る (片側でも文字列なら連結になる) (threat: T-224)', () => {
    expect(ok('n + 1')).toBe(true);
    expect(ok('u + 1')).toBe(false);
    expect(ok('n + u')).toBe(false);
    expect(ok('u + u')).toBe(false);
  });
  it('★ 数を作らない演算・単項は断る: 比べ・論理・?? ・! ・typeof ・await (threat: T-224)', () => {
    for (const k of ['n === 1', 'n < 1', 'n && n', 'n || n', 'n ?? n', '!n', 'typeof n']) expect(ok(k), k).toBe(false);
    expect(compile('export async fn go(xs: string[], n: number) -> unknown {\n  return xs[await n];\n}\n').diagnostics.length).toBeGreaterThan(0);
  });
  it('★ メンバは `.length` だけ・呼び出しは `Math.m(…)` と `Number(…)` だけ (threat: T-224)', () => {
    expect(ok('o.length')).toBe(true);
    expect(ok('o.size')).toBe(false);
    expect(ok('Math.max(n, 1)')).toBe(true);
    expect(ok('Number(u)')).toBe(true);
    for (const k of ['String(n)', 'Boolean(n)', 'u.trim()', 'o.f()', 'JSON.parse(u)', 'Math.max.call(Math, 1)']) expect(ok(k), k).toBe(false);
  });
  it('★ 条件演算子は両方の枝が数のときだけ通る (threat: T-224)', () => {
    expect(ok('u === "" ? 0 : n')).toBe(true);
    expect(ok('u === "" ? 0 : u')).toBe(false);
    expect(ok('u === "" ? u : 0')).toBe(false);
  });
  it('★ 鍵の中の名前も検める: 数と分かる形に宣言していない名前を隠せない (threat: T-224)', () => {
    for (const k of ['fetch.length', 'Number(fetch("x"))', 'Math.max(module.length, 1)']) {
      const d = compile(ret(`xs[${k}]`)).diagnostics;
      expect(d.some((x) => x.includes('宣言していない名前')), k).toBe(true);
    }
  });
  it('★ 名前が数かどうかは宣言か初期値で決まる: 引数・let・const・モジュールの const・arrow の引数 (threat: T-224)', () => {
    expect(ok('i', 'xs: string[], i: number')).toBe(true);
    expect(ok('i', 'xs: string[], i: string')).toBe(false);
    expect(ok('i', 'xs: string[], i')).toBe(false);
    expect(compile(go('  let i = 0; return xs[i];')).diagnostics).toEqual([]);
    expect(compile(go('  let i: number = n; return xs[i];')).diagnostics).toEqual([]);
    expect(compile(go('  let i: string = "a"; return xs[i];')).diagnostics.length).toBe(1);
    expect(compile(go('  let i: string = n; return xs[i];')).diagnostics.length).toBe(1);
    expect(compile(go('  let i; return xs[i];')).diagnostics.length).toBe(1);
    expect(compile(go('  const i = o; return xs[i];')).diagnostics.length).toBe(1);
    const mod = (decl: string): string[] => compile(`${decl}\nexport fn go(xs: string[]) -> unknown {\n  return xs[K];\n}\n`).diagnostics;
    expect(mod('const K = 2;')).toEqual([]);
    expect(mod('const K: number = JSON.parse("1");')).toEqual([]);
    expect(mod('const K = JSON.parse("1");').length).toBe(1);
    expect(mod('const K = "a";').length).toBe(1);
    expect(mod('const K: string = "a";').length).toBe(1);
    expect(compile(ret('xs.map((i: number) => xs[i])')).diagnostics).toEqual([]);
    expect(compile(ret('xs.map((i) => xs[i])')).diagnostics.length).toBe(1);
    expect(compile(ret('xs.map((i: string) => xs[i])')).diagnostics.length).toBe(1);
    expect(ok('n', P)).toBe(true);
  });
});
