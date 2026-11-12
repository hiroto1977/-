import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { specifierProblem } from '../checker';

/*
 * **Mamori 0.32 —— 穴探しの周 (MG-067 · 2026-11-11) で見つけた 3 つの穴を塞いだ。** 構文は 1 つも足していない。
 *
 * どれも「印 (関門を通った値の型) が、関門を通らずに付く」道で、`tsc` は `JSON.parse` の戻り値 (any) を印の型へ通すので
 * 2 枚目の壁も働かなかった。見つけ方: 0.31 のコンパイラへ、any の出どころ × 印を受ける場所 を掛けた手探り 368 形を撃った。
 *
 * | 脅威 | 形 | 塞ぎ方 |
 * | --- | --- | --- |
 * | T-261 | arrow の引数に印の型を書く —— `((v: V) => need(v))(JSON.parse(raw))` / `.then((v: V) => …)` | arrow の引数は印を名乗れない。名乗れるのは Mamori の外の module の関数へ直に渡す呼び戻しだけ |
 * | T-262 | Mamori の関数を別の顔で引く —— `extern pure { need } from "./g"` / `use { need } from "./g.js"` / `".//g"` | 印を受ける Mamori の関数は extern で引けない・相対の道は正規の綴りだけ |
 * | T-263 | 印の引数の既定値 `u: V = JSON.parse(…)`・gate の `return JSON.parse(s);` | 印を名乗る引数は既定値を持てない・gate の戻り値は印を持つ値か null / undefined だけ |
 */
const G = 'export vetted V = "v";\nexport vetted W = "w";\n'
  + 'export gate fn check(s: string) -> V | null {\n  if (s === "ok") { return mint V(s); }\n  return null;\n}\n'
  + 'export fn need(v: V) -> string {\n  return "got";\n}\n'
  + 'export fn need2(v: V, label: string) -> string {\n  return label;\n}\n'
  + 'export fn zero() -> string {\n  return "z";\n}\n'
  + 'extern sink global open;\nexport sink fn go(u: V) -> unknown {\n  return open(u);\n}\n';
const HEAD = 'use { check, need, go } from "./g";\nuse type { V } from "./g";\n';
const attack = (body: string, pre = ''): string => `${HEAD}${pre}export fn attack(raw: string) -> unknown {\n${body}\n}\n`;

type Extra = Readonly<Record<string, string>>;
function diag(source: string, extra: Extra = {}): string[] {
  const files = [{ path: 'src/x/g.mamori', source: G }, { path: 'src/x/a.mamori', source }, ...Object.entries(extra).map(([path, src]) => ({ path, source: src }))];
  const r = compileProject(files);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const text = (source: string, extra: Extra = {}): string => diag(source, extra).join('\n');

const ARROW_MARK = /\[M4\] arrow の引数 \w+ は印 V を名乗れません/;

describe('0.32 · T-261: arrow の引数は印を名乗れない', () => {
  it('★ arrow の引数に印を書いて、関門を通っていない値を印を受ける関数へ運べない (threat: T-261)', () => {
    const FORMS: readonly [string, string][] = [
      ['即時の呼び出し', '  return ((v: V) => need(v))(JSON.parse(raw));'],
      ['別名を付けて呼ぶ', '  const run = (v: V) => need(v);\n  return run(JSON.parse(raw));'],
      ['Promise の .then', '  return Promise.resolve(JSON.parse(raw)).then((v: V) => need(v));'],
      ['配列の .map', '  const xs: V[] = JSON.parse(raw);\n  return xs.map((v: V) => need(v));'],
      ['別名を .map へ', '  const run = (v: V) => need(v);\n  const xs: V[] = JSON.parse(raw);\n  return xs.map(run);'],
      ['JSON.parse の reviver', '  return JSON.parse(raw, (k: string, v: V) => need(v));'],
      ['ブロックの本体', '  return Promise.resolve(JSON.parse(raw)).then((v: V) => { return need(v); });'],
      ['async の arrow', '  return Promise.resolve(JSON.parse(raw)).then(async (v: V) => need(v));'],
      ['null を含む印の型', '  return Promise.resolve(JSON.parse(raw)).then((v: V | null) => v === null ? null : need(v));'],
      ['オブジェクトの欄', '  const o = { run: (v: V) => need(v) };\n  return o.run(JSON.parse(raw));'],
      ['戻り値', '  return (v: V) => need(v);'],
      ['危ない口 (sink 関数) へ', '  return ((v: V) => go(v))(JSON.parse(raw));'],
    ];
    for (const [label, body] of FORMS) expect(text(attack(body)), label).toMatch(ARROW_MARK);
    // module 直下の定数の arrow も同じ
    expect(text(`${HEAD}export const run = (v: V) => need(v);\n`)).toMatch(ARROW_MARK);
  });

  it('★ 断った arrow の引数は印を運ばない (中で印を受ける関数を呼ぶ形も断る)', () => {
    const d = text(attack('  return ((v: V) => need(v))(JSON.parse(raw));'));
    expect(d).toMatch(/\[M4\] need の引数 1 は印 V を持つ値だけを受けます \(渡したのは印の無い値\)/);
  });

  it('対照: 印を名乗らない引数の arrow は今までどおり書ける (印を含むだけの型は印を運ばない)', () => {
    expect(diag(attack('  return [raw].map((s: string) => s.length);'))).toEqual([]);
    // V[] / V を含む和は「印そのもの」ではない —— 書けるが、取り出した値は印を持たない
    expect(text(attack('  const xs: V[] = JSON.parse(raw);\n  return [xs].map((vs: V[]) => vs.map((v) => need(v)));'))).not.toMatch(ARROW_MARK);
    expect(text(attack('  return [raw].map((v: V | string) => need(v));'))).not.toMatch(ARROW_MARK);
    expect(text(attack('  return [raw].map((v: V | string) => need(v));'))).toMatch(/\[M4\] need の引数 1/);
  });

  it('対照: Mamori の外の module の関数へ直に渡す呼び戻しは、印を名乗れる (呼び戻しに渡す値の型は外の module の側で tsc が検める)', () => {
    const HOST = 'extern pure { hostRun } from "./host";\n';
    expect(diag(attack('  return hostRun((v: V) => need(v));', HOST))).toEqual([]);
    expect(diag(attack('  return hostRun({ open: (v: V) => go(v), log: (m: string) => m });', HOST))).toEqual([]);
    expect(diag(attack('  return hostRun((v: V) => { return need(v); });', HOST))).toEqual([]);
    // `use` で引いた外の module (この project の .mamori ではない) の関数も同じ
    expect(diag(attack('  return hostRun((v: V) => need(v));', 'use { hostRun } from "./host";\n'))).toEqual([]);
  });

  it('★ 外の関数へ渡す形でも、直に書いた引数・欄でなければ断る (呼ぶ側を選べる・入れ物に包める形)', () => {
    const HOST = 'extern pure { hostRun, hostObj } from "./host";\n';
    const FORMS: readonly [string, string][] = [
      ['メンバの呼び出し', '  return hostObj.run((v: V) => need(v));'],
      ['.call', '  return hostRun.call(null, (v: V) => need(v));'],
      ['入れ子のオブジェクト', '  return hostRun({ deep: { open: (v: V) => need(v) } });'],
      ['配列の項', '  return hostRun([(v: V) => need(v)]);'],
      ['条件演算子', '  return hostRun(raw === "" ? (v: V) => need(v) : (v: V) => need(v));'],
      ['呼び戻しの中の別の arrow', '  return hostRun((v: V) => ((w: V) => need(w))(JSON.parse(raw)));'],
      ['型だけの import', '  return hostRun((v: V) => need(v));'],
    ];
    for (const [label, body] of FORMS.slice(0, 6)) expect(text(attack(body, HOST)), label).toMatch(ARROW_MARK);
    // `use type` で引いた名前は値ではない (呼び戻しの相手にならない)
    expect(text(attack(FORMS[6]![1], 'use type { hostRun } from "./host";\n'))).toMatch(ARROW_MARK);
  });

  it('★ 呼び戻しを渡してよい相手は「外の module から pure で引いた関数」だけ (extern sink の口・global の関数は相手にならない)', () => {
    // extern sink の口 (sink 関数の中でだけ呼べる) へ渡す呼び戻し
    expect(text('use { need } from "./g";\nuse type { V } from "./g";\nextern sink { hostSink } from "./host";\nexport sink fn out(u: V) -> unknown {\n  return hostSink(u, (v: V) => need(v));\n}\n')).toMatch(ARROW_MARK);
    // global の関数 (`setTimeout(cb, 0, 値)` のように、呼び戻しへ渡す値を呼び手が選べる物が在る)
    expect(text(attack('  return parseInt((v: V) => need(v));', 'extern pure global parseInt;\n'))).toMatch(ARROW_MARK);
  });

  it('★ 局所の束縛が外の関数の名前を覆っていれば、呼び戻しの相手ではない (覆うこと自体も M6 で断る)', () => {
    const HOST = 'extern pure { hostRun } from "./host";\n';
    const viaConst = text(attack('  const hostRun = (cb: (v: string) => string) => cb(raw);\n  return hostRun((v: V) => need(v));', HOST));
    expect(viaConst).toMatch(ARROW_MARK);
    expect(viaConst).toContain('[M6] 局所の名前 hostRun は、モジュール直下の同名の宣言');
    const viaParam = text(`${HEAD}${HOST}export fn attack(hostRun: (cb: (v: V) => string) => string, raw: string) -> unknown {\n  return hostRun((v: V) => need(v));\n}\n`);
    expect(viaParam).toMatch(ARROW_MARK);
  });

  it('対照: 外の関数の引数に arrow でない式 (名前・展開つきのオブジェクト・配列) が並んでも、直に書いた arrow だけが呼び戻し', () => {
    const HOST = 'extern pure { hostRun } from "./host";\n';
    expect(diag(attack('  const o = { a: 1 };\n  return hostRun(raw, { ...o, open: (v: V) => need(v), raw }, [raw], 1);', HOST))).toEqual([]);
    expect(diag(attack('  return hostRun();', HOST))).toEqual([]);
  });

  it('★ Mamori の関数は「外の関数」ではない (同じ module・use で引いた別の module・extern で引いた別の module)', () => {
    const RUN = 'fn run(cb: (v: V) => string, a: string) -> string {\n  return cb(JSON.parse(a));\n}\n';
    expect(text(attack('  return run((v: V) => need(v), raw);', RUN))).toMatch(ARROW_MARK);
    const B = { 'src/x/b.mamori': 'use type { V } from "./g";\nexport fn run(cb: (v: V) => string, a: string) -> string {\n  return cb(JSON.parse(a));\n}\n' };
    expect(text(attack('  return run((v: V) => need(v), raw);', 'use { run } from "./b";\n'), B)).toMatch(ARROW_MARK);
    // 印を受けない Mamori の関数は extern で引ける (T-262 の対照) が、呼び戻しを渡してよい相手にはならない
    expect(text(attack('  return run((v: V) => need(v), raw);', 'extern pure { run } from "./b";\n'), B)).toMatch(ARROW_MARK);
  });
});

describe('0.32 · T-262: Mamori の関数を別の顔で引けない', () => {
  it('★ 印を受ける Mamori の関数を extern で引けない (外形の検めが外れる) (threat: T-262)', () => {
    const REFUSED = /\[M4\] (need|go) は印を受ける Mamori の関数です —— `extern` で引くと外形 \(印を受ける引数\) の検めが外れます/;
    expect(text('extern pure { need } from "./g";\nexport fn attack(raw: string) -> unknown {\n  return need(JSON.parse(raw));\n}\n')).toMatch(REFUSED);
    expect(text('extern pure { go } from "./g";\nexport fn attack(raw: string) -> unknown {\n  return go(JSON.parse(raw));\n}\n')).toMatch(REFUSED);
    expect(text('use type { V } from "./g";\nextern sink { need } from "./g";\nexport sink fn out(u: V, raw: string) -> unknown {\n  return need(u);\n}\n')).toMatch(REFUSED);
    // 印を受ける引数が 1 つでも在れば (ほかの引数が素の値でも)
    expect(text('extern pure { need2 } from "./g";\nexport fn attack(raw: string) -> unknown {\n  return need2(JSON.parse(raw), "x");\n}\n')).toMatch(/\[M4\] need2 は印を受ける Mamori の関数です/);
    // 並べた名前のどれか 1 つでも
    expect(text('extern pure { check, need } from "./g";\nexport fn attack(raw: string) -> unknown {\n  return check(raw);\n}\n')).toMatch(REFUSED);
  });

  it('対照: 印を受けない Mamori の関数は extern で引ける (素の値を受ける関数を、引く側で口として宣言する形)', () => {
    const B = { 'src/x/b.mamori': 'export fn writeOut(path: string, body: string) -> string {\n  return path + body;\n}\n' };
    expect(diag('use type { V } from "./g";\nextern sink { writeOut } from "./b";\nexport sink fn save(u: V, body: string) -> unknown {\n  return writeOut(u, body);\n}\n', B)).toEqual([]);
    expect(diag('extern pure { check } from "./g";\nexport fn probe(raw: string) -> unknown {\n  return check(raw) === null;\n}\n')).toEqual([]);
    // 引数の無い関数も (印を受ける引数が 1 つも無い)
    expect(diag('extern pure { zero } from "./g";\nexport fn probe() -> unknown {\n  return zero();\n}\n')).toEqual([]);
  });

  it('★ 相対の道は正規の綴りだけ —— TypeScript が同じ module に解く別の綴りで外形を外せない (threat: T-262)', () => {
    const BAD = ['./g.js', './g.ts', './g.mjs', './g.cjs', './g.tsx', './g.jsx', './g.mamori', './/g', '././g', './g/', './g/../g', './../x/g', '../x//g', '../x/./g', '.g', '..', '.'];
    for (const spec of BAD) {
      const NOT_CANONICAL = `[M6] 道 "${spec}" は正規の綴りではありません`;
      expect(text(`use { need } from "${spec}";\nexport fn attack(raw: string) -> unknown {\n  return need(JSON.parse(raw));\n}\n`), `use ${spec}`).toContain(NOT_CANONICAL);
      expect(text(`extern pure { need } from "${spec}";\nexport fn attack(raw: string) -> unknown {\n  return need(JSON.parse(raw));\n}\n`), `extern ${spec}`).toContain(NOT_CANONICAL);
      // 再輸出は `./` / `../` で始まらない道を、元から「外の module の再輸出」として断る (`.g` / `..` / `.`)
      const relative = spec.startsWith('./') || spec.startsWith('../');
      expect(text(`export { need } from "${spec}";\n`), `export ${spec}`).toContain(relative ? NOT_CANONICAL : '[M6] `export { … } from <外の module>`');
    }
  });

  it('対照: 正規の綴りなら外形を引け、印の検めが働く (道の正規化は今までどおり)', () => {
    for (const spec of ['./g', '../x/g']) {
      const d = diag(`use { need } from "${spec}";\nexport fn attack(raw: string) -> unknown {\n  return need(JSON.parse(raw));\n}\n`);
      expect(d, spec).toHaveLength(1);
      expect(d[0], spec).toContain('[M4] need の引数 1 は印 V を持つ値だけを受けます');
    }
  });

  it('★ `X/index.mamori` を `./X` と名指せない (TypeScript は index に解く)', () => {
    const D = { 'src/x/d/index.mamori': 'use type { V } from "../g";\nexport fn needIdx(v: V) -> string {\n  return "got";\n}\n' };
    expect(text('use { needIdx } from "./d";\nexport fn attack(raw: string) -> unknown {\n  return needIdx(JSON.parse(raw));\n}\n', D)).toContain('[M6] 道 "./d" は src/x/d/index.mamori を指します');
    // index まで綴れば外形を引ける
    const d = diag('use { needIdx } from "./d/index";\nexport fn attack(raw: string) -> unknown {\n  return needIdx(JSON.parse(raw));\n}\n', D);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('[M4] needIdx の引数 1 は印 V を持つ値だけを受けます');
  });

  it('specifierProblem: 相対でない道は見ない・正規なら null・理由は 4 通り', () => {
    for (const ok of ['electron', 'node:fs', '@scope/pkg', './a', './a/b', '../a', '../../a/b-c_d', './a.config', './a.json']) expect(specifierProblem(ok), ok).toBeNull();
    expect(specifierProblem('.a')).toBe('`./` か `../` で始めます');
    expect(specifierProblem('..')).toBe('`./` か `../` で始めます');
    // 途中に `./` / `../` が在っても、先頭がそうでなければ「始め方」の誤り (途中の一致を先頭と読まない)
    expect(specifierProblem('.a/./b')).toBe('`./` か `../` で始めます');
    expect(specifierProblem('.a/../b')).toBe('`./` か `../` で始めます');
    expect(specifierProblem('.//a')).toBe('空の区切り (`//`・末尾の `/`) は書けません');
    expect(specifierProblem('./a/')).toBe('空の区切り (`//`・末尾の `/`) は書けません');
    expect(specifierProblem('./')).toBe('空の区切り (`//`・末尾の `/`) は書けません');
    expect(specifierProblem('././a')).toBe('途中の `.` / `..` は書けません (`../` は先頭にだけ並べます)');
    expect(specifierProblem('./a/../b')).toBe('途中の `.` / `..` は書けません (`../` は先頭にだけ並べます)');
    expect(specifierProblem('./../a')).toBe('途中の `.` / `..` は書けません (`../` は先頭にだけ並べます)');
    for (const ext of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'mamori']) expect(specifierProblem(`./a.${ext}`), ext).toBe('拡張子 (`.js` / `.ts` ほか) は書けません');
    // 途中の区切りに拡張子のような名前が在っても、末尾でなければ道の一部
    expect(specifierProblem('./a.js/b')).toBeNull();
  });
});

describe('0.32 · T-263: 印は mint と来歴を通ってだけ入る (既定値・gate の戻り値)', () => {
  const DEFAULT = /\[M4\] 引数 \w+ は印 V を名乗るので既定値を持てません/;

  it('★ 印を名乗る引数は既定値を持てない (TypeScript の呼び手が省くと、関門を通っていない値が印の型で入る) (threat: T-263)', () => {
    expect(text('use type { V } from "./g";\nextern sink global open2;\nexport sink fn out(u: V = JSON.parse("1")) -> unknown {\n  return open2(u);\n}\n')).toMatch(DEFAULT);
    expect(text(`${HEAD}export fn run(v: V = JSON.parse("1")) -> string {\n  return need(v);\n}\n`)).toMatch(DEFAULT);
    expect(text(`${HEAD}export fn run(v: V | null = JSON.parse("1")) -> unknown {\n  return v;\n}\n`)).toMatch(DEFAULT);
    // 関門を通した値を既定値にする形も断る (既定値の式を 1 つずつ裁かない —— 印の引数は必ず呼び手が渡す)
    expect(text(`${HEAD}export fn run(v: V | null = check("ok")) -> unknown {\n  return v;\n}\n`)).toMatch(DEFAULT);
    expect(text(`${HEAD}export fn run(v: V | undefined = undefined) -> unknown {\n  return v;\n}\n`)).toMatch(DEFAULT);
    // 外の関数へ渡す呼び戻しの引数も同じ
    expect(text(attack('  return hostRun((v: V = JSON.parse(raw)) => need(v));', 'extern pure { hostRun } from "./host";\n'))).toMatch(DEFAULT);
  });

  it('対照: 印を名乗らない引数の既定値は書ける', () => {
    expect(diag(`${HEAD}export fn run(v: V, label: string = "x", n: number = 1) -> string {\n  return need(v) + label;\n}\n`)).toEqual([]);
  });

  const GATE = (body: string, ret = 'V | null'): string => `export vetted V = "v";\nexport vetted W = "w";\nexport gate fn other(s: string) -> W {\n  return mint W(s);\n}\nexport gate fn same(s: string) -> V | null {\n  return s === "" ? null : mint V(s);\n}\nexport gate fn g(s: string, p: V) -> ${ret} {\n${body}\n}\n`;
  const gdiag = (body: string, ret?: string): string[] => {
    const r = compileProject([{ path: 'src/x/m0.mamori', source: GATE(body, ret) }]);
    return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
  };
  const RETURN = /\[M1\] gate 関数の戻り値は `mint V\(…\)`・印 V を持つ値・null \/ undefined だけです/;

  it('★ gate 関数は、mint を通らない値を印の型で返せない (threat: T-263)', () => {
    const FORMS: readonly [string, string][] = [
      ['any をそのまま', '  return JSON.parse(s);'],
      ['any を束縛してから', '  const v = JSON.parse(s);\n  return v;'],
      ['arrow の呼び出しの結果', '  const f = () => JSON.parse(s);\n  return f();'],
      ['条件演算子の片方', '  return s === "" ? null : JSON.parse(s);'],
      ['条件演算子の片方 (mint と any)', '  return s === "" ? mint V(s) : JSON.parse(s);'],
      ['別の印の gate の戻り値', '  return other(s);'],
      ['メンバの呼び出し', '  return s.trim();'],
      ['素の引数', '  return s;'],
      ['論理演算子で繋ぐ', '  return p ?? JSON.parse(s);'],
      ['真偽の字面', '  return true;'],
      ['真偽の字面 (false)', '  return false;'],
      ['文字列の字面', '  return "x";'],
      ['数の字面', '  return 1;'],
    ];
    for (const [label, body] of FORMS) expect(gdiag(body).join('\n'), label).toMatch(RETURN);
    // 印を含むだけの戻り値の型 (配列) でも同じ
    expect(gdiag('  return JSON.parse(s);', 'V[]').join('\n')).toMatch(RETURN);
  });

  it('対照: mint・null / undefined・印を持つ束縛・同じ印の gate の戻り値・印を持つ引数・両方の枝がそうである条件は返せる', () => {
    expect(gdiag('  return mint V(s);')).toEqual([]);
    expect(gdiag('  return null;')).toEqual([]);
    expect(gdiag('  return undefined;', 'V | undefined')).toEqual([]);
    expect(gdiag('  if (s === "") { return null; }\n  const v = mint V(s);\n  return v;')).toEqual([]);
    expect(gdiag('  return same(s);')).toEqual([]);
    expect(gdiag('  const v = same(s);\n  return v;')).toEqual([]);
    expect(gdiag('  return p;')).toEqual([]);
    expect(gdiag('  return s === "" ? null : mint V(s);')).toEqual([]);
    expect(gdiag('  return s === "" ? p : (s === "x" ? undefined : mint V(s));', 'V | undefined')).toEqual([]);
    // 値を返さない return・gate の中の arrow の return は対象の外 (arrow は plain の役)
    expect(gdiag('  const f = (n: number) => { return n + 1; };\n  if (f(1) === 2) { return null; }\n  return mint V(s);')).toEqual([]);
  });

  it('★ async の gate も同じ (await した値も来歴で見る)', () => {
    const AG = (body: string): string => `export vetted V = "v";\nexport gate async fn g(s: string) -> Promise<V | null> {\n${body}\n}\n`;
    const d = (body: string): string[] => {
      const r = compileProject([{ path: 'src/x/m0.mamori', source: AG(body) }]);
      return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
    };
    expect(d('  const t = await Promise.resolve(s);\n  return mint V(t);')).toEqual([]);
    expect(d('  return await Promise.resolve(JSON.parse(s));').join('\n')).toMatch(RETURN);
    expect(d('  return JSON.parse(s);').join('\n')).toMatch(RETURN);
  });

  it('★ mint の誤りは 1 度だけ言う (戻り値の検めが同じ誤りを重ねない)', () => {
    const d = gdiag('  return mint W(s);');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('この gate 関数の戻り値は印 W を名乗っていません');
  });

  it('★ gate でない関数の return は、この検めの対象ではない (印を名乗る戻り値は別の規則 M1 が断る)', () => {
    expect(diag(`${HEAD}export fn plain(raw: string) -> unknown {\n  return JSON.parse(raw);\n}\n`)).toEqual([]);
    // 印を名乗る plain の関数: 断るのは「名乗れるのは gate 関数だけ」の 1 件だけ (戻り値の式の検めを重ねない)
    const d = diag(`${HEAD}export fn plain(raw: string) -> V {\n  return JSON.parse(raw);\n}\n`);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('[M1] plain: 戻り値の型に印 V を名乗れるのは gate 関数だけです');
    // 印を名乗らない gate 関数 (戻り値の型が印でない) の戻り値は検めない
    expect(diag('export gate fn g(s: string) -> boolean {\n  return true;\n}\n')).toEqual([]);
    expect(diag('export gate fn g(s: string) -> string {\n  return s === "" ? "a" : JSON.parse(s);\n}\n')).toEqual([]);
  });
});
