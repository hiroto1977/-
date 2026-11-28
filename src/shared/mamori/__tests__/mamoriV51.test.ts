import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.51 —— 呼べない・構築できない組み込みを、その形で使わせない** (2026-11-28 · MG-091 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 組み込みには、呼ぶ形・構築する形のどちらかが**実行時に必ず投げる**物が在る:
 *   - 名前空間 (`Math` / `JSON`): 構築子でも関数でもない —— `new Math()` も `Math()` も `TypeError`。使えるのはメンバだけ。
 *   - 構築するだけの物 (`Promise` / `Map` / `Set` / `URL`): `new` を付けずに呼ぶと `TypeError`。
 * 0.50 までの検査器はどれも受け取り、生成物を `tsc` が断っていた (2351 = 構築できない・2349 = 呼べない・2348 = `new` が要る ——
 * 守りが `tsc` の 1 層。MG-090 が「測って残した物」に書いた 1 つ目)。0.51 は検査器 (M6) で断る。
 * この module の名前で隠した同じ綴り (引数・宣言した外の名前) は組み込みではないので、今までの規則のまま答える。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const NO_NEW = (name: string): string => `[M6] 組み込みの ${name} は構築できません —— 名前空間なので \`${name}.m(…)\` とメンバを直に使う形だけです (構築すると実行時に投げ、TypeScript も断ります)`;
const NO_CALL = (name: string): string => `[M6] 組み込みの ${name} は呼べません —— 名前空間なので \`${name}.m(…)\` とメンバを直に使う形だけです (呼ぶと実行時に投げ、TypeScript も断ります)`;
const NEEDS_NEW = (name: string): string => `[M6] 組み込みの ${name} は \`new\` を付けずに呼べません —— \`new ${name}(…)\` と構築します (付けずに呼ぶと実行時に投げ、TypeScript も断ります)`;
const LOCAL_NEW = (name: string): string =>
  `[M6] new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${name} はこのモジュールの局所の名前 (値・関数) で、構築できません (組み込みの名前を局所の名前で隠した形も同じ)`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const OBJECT_VALUE = '[M6] 組み込みの Object は値として持ち出せません —— `Object.hasOwn(…)` のように許したメンバを直に呼びます (持ち出すと、使ってよいメンバの表を別名で迂回できる)';

/** 関数 1 つの本体に文を置いた Mamori の module (2 行目の先頭 2 桁が字下げ)。 */
const fn = (body: string, params = ''): string => `export fn t(${params}) -> unknown {\n  ${body}\n}\n`;
/** 同じ形の TypeScript。 */
const tsFn = (body: string, params = ''): string => `export function t(${params}): unknown { ${body} }`;

/**
 * TypeScript (厳格モード・**本物の lib** = ES2022 + DOM) が、綴りごとに付ける診断の番号。組み込みの形 (呼べるか・構築できるか) は
 * lib の宣言が決めるので、lib なしの物差しでは測れない。1 回の program に全部の綴りを入れて測る (lib の読み込みは 1 度)。
 */
function tsCodesByName(texts: Readonly<Record<string, string>>): Record<string, number[]> {
  const names = Object.keys(texts);
  const fileOf = (i: number): string => `/virtual/f${i}.ts`;
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [] };
  const host = ts.createCompilerHost(options);
  const real = host.getSourceFile.bind(host);
  const virtual = new Map(names.map((n, i) => [fileOf(i), ts.createSourceFile(fileOf(i), texts[n] ?? '', ts.ScriptTarget.ES2022, true)]));
  host.getSourceFile = (f, v) => virtual.get(f) ?? real(f, v);
  const realExists = host.fileExists.bind(host);
  host.fileExists = (f) => virtual.has(f) || realExists(f);
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
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
  readonly code: number;
}

/** 名前空間を構築する形 (TypeScript: 2351 = 構築できない式)。場所は構築子の名前の頭。 */
const NEW_NAMESPACE: Readonly<Record<string, Refused>> = {
  'new Math()': { mamori: fn('return new Math();'), diagnostics: [at(2, 14, NO_NEW('Math'))], ts: tsFn('return new Math();'), code: 2351 },
  'new JSON()': { mamori: fn('return new JSON();'), diagnostics: [at(2, 14, NO_NEW('JSON'))], ts: tsFn('return new JSON();'), code: 2351 },
  '引数つき': { mamori: fn('return new Math(1, 2);'), diagnostics: [at(2, 14, NO_NEW('Math'))], ts: tsFn('return new Math(1, 2);'), code: 2351 },
  'arrow の本体の中': { mamori: fn('const g = () => new JSON();\n  return g;'), diagnostics: [at(2, 23, NO_NEW('JSON'))], ts: tsFn('const g = () => new JSON(); return g;'), code: 2351 },
  'throw の相手': { mamori: fn('throw new Math();'), diagnostics: [at(2, 13, NO_NEW('Math'))], ts: tsFn('throw new Math();'), code: 2351 },
  'モジュール直下の初期値': { mamori: 'const K = new JSON();\nexport fn t() -> unknown {\n  return K;\n}\n', diagnostics: [at(1, 15, NO_NEW('JSON'))], ts: 'const K = new JSON(); export function t(): unknown { return K; }', code: 2351 },
  '別の構築の引数の中': { mamori: fn('return new Map(new Math());'), diagnostics: [at(2, 22, NO_NEW('Math'))], ts: tsFn('return new Map(new Math());'), code: 2351 },
};

/** 名前空間を呼ぶ形 (TypeScript: 2349 = 呼べない式)。場所は呼ぶ名前の頭。 */
const CALL_NAMESPACE: Readonly<Record<string, Refused>> = {
  'Math()': { mamori: fn('return Math();'), diagnostics: [at(2, 10, NO_CALL('Math'))], ts: tsFn('return Math();'), code: 2349 },
  'JSON()': { mamori: fn('return JSON();'), diagnostics: [at(2, 10, NO_CALL('JSON'))], ts: tsFn('return JSON();'), code: 2349 },
  '引数つき': { mamori: fn('return Math(1);'), diagnostics: [at(2, 10, NO_CALL('Math'))], ts: tsFn('return Math(1);'), code: 2349 },
  'arrow の本体の中': { mamori: fn('const g = () => JSON("x");\n  return g;'), diagnostics: [at(2, 19, NO_CALL('JSON'))], ts: tsFn('const g = () => JSON("x"); return g;'), code: 2349 },
  'モジュール直下の初期値': { mamori: 'const K = Math();\nexport fn t() -> unknown {\n  return K;\n}\n', diagnostics: [at(1, 11, NO_CALL('Math'))], ts: 'const K = Math(); export function t(): unknown { return K; }', code: 2349 },
  '別の呼び出しの引数の中': { mamori: fn('return Number(Math());'), diagnostics: [at(2, 17, NO_CALL('Math'))], ts: tsFn('return Number(Math());'), code: 2349 },
  '結果のメンバを読む': { mamori: fn('return Math().x;'), diagnostics: [at(2, 10, NO_CALL('Math'))], ts: tsFn('return Math().x;'), code: 2349 },
};

/** 構築するだけの組み込みを、`new` を付けずに呼ぶ形 (TypeScript: 2348 = 呼べない —— `new` を付け忘れていないか)。 */
const CALL_NEW_ONLY: Readonly<Record<string, Refused>> = {
  'Promise(…)': { mamori: fn('return Promise((r: unknown) => r);'), diagnostics: [at(2, 10, NEEDS_NEW('Promise'))], ts: tsFn('return Promise((r: unknown) => r);'), code: 2348 },
  'Map()': { mamori: fn('return Map();'), diagnostics: [at(2, 10, NEEDS_NEW('Map'))], ts: tsFn('return Map();'), code: 2348 },
  'Set()': { mamori: fn('return Set();'), diagnostics: [at(2, 10, NEEDS_NEW('Set'))], ts: tsFn('return Set();'), code: 2348 },
  'URL(…)': { mamori: fn('return URL("https://a.example");'), diagnostics: [at(2, 10, NEEDS_NEW('URL'))], ts: tsFn('return URL("https://a.example");'), code: 2348 },
  '型引数つき': { mamori: fn('return Map<string, number>();'), diagnostics: [at(2, 10, NEEDS_NEW('Map'))], ts: tsFn('return Map<string, number>();'), code: 2348 },
};

/** 今までどおり受け取る形: [Mamori の綴り, 同じ形の TypeScript]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string]>> = {
  '名前空間のメンバを呼ぶ (Math)': [fn('return Math.abs(1);'), tsFn('return Math.abs(1);')],
  '名前空間のメンバを呼ぶ (JSON)': [fn('return JSON.stringify(1);'), tsFn('return JSON.stringify(1);')],
  'new Map': [fn('return new Map<string, number>();'), tsFn('return new Map<string, number>();')],
  'new Set': [fn('return new Set<number>();'), tsFn('return new Set<number>();')],
  'new URL': [fn('return new URL("https://a.example");'), tsFn('return new URL("https://a.example");')],
  'new Promise': [fn('return new Promise<number>((r: (n: number) => void) => r(1));'), tsFn('return new Promise<number>((r: (n: number) => void) => r(1));')],
  'Number を呼ぶ': [fn('return Number("1");'), tsFn('return Number("1");')],
  'String を呼ぶ': [fn('return String(1);'), tsFn('return String(1);')],
  'Boolean を呼ぶ': [fn('return Boolean(1);'), tsFn('return Boolean(1);')],
  'Array を呼ぶ': [fn('return Array(3);'), tsFn('return Array(3);')],
  'Error を呼ぶ': [fn('return Error("x");'), tsFn('return Error("x");')],
  'RegExp を呼ぶ': [fn('return RegExp("a");'), tsFn('return RegExp("a");')],
  'new Number': [fn('return new Number(1);'), tsFn('return new Number(1);')],
};

/** この module の名前で隠した同じ綴り —— 組み込みではないので、0.51 の断りは答えない。 */
const SHADOWED_ACCEPTED: Readonly<Record<string, string>> = {
  '引数で隠した Math を呼ぶ': fn('return Math();', 'Math: () => number'),
  '引数で隠した Map を呼ぶ': fn('return Map();', 'Map: () => number'),
  '宣言した外の名前の Map を呼ぶ': 'extern pure { Map } from "./host";\n' + fn('return Map();'),
  '宣言した外の名前の Math を構築する': 'extern pure { Math } from "./host";\n' + fn('return new Math();'),
};

/** 前からの断りが、前の文のまま答える形。 */
const UNCHANGED: Readonly<Record<string, { readonly mamori: string; readonly diagnostics: readonly string[] }>> = {
  '引数で隠した Math を構築する (0.50 の文)': { mamori: fn('return new Math();', 'Math: number'), diagnostics: [at(2, 14, LOCAL_NEW('Math'))] },
  'Object を構築する (持ち出しの文)': { mamori: fn('return new Object();'), diagnostics: [at(2, 14, OBJECT_VALUE)] },
  'Object を呼ぶ (持ち出しの文)': { mamori: fn('return Object();'), diagnostics: [at(2, 10, OBJECT_VALUE)] },
};

describe('Mamori 0.51: 呼べない・構築できない組み込みを、その形で使わせない (MG-091)', () => {
  const ALL_REFUSED: Readonly<Record<string, Readonly<Record<string, Refused>>>> = { 'new 名前空間': NEW_NAMESPACE, '名前空間を呼ぶ': CALL_NAMESPACE, '構築するだけの物を呼ぶ': CALL_NEW_ONLY };

  it('★ 名前空間 (Math / JSON) を構築する形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(NEW_NAMESPACE)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(NEW_NAMESPACE).length).toBeGreaterThanOrEqual(7);
  });

  it('★ 名前空間 (Math / JSON) を呼ぶ形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(CALL_NAMESPACE)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(CALL_NAMESPACE).length).toBeGreaterThanOrEqual(7);
  });

  it('★ 構築するだけの組み込み (Promise / Map / Set / URL) を、new を付けずに呼ぶ形を断る', () => {
    for (const [name, form] of Object.entries(CALL_NEW_ONLY)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(CALL_NEW_ONLY).length).toBeGreaterThanOrEqual(5);
  });

  it('★ 同じ形を TypeScript (本物の lib) も断り、通す形には何も付けない (2351 / 2349 / 2348)', () => {
    const texts: Record<string, string> = {};
    for (const [group, forms] of Object.entries(ALL_REFUSED)) for (const [name, form] of Object.entries(forms)) texts[`${group} / ${name}`] = form.ts;
    for (const [name, [, tsText]] of Object.entries(ACCEPTED)) texts[`通す / ${name}`] = tsText;
    const codes = tsCodesByName(texts);
    for (const [group, forms] of Object.entries(ALL_REFUSED)) {
      for (const [name, form] of Object.entries(forms)) expect(codes[`${group} / ${name}`], `${group} / ${name}`).toContain(form.code);
    }
    // 対照: 物差しは、動く形 (メンバを呼ぶ・構築する・呼べる組み込みを呼ぶ) には診断を 1 つも付けない
    for (const name of Object.keys(ACCEPTED)) expect(codes[`通す / ${name}`], name).toEqual([]);
  }, 60_000);

  it('★ 断った形の引数も検める —— 引数の中の誤りは 1 度ずつ、断りの後ろに並ぶ', () => {
    // 構築する形: 断りは構築子の名前、引数の宣言していない名前は 1 度だけ (断った後にもう 1 度検めると 2 度並ぶ)
    expect(compile(fn('return new Math(Nope);')).diagnostics).toEqual([at(2, 14, NO_NEW('Math')), at(2, 19, UNDECLARED('Nope'))]);
    // 呼ぶ形 (名前空間 / 構築するだけの物)
    expect(compile(fn('return JSON(Nope);')).diagnostics).toEqual([at(2, 10, NO_CALL('JSON')), at(2, 15, UNDECLARED('Nope'))]);
    expect(compile(fn('return Set(Nope);')).diagnostics).toEqual([at(2, 10, NEEDS_NEW('Set')), at(2, 14, UNDECLARED('Nope'))]);
  });

  it('対照: 動く形 (メンバを呼ぶ・構築する・呼べる組み込みを呼ぶ) は今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, [source]] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(13);
  });

  it('対照: この module の名前で隠した同じ綴り (引数・宣言した外の名前) は組み込みではないので、0.51 の断りは答えない', () => {
    for (const [name, source] of Object.entries(SHADOWED_ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
    }
    expect(Object.keys(SHADOWED_ACCEPTED).length).toBeGreaterThanOrEqual(4);
  });

  it('対照: 前からの断り (局所の名前の構築・Object の持ち出し) は、前の文のまま答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      expect(compile(form.mamori).diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(3);
  });
});
