import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.53 —— 型だけの名前を値の位置に書かせない** (2026-11-28 · MG-093 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `use type { Host } from "./host";` / `use { f, type Host } from "./host";` で型だけ引いた名前と、別の Mamori の module が
 * 型 (type・interface・印) としてだけ宣言した名前を `use { T }` で引いた名前。どちらも実行時に値が無い。
 * 0.52 までの検査器は、その名前を値の位置に書く形 (`new Host()` / `Host()` / `return Host;` / `Host.x` / `x instanceof Host` ほか) を
 * 受け取り、生成物を `tsc` が断っていた (1361 = `import type` で引いた名前は値として使えない・2693 = 型しか指さない名前を値として使った
 * —— 守りが `tsc` の 1 層。MG-092 が「次に直す側の周を回すなら、ここが候補」と残した 1 つ)。0.53 は検査器 (M6) で断る。
 * 型の位置 (引数の型・型引数・`typeof 名前`) と、値として引いた名前は今までどおり。
 */

interface File {
  readonly path: string;
  readonly source: string;
}

function compileFiles(files: readonly File[]): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([...files]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}
const compile = (source: string): { ok: boolean; diagnostics: string[]; emitted: string } => compileFiles([{ path: 'src/x/m0.mamori', source }]);

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const TAIL = '。呼ぶ・構築する・メンバを読む・渡す・返す・`instanceof` の右辺に置く形は、どれも TypeScript が断ります';
/** `type` を付けて引いた名前の断り。 */
const IMPORTED = (name: string): string => `[M6] ${name} は値の位置に書けません —— \`use type { … }\` / \`use { type … }\` で型だけ引いた名前です (生成物の import は実行時に消えます。値として使うなら \`type\` を外して \`use { ${name} }\` で引きます)${TAIL}`;
/** 引いた先が型としてだけ宣言した名前の断り。 */
const DECLARED = (name: string): string => `[M6] ${name} は値の位置に書けません —— 引いた先の Mamori の module が型 (type・interface・印) としてだけ宣言した名前です (型は実行時に在りません)${TAIL}`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const FROM_MAMORI_050 = (name: string): string => `[M6] new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${name} は別の Mamori の module から \`use\` で引いた名前 (関数・値・型) で、構築できません (クラスは \`use\` で引けません)`;

const USE = 'use type { Host } from "./host";\n';
const IMPORT = "import type { Host } from './host';\n";
/** 関数 1 つの本体に文を置いた Mamori の module (1 行目が use・3 行目の先頭 2 桁が字下げ)。 */
const fn = (body: string, params = ''): string => `${USE}export fn t(${params}) -> unknown {\n  ${body}\n}\n`;
/** 同じ形の TypeScript。 */
const tsFn = (body: string, params = ''): string => `${IMPORT}export function t(${params}): unknown { ${body} }`;

/** TypeScript の側の外の module (`./host`) —— 本物のクラスと関数を export する (値として引けば使える名前を、型だけで引いている)。 */
const HOST_TS = 'export class Host { static x = 1; static C = class {}; static [Symbol.iterator](): Iterator<number> { return [1][Symbol.iterator](); } }\nexport function f(): number { return 1; }\n';
/** Mamori の module `./lib` と、その TypeScript の姿。 */
const LIB = 'export type T = number;\nexport interface I {\n  a: number;\n}\nexport vetted VUrl = "検めた URL";\nexport const K: number = 1;\nexport fn helper() -> number {\n  return 1;\n}\nexport type Both = number;\nexport const Both: number = 1;\nexport type Half = number;\nconst Half: number = 1;\n';
const LIB_TS = 'export type T = number;\nexport interface I { a: number }\nexport type VUrl = string & { readonly __v: 1 };\nexport const K: number = 1;\nexport function helper(): number { return 1; }\nexport type Both = number;\nexport const Both: number = 1;\nexport type Half = number;\nconst Half: number = 1;\n';

/**
 * TypeScript (厳格モード・`isolatedModules` —— アプリの tsconfig と同じ) が、綴りごとに付ける診断の番号。
 * `./host` と `./lib` は仮の module として同じ program に置く (1 回の program に全部の綴りを入れて測る)。
 */
function tsCodesByName(texts: Readonly<Record<string, string>>): Record<string, number[]> {
  const names = Object.keys(texts);
  const fileOf = (i: number): string => `/virtual/f${i}.ts`;
  const options: ts.CompilerOptions = { strict: true, noEmit: true, isolatedModules: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts'], types: [] };
  const host = ts.createCompilerHost(options);
  const real = host.getSourceFile.bind(host);
  const source = (path: string, text: string): [string, ts.SourceFile] => [path, ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)];
  const virtual = new Map([source('/virtual/host.ts', HOST_TS), source('/virtual/lib.ts', LIB_TS), ...names.map((n, i) => source(fileOf(i), texts[n] ?? ''))]);
  host.getSourceFile = (f, v) => virtual.get(f) ?? real(f, v);
  const realExists = host.fileExists.bind(host);
  host.fileExists = (f) => virtual.has(f) || realExists(f);
  // 仮の module の置き場 (`/virtual`) は実在しない —— 在ると答えないと、相対の import (`./host` / `./lib`) を引く前に諦める (2307)。
  const realDirectoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (d) => d === '/virtual' || realDirectoryExists?.(d) === true;
  const program = ts.createProgram([...virtual.keys()], options, host);
  const out: Record<string, number[]> = {};
  names.forEach((n, i) => {
    const sf = virtual.get(fileOf(i))!;
    out[n] = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => d.code);
  });
  return out;
}

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript, TypeScript が付ける番号]。 */
interface Refused {
  readonly files: readonly File[];
  readonly diagnostics: readonly string[];
  readonly ts: string;
  readonly code: number;
}
const single = (mamori: string, diagnostics: readonly string[], tsText: string, code = 1361): Refused => ({ files: [{ path: 'src/x/m0.mamori', source: mamori }], diagnostics, ts: tsText, code });

/** `use type { Host }` で引いた名前を、値の位置に書く形。場所は名前の頭。 */
const TYPE_IMPORTED: Readonly<Record<string, Refused>> = {
  '構築する': single(fn('return new Host();'), [at(3, 14, IMPORTED('Host'))], tsFn('return new Host();')),
  '呼ぶ': single(fn('return Host();'), [at(3, 10, IMPORTED('Host'))], tsFn('return Host();')),
  '返す': single(fn('return Host;'), [at(3, 10, IMPORTED('Host'))], tsFn('return Host;')),
  'メンバを読む': single(fn('return Host.x;'), [at(3, 10, IMPORTED('Host'))], tsFn('return Host.x;')),
  'メンバを呼ぶ': single(fn('return Host.x();'), [at(3, 10, IMPORTED('Host'))], tsFn('return Host.x();')),
  'メンバを構築する': single(fn('return new Host.C();'), [at(3, 14, IMPORTED('Host'))], tsFn('return new Host.C();')),
  '局所の const へ写す': single(fn('const a = Host;\n  return a;'), [at(3, 13, IMPORTED('Host'))], tsFn('const a = Host; return a;')),
  '引数に渡す': single(fn('return String(Host);'), [at(3, 17, IMPORTED('Host'))], tsFn('return String(Host);')),
  'instanceof の右辺': single(fn('return x instanceof Host;', 'x: unknown'), [at(3, 23, IMPORTED('Host'))], tsFn('return x instanceof Host;', 'x: unknown')),
  '式の typeof': single(fn('return typeof Host;'), [at(3, 17, IMPORTED('Host'))], tsFn('return typeof Host;')),
  '物の字面の値': single(fn('return { a: Host };'), [at(3, 15, IMPORTED('Host'))], tsFn('return { a: Host };')),
  '物の字面の省略形': single(fn('return { Host };'), [at(3, 12, IMPORTED('Host'))], tsFn('return { Host };')),
  '配列の項': single(fn('return [Host];'), [at(3, 11, IMPORTED('Host'))], tsFn('return [Host];')),
  '展開': single(fn('return [...Host];'), [at(3, 14, IMPORTED('Host'))], tsFn('return [...Host];')),
  '条件': single(fn('return Host ? 1 : 2;'), [at(3, 10, IMPORTED('Host'))], tsFn('return Host ? 1 : 2;')),
  '添字の受け手': single(fn('return Host[0];'), [at(3, 10, IMPORTED('Host'))], tsFn('return (Host as unknown as number[])[0];')),
  'for … of の相手': single(fn('for (const x of Host) {\n    return x;\n  }\n  return 1;'), [at(3, 19, IMPORTED('Host'))], tsFn('for (const x of Host) { return x; } return 1;')),
  '投げる': single(fn('throw Host;'), [at(3, 9, IMPORTED('Host'))], tsFn('throw Host;')),
  // 分割代入の相手は、外の名前としての前からの断り (メンバは分割代入で取り出せない) も同じ場所に出る
  '分割代入の相手': single(fn('const { a } = Host;\n  return a;'), [at(3, 17, IMPORTED('Host')), at(3, 17, '[M6] 外の名前 Host のメンバは分割代入で取り出せません (組み込み・危ない口の表を迂回します —— `Host.メンバ` と書いて呼びます)')], tsFn('const { x } = Host; return x;')),
  'arrow の本体': single(fn('const g = () => Host;\n  return g;'), [at(3, 19, IMPORTED('Host'))], tsFn('const g = () => Host; return g;')),
  '引数の既定値': single(`${USE}export fn t(a: unknown = Host) -> unknown {\n  return a;\n}\n`, [at(2, 26, IMPORTED('Host'))], `${IMPORT}export function t(a: unknown = Host): unknown { return a; }`),
  'モジュール直下の初期値': single(`${USE}const K: unknown = Host;\nexport fn t() -> unknown {\n  return 1;\n}\n`, [at(2, 20, IMPORTED('Host'))], `${IMPORT}const K: unknown = Host;\nexport function t(): unknown { return K; }`),
  '関門の mint の中': single(`vetted VUrl = "x";\n${USE}export gate fn g(s: string) -> VUrl | null {\n  return mint VUrl(Host);\n}\n`, [at(4, 20, IMPORTED('Host'))], `${IMPORT}export function g(s: string): string | null { return Host as unknown as string; }`),
  '名前ごとの type (use { f, type Host })': single('use { f, type Host } from "./host";\nexport fn t() -> unknown {\n  return new Host();\n}\n', [at(3, 14, IMPORTED('Host'))], "import { f, type Host } from './host';\nexport function t(): unknown { return f() + Number(new Host()); }"),
  '別名を付けて引いた名前': single('use type { Host alias H } from "./host";\nexport fn t() -> unknown {\n  return H;\n}\n', [at(3, 10, IMPORTED('H'))], "import type { Host as H } from './host';\nexport function t(): unknown { return H; }"),
};

const withLib = (use: string, body: string, params = ''): readonly File[] => [
  { path: 'src/x/lib.mamori', source: LIB },
  { path: 'src/x/m0.mamori', source: `${use}\nexport fn t(${params}) -> unknown {\n  ${body}\n}\n` },
];
const tsLib = (imp: string, body: string, params = ''): string => `${imp}\nexport function t(${params}): unknown { ${body} }`;

/** 別の Mamori の module の名前。`type` を付けずに引いた型 (2693) と、`type` を付けて引いた名前 (1361)。 */
const FROM_MAMORI: Readonly<Record<string, Refused>> = {
  '引いた type を返す': { files: withLib('use { T } from "./lib";', 'return T;'), diagnostics: [at(3, 10, DECLARED('T'))], ts: tsLib("import { T } from './lib';", 'return T;'), code: 2693 },
  '引いた type を呼ぶ': { files: withLib('use { T } from "./lib";', 'return T();'), diagnostics: [at(3, 10, DECLARED('T'))], ts: tsLib("import { T } from './lib';", 'return T();'), code: 2693 },
  '引いた type を instanceof の右辺に置く': { files: withLib('use { T } from "./lib";', 'return x instanceof T;', 'x: unknown'), diagnostics: [at(3, 23, DECLARED('T'))], ts: tsLib("import { T } from './lib';", 'return x instanceof T;', 'x: unknown'), code: 2693 },
  '引いた type のメンバを読む': { files: withLib('use { T } from "./lib";', 'return T.x;'), diagnostics: [at(3, 10, DECLARED('T'))], ts: tsLib("import { T } from './lib';", 'return T.x;'), code: 2693 },
  '引いた interface を返す': { files: withLib('use { I } from "./lib";', 'return I;'), diagnostics: [at(3, 10, DECLARED('I'))], ts: tsLib("import { I } from './lib';", 'return I;'), code: 2693 },
  '引いた印を返す': { files: withLib('use { VUrl } from "./lib";', 'return VUrl;'), diagnostics: [at(3, 10, DECLARED('VUrl'))], ts: tsLib("import { VUrl } from './lib';", 'return VUrl;'), code: 2693 },
  '型は export・同名の値は export していない名前を返す': { files: withLib('use { Half } from "./lib";', 'return Half;'), diagnostics: [at(3, 10, DECLARED('Half'))], ts: tsLib("import { Half } from './lib';", 'return Half;'), code: 2693 },
  '型だけで引いた type を返す': { files: withLib('use type { T } from "./lib";', 'return T;'), diagnostics: [at(3, 10, IMPORTED('T'))], ts: tsLib("import type { T } from './lib';", 'return T;'), code: 2693 },
  '型だけで引いた印を返す': { files: withLib('use type { VUrl } from "./lib";', 'return VUrl;'), diagnostics: [at(3, 10, IMPORTED('VUrl'))], ts: tsLib("import type { VUrl } from './lib';", 'return VUrl;'), code: 2693 },
  '型だけで引いた直下の const を返す': { files: withLib('use type { K } from "./lib";', 'return K;'), diagnostics: [at(3, 10, IMPORTED('K'))], ts: tsLib("import type { K } from './lib';", 'return K;'), code: 1361 },
  '型だけで引いた、型と値の同名を返す': { files: withLib('use type { Both } from "./lib";', 'return Both;'), diagnostics: [at(3, 10, IMPORTED('Both'))], ts: tsLib("import type { Both } from './lib';", 'return Both;'), code: 1361 },
};

/** 今までどおり受け取る形。 */
const ACCEPTED: Readonly<Record<string, readonly File[]>> = {
  '引数の型に書く': [{ path: 'src/x/m0.mamori', source: fn('return x;', 'x: Host') }],
  '型引数に書く': [{ path: 'src/x/m0.mamori', source: fn('return new Map<string, Host>();') }],
  '戻り値の型に書く': [{ path: 'src/x/m0.mamori', source: `${USE}export fn t(x: Host) -> Host {\n  return x;\n}\n` }],
  '同じ use で値として引いた名前を呼ぶ': [{ path: 'src/x/m0.mamori', source: 'use { f, type Host } from "./host";\nexport fn t(x: Host) -> unknown {\n  return f();\n}\n' }],
  '外の module から値として引いた名前を構築する': [{ path: 'src/x/m0.mamori', source: 'use { Host } from "./host";\nexport fn t() -> unknown {\n  return new Host();\n}\n' }],
  'Mamori の module から値として引いた const を返す': withLib('use { K } from "./lib";', 'return K;'),
  'Mamori の module から引いた関数を呼ぶ': withLib('use { helper } from "./lib";', 'return helper();'),
  '型だけで引いた const を typeof で型に書く': withLib('use type { K } from "./lib";', 'return x;', 'x: typeof K'),
  '引いた type を型に書く': withLib('use { T } from "./lib";', 'return x;', 'x: T'),
  '型と値の同名を値として引いて返す': withLib('use { Both } from "./lib";', 'return Both;'),
};

/** 前からの断りが、前の文のまま答える形。 */
const UNCHANGED: Readonly<Record<string, { readonly files: readonly File[]; readonly diagnostics: readonly string[] }>> = {
  'この module の type を値として書く (宣言していない名前)': { files: [{ path: 'src/x/m0.mamori', source: 'type T = number;\nexport fn t() -> unknown {\n  return T;\n}\n' }], diagnostics: [at(3, 10, UNDECLARED('T'))] },
  'この module の印を値として書く (宣言していない名前)': { files: [{ path: 'src/x/m0.mamori', source: 'vetted VUrl = "x";\nexport fn t() -> unknown {\n  return VUrl;\n}\n' }], diagnostics: [at(3, 10, UNDECLARED('VUrl'))] },
  'Mamori の module から引いた type を構築する (0.50 の文)': { files: withLib('use { T } from "./lib";', 'return new T();'), diagnostics: [at(3, 14, FROM_MAMORI_050('T'))] },
  '外の名前へ代入する': { files: [{ path: 'src/x/m0.mamori', source: fn('Host = 1;\n  return 1;') }], diagnostics: [at(3, 3, '[M6] 外の名前 Host へは代入できません')] },
};

describe('Mamori 0.53: 型だけの名前を値の位置に書かせない (MG-093)', () => {
  it('★ `use type` で引いた名前を値の位置に書く形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(TYPE_IMPORTED)) {
      const r = compileFiles(form.files);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(TYPE_IMPORTED).length).toBeGreaterThanOrEqual(25);
  });

  it('★ 別の Mamori の module が型としてだけ宣言した名前は、`type` を付けずに引いても値の位置に書けない', () => {
    for (const [name, form] of Object.entries(FROM_MAMORI)) {
      const r = compileFiles(form.files);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(FROM_MAMORI).length).toBeGreaterThanOrEqual(11);
  });

  it('★ 同じ形を TypeScript も断る (isolatedModules で測る · 1361 / 2693)', () => {
    const forms = { ...Object.fromEntries(Object.entries(TYPE_IMPORTED).map(([k, v]) => [`外: ${k}`, v])), ...Object.fromEntries(Object.entries(FROM_MAMORI).map(([k, v]) => [`Mamori: ${k}`, v])) };
    const codes = tsCodesByName({ ...Object.fromEntries(Object.entries(forms).map(([k, v]) => [k, v.ts])), '対照: 型の位置': tsFn('return x;', 'x: Host'), '対照: 値として引く': "import { Host } from './host';\nexport function t(): unknown { return new Host(); }" });
    for (const [name, form] of Object.entries(forms)) expect(codes[name], name).toContain(form.code);
    // 対照: 物差しは、型の位置と値として引いた名前に診断を付けない
    expect(codes['対照: 型の位置']).toEqual([]);
    expect(codes['対照: 値として引く']).toEqual([]);
    expect(Object.keys(forms).length).toBeGreaterThanOrEqual(36);
  });

  it('★ 断りは 1 つの名前に 1 度だけ出し、引数・左辺の中は今までどおり検める', () => {
    // 呼ぶ形: 呼ぶ側の断り + 引数の断り
    expect(compile(fn('return Host(Nope);')).diagnostics).toEqual([at(3, 10, IMPORTED('Host')), at(3, 15, UNDECLARED('Nope'))]);
    // 構築する形
    expect(compile(fn('return new Host(Nope);')).diagnostics).toEqual([at(3, 14, IMPORTED('Host')), at(3, 19, UNDECLARED('Nope'))]);
    // メンバを呼ぶ形
    expect(compile(fn('return Host.x(Nope);')).diagnostics).toEqual([at(3, 10, IMPORTED('Host')), at(3, 17, UNDECLARED('Nope'))]);
    // instanceof: 左辺の断り + 右辺の断り
    expect(compile(fn('return Nope instanceof Host;')).diagnostics).toEqual([at(3, 10, UNDECLARED('Nope')), at(3, 26, IMPORTED('Host'))]);
    // 同じ名前を 2 か所に書けば 2 度
    expect(compile(fn('return [Host, Host];')).diagnostics).toEqual([at(3, 11, IMPORTED('Host')), at(3, 17, IMPORTED('Host'))]);
    // 型だけで引いた名前が、読むだけの表・関数の結果を置いた const でも、断りは型だけの名前の 1 つ (前からの断りを重ねない)
    const STATEFUL = 'fn make() -> unknown {\n  return 1;\n}\nexport const BOOT = make();\nexport const TABLE: ReadonlyMap<string, number> = new Map([["a", 1]]);\n';
    const stateful = (body: string): readonly File[] => [
      { path: 'src/x/lib.mamori', source: STATEFUL },
      { path: 'src/x/m0.mamori', source: `use type { BOOT, TABLE } from "./lib";\nexport fn t() -> unknown {\n  ${body}\n}\n` },
    ];
    expect(compileFiles(stateful('return TABLE;')).diagnostics).toEqual([at(3, 10, IMPORTED('TABLE'))]);
    expect(compileFiles(stateful('return BOOT;')).diagnostics).toEqual([at(3, 10, IMPORTED('BOOT'))]);
    expect(compileFiles(stateful('return BOOT();')).diagnostics).toEqual([at(3, 10, IMPORTED('BOOT'))]);
    // 対照: 同じ 2 つを値として引けば、前からの断りが答える (読むだけの表を返す・関数の結果を置いた const を読む)
    const asValue = compileFiles([
      { path: 'src/x/lib.mamori', source: STATEFUL },
      { path: 'src/x/m0.mamori', source: 'use { BOOT, TABLE } from "./lib";\nexport fn t() -> unknown {\n  return [TABLE, BOOT];\n}\n' },
    ]).diagnostics;
    expect(asValue).toHaveLength(2);
    expect(asValue[0]).toContain('読むだけの表 TABLE');
    expect(asValue[1]).toContain('関数の呼び出しの結果を置いたモジュール直下の const');
  });

  it('対照: 型の位置と、値として引いた名前は今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, files] of Object.entries(ACCEPTED)) {
      const r = compileFiles(files);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', files.find((f) => f.path.includes('m0'))!.source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(10);
  });

  it('対照: 前からの断り (この module の型の名前・0.50 の文・外の名前への代入) は、前の文のまま答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      const r = compileFiles(form.files);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(4);
  });

  it('対照: 型と値を同じ名前で宣言した module の名前は、型としてだけの名前に数えない (同じ module の中でも、引いた先でも値として読める)', () => {
    const same = compile('type X = number;\nconst X: number = 1;\nexport fn t() -> unknown {\n  return X;\n}\n');
    expect(same.diagnostics).toEqual([]);
    // 値の側が fn・const のどちらでも同じ
    for (const value of ['export fn Both2() -> number {\n  return 1;\n}\n', 'export const Both2: number = 1;\n']) {
      const files: readonly File[] = [
        { path: 'src/x/lib.mamori', source: `export type Both2 = number;\n${value}` },
        { path: 'src/x/m0.mamori', source: 'use { Both2 } from "./lib";\nexport fn t() -> unknown {\n  return [Both2];\n}\n' },
      ];
      expect(compileFiles(files).diagnostics, value).toEqual([]);
    }
    // 逆の対照: 値の宣言が無ければ断る (interface だけ)
    const typeOnly: readonly File[] = [
      { path: 'src/x/lib.mamori', source: 'export interface Both2 {\n  a: number;\n}\n' },
      { path: 'src/x/m0.mamori', source: 'use { Both2 } from "./lib";\nexport fn t() -> unknown {\n  return [Both2];\n}\n' },
    ];
    expect(compileFiles(typeOnly).diagnostics).toEqual([at(3, 11, DECLARED('Both2'))]);
  });

  it('対照: 実物の .mamori は型だけで引いた名前を値の位置に 1 つも書いていない (書いていれば、この版で変換が止まる)', () => {
    // 実物の変換は `mamoriGenerated.test.ts` が全ファイルで見る。ここでは、型だけの import を持つ実物が在ること (規則が空振りでないこと) を数える。
    const sample = 'use type { VettedExternalUrl } from "./vetted";\nexport fn t(u: VettedExternalUrl) -> string {\n  return u;\n}\n';
    const r = compileFiles([
      { path: 'src/x/vetted.mamori', source: 'export vetted VettedExternalUrl = "検めた外部 URL";\n' },
      { path: 'src/x/m0.mamori', source: sample },
    ]);
    expect(r.diagnostics).toEqual([]);
  });
});
