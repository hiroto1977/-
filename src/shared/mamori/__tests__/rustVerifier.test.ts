import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from '../../__tests__/originalSource';
import { stripComments } from '../../__tests__/stripNonCode';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compileProject } from '../compile';
import { FORBIDDEN_MEMBERS, FORBIDDEN_WORDS } from '../parser';
import { inspectEmitted } from './mamoriInspect';

/**
 * Rust → Wasm の検算役 (tools/mamori-verify) を、TypeScript のコンパイラと突き合わせる (T-250)。
 * 目的は 2 つ: ① 検算役自身が壊れていないこと (ABI・上限・成果物の出どころ) ② M0 の判定が TS と食い違わないこと。
 * 食い違いの向きは非対称: 「TS は M0 で断る・Rust は通す」= Rust の穴 (検算役が役に立たない) は 1 件も許さない。
 * 「Rust は断る・TS は通す」= Rust の厳しすぎか TS の穴で、理由つきの台帳 (STRICTER_THAN_TS) だけを許す。
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const WASM_PATH = join(ROOT, 'tools/mamori-verify/dist/mamori_verify.wasm');

interface Exports {
  memory: WebAssembly.Memory;
  input_ptr(): number;
  input_cap(): number;
  verify(len: number): number;
}

const wasmBytes = readFileSync(WASM_PATH);
const module = new WebAssembly.Module(wasmBytes);
const ex = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
const CAP = ex.input_cap();

/** 原文を UTF-8 で置いて検める。**書いた byte 数**を渡す (UTF-16 の length を渡さない · D2)。0 以外はすべて拒否。 */
function rust(src: string): number {
  const view = new Uint8Array(ex.memory.buffer, ex.input_ptr(), CAP);
  const { read, written } = new TextEncoder().encodeInto(src, view);
  if (read !== src.length) return 0xffffffff;
  return ex.verify(written) >>> 0;
}

/** Rust が受け持つ「禁じた綴り」の理由 (TS の M0 は文法の誤りも M0 と呼ぶので、綴りの禁止だけを理由の文で選ぶ)。 */
const SPELLING_REASONS: readonly RegExp[] = [
  /テンプレート文字列は在りません/,
  /`\/\* … \*\/` の注記は在りません/,
  /裸で置けません/,
  /知らない文字です/,
  /鍵 `__proto__`/,
  /`\.\.\.` \(展開\)/,
  /閉じていません|行の内で閉じていません/,
];
const SPELLING_TEXTS = new Set<string>([...Object.values(FORBIDDEN_WORDS), ...Object.values(FORBIDDEN_MEMBERS)]);
const isSpellingReason = (m: string): boolean => SPELLING_TEXTS.has(m) || SPELLING_REASONS.some((re) => re.test(m));

/** `ok` = 診断が 1 つも無い・`spelling` = 禁じた綴りで断った (Rust が受け持つ範囲)・どちらでもなければ文法や来歴の誤り。 */
function tsVerdict(src: string): { ok: boolean; spelling: boolean; emitted: readonly string[] } {
  try {
    const r = compileProject([{ path: 'src/x/m0.mamori', source: src }]);
    if (r.ok) return { ok: true, spelling: false, emitted: [...r.outputs.values()] };
    return { ok: false, spelling: r.diagnostics.some((d) => d.rule === 'M0' && isSpellingReason(d.message)), emitted: [] };
  } catch {
    return { ok: false, spelling: true, emitted: [] };
  }
}

function walk(d: string, out: string[] = []): string[] {
  for (const n of readOriginalDir(d)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (f.endsWith('.mamori')) out.push(f);
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOST = 'export fn f(a: unknown) -> unknown {\n  return a;\n}\n';

describe('Rust 検算役 · ABI と上限 (解析で見つかった D1/D2/D3)', () => {
  it('imports は 0・exports は 4 つだけ・start セクションは無い', () => {
    expect(WebAssembly.Module.imports(module)).toEqual([]);
    expect(WebAssembly.Module.exports(module).map((e) => e.name).sort()).toEqual(['input_cap', 'input_ptr', 'memory', 'verify']);
    // start セクション (id 8) を持たない: セクション id を先頭から数える
    const ids: number[] = [];
    let p = 8;
    while (p < wasmBytes.length) {
      ids.push(wasmBytes[p]!);
      let size = 0;
      let shift = 0;
      let q = p + 1;
      for (;;) {
        const b = wasmBytes[q++]!;
        size |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      p = q + size;
    }
    expect(ids).not.toContain(8);
  });

  it('D1: 置き場より大きい入力は「検められなかった」で拒み、その後も規則 6 が生きている', () => {
    expect(rust('x.constructor')).toBe(6);
    const big = ex.verify(CAP + 1) >>> 0;
    expect(big).toBe(0xffffffff);
    expect(ex.verify(0xffffffff) >>> 0).toBe(0xffffffff);
    for (const bad of ['a.constructor', 'a.prototype', 'a.__proto__', 'a.__defineGetter__']) expect(rust(bad)).toBe(6);
  });

  it('D2: 日本語の注記のあとの `as` を、UTF-8 の byte 数を渡して見つける (UTF-16 長だと見落とす形の対照つき)', () => {
    const src = '// 注記は日本語で書く\nexport fn f(a: unknown) -> number {\n  return a as number;\n}\n';
    expect(rust(src)).toBe(1);
    // 対照: UTF-16 の length を渡すと検めの範囲が短くなり、後ろの `as` を見ない (この形が D2 だった)
    const view = new Uint8Array(ex.memory.buffer, ex.input_ptr(), CAP);
    new TextEncoder().encodeInto(src, view);
    expect(src.length).toBeLessThan(new TextEncoder().encode(src).length);
    expect(ex.verify(src.length) >>> 0).toBe(0);
  });

  it('D3: 確保の折り返しが構造として無い (alloc / reset を export しない)', () => {
    const names = WebAssembly.Module.exports(module).map((e) => e.name);
    expect(names).not.toContain('alloc');
    expect(names).not.toContain('reset');
  });

  it('上限ちょうどの入力は検められ、時間も線形 (8 MiB の空白で 2 秒未満)', () => {
    const s = ' '.repeat(CAP);
    const t0 = Date.now();
    expect(rust(s)).toBe(0);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('空の入力は 0', () => {
    expect(ex.verify(0) >>> 0).toBe(0);
  });
});

describe('Rust 検算役 · 出どころ (ソースと成果物が BUILD.json と一致する)', () => {
  const sha = (p: string): string => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
  const build = JSON.parse(readOriginalSource(join(ROOT, 'tools/mamori-verify/BUILD.json'))) as { files: Record<string, string> };
  it('lib.rs / Cargo.toml / Cargo.lock / wasm の sha256 が台帳どおり (編集したら scripts/build-mamori-verify.cjs で組み直す)', () => {
    for (const [path, hash] of Object.entries(build.files)) expect(sha(path), path).toBe(hash);
    expect(Object.keys(build.files).sort()).toEqual([
      'tools/mamori-verify/Cargo.lock',
      'tools/mamori-verify/Cargo.toml',
      'tools/mamori-verify/dist/mamori_verify.wasm',
      'tools/mamori-verify/src/lib.rs',
    ]);
  });
});

describe('Rust 検算役 · 供給網と unsafe (言語の網羅 · threat: T-187)', () => {
  const read = (p: string): string => readOriginalSource(join(ROOT, p));
  it('依存 crate は 0 (Cargo.toml の [dependencies] は空・Cargo.lock の package は自分だけ)', () => {
    const toml = read('tools/mamori-verify/Cargo.toml');
    expect(/\[dependencies\]\s*(\n\s*)*\[/.test(toml + '\n[end]')).toBe(true);
    expect(toml.split('[dependencies]')[1]!.split('[')[0]!.trim()).toBe('');
    const lock = read('tools/mamori-verify/Cargo.lock');
    expect((lock.match(/\[\[package\]\]/g) ?? []).length).toBe(1);
    expect(lock).not.toMatch(/source\s*=/);
  });
  it('unsafe は 1 か所だけ (固定バッファの slice を作る 1 行)・std を使わない・panic は trap', () => {
    const code = stripComments(read('tools/mamori-verify/src/lib.rs'));
    expect((code.match(/\bunsafe\b/g) ?? []).length).toBe(1);
    expect(code).toContain('#![no_std]');
    expect(code).toContain('unreachable()');
    expect(code).not.toMatch(/loop\s*\{\s*\}/);
  });
});

describe('Rust 検算役 · TS コンパイラとの M0 の突き合わせ', () => {
  const realFiles = walk(join(ROOT, 'src'));

  it('実物の .mamori は Rust も全部通す (誤検出 0)', () => {
    expect(realFiles.length).toBeGreaterThanOrEqual(19);
    for (const f of realFiles) expect(rust(readOriginalSource(f)), f).toBe(0);
  });

  /** 手で選んだ禁じた綴り。TS が M0 で断るものは Rust も断る。 */
  const SPELLINGS: readonly [string, string][] = [
    ['as', 'return a as number;'],
    ['any', 'const x: any = a;'],
    ['eval', 'return eval(1);'],
    ['template', 'return `t`;'],
    ['block comment', 'return /* c */ a;'],
    ['constructor', 'return a.constructor;'],
    ['constructor optional', 'return a?.constructor;'],
    ['prototype', 'return a.prototype;'],
    ['__proto__', 'return a.__proto__;'],
    ['__defineGetter__', 'return a.__defineGetter__;'],
    ['index constructor', 'return a["constructor"];'],
    ['index escaped', 'return a["cons\\u0074ructor"];'],
    ['index hex escape', "return a['\\x63onstructor'];"],
    ['index optional', 'return a?.["constructor"];'],
    ['__proto__ key', 'return { __proto__: null };'],
    ['__proto__ string key', 'return { "__proto__": null };'],
    ['spread', 'return [...a];'],
    ['lone CR then as', '// c\rreturn a as number;'],
    ['LS then as', '// c\u2028return a as number;'],
    ['PS then as', '// c\u2029return a as number;'],
    ['bidi in comment', '// \u202e hidden'],
    ['ZWSP in string', 'return "a\u200bb";'],
    ['NUL in comment', '// a\u0000b'],
    ['BOM in regex', 'return /a\ufeffb/;'],
    ['ALM in string', 'return "a\u061cb";'],
    ['tag char in string', 'return "a\u{E0041}b";'],
    ['Hangul filler in comment', '// a\u3164b'],
    ['NBSP code', 'return a;'],
    ['non-ASCII ident', 'return café;'],
    ['hash', 'return #a;'],
    ['unclosed string', 'return "abc'],
    ['regex after brace as', 'return {}/{(a as number)/1;'],
  ];

  for (const [name, body] of SPELLINGS) {
    it(`禁じた綴り: ${name}`, () => {
      const src = `export fn f(a: unknown) -> unknown {\n  ${body}\n}\n`;
      const t = tsVerdict(src);
      const r = rust(src);
      // TS が M0 で断るなら Rust も断る (Rust の穴を許さない)
      if (t.spelling) expect(r, `Rust が通した: ${JSON.stringify(src)}`).not.toBe(0);
      // どちらも断らないのに食い違う形は無い
      if (t.ok) expect(r, `Rust だけが断った: ${JSON.stringify(src)}`).toBe(0);
    });
  }

  /**
   * 変異ファジング: 実物の原文へ禁じた綴り・隠し字・行終端を、行頭・注記の中・文字列の中・識別子の途中などへ
   * 種つきで差し込み、「TS が M0 で断る ∧ Rust が通す」を 0 件にする。
   */
  it('ファジング: TS が M0 で断り Rust が通す形は 0 件・Rust だけが断る形は台帳の範囲 (種 3 つ)', () => {
    const PAYLOADS = [
      'as', ' as ', 'any', 'eval(1)', '`t`', '/* c */', '.constructor', '?.prototype', '.__proto__', '...a', '["constructor"]',
      "['__proto__']", '{ __proto__: 1 }', '\r', '\u2028', '\u2029', '\u202e', '\u200b', '\u0000', '\ufeff', ' ', 'é', '#', '@', '\\',
      '"', "'", '/', '//', '/[/', '}/', ')/', '"]', '["', '\u0085', '\u061c', '\u180e', 'ａ', '\u00ad', '\u034f', '\u3164', '\u2800', '\u206a', '\u2065', '\u{E0041}', '\u{E0100}', '\u115f',
    ];
    const files = realFiles.map((f) => readOriginalSource(f));
    const tsHoles: string[] = [];
    let stricter = 0;
    const rustMissed: string[] = [];
    let cases = 0;
    for (const seed of [11, 22, 33]) {
      const rnd = mulberry32(seed);
      for (let n = 0; n < 700; n++) {
        const base = rnd() < 0.2 ? HOST : files[Math.floor(rnd() * files.length)]!;
        const at = Math.floor(rnd() * (base.length + 1));
        const p = PAYLOADS[Math.floor(rnd() * PAYLOADS.length)]!;
        const src = base.slice(0, at) + p + base.slice(at);
        cases++;
        const t = tsVerdict(src);
        const r = rust(src);
        const label = `seed=${seed} #${n} at=${at} payload=${JSON.stringify(p)} ctx=${JSON.stringify(src.slice(Math.max(0, at - 24), at + 24))}`;
        if (t.spelling && r === 0) rustMissed.push(label);
        if (t.ok && r !== 0) {
          // TS が通した生成物に危険な綴りが残るなら TS の穴、残らなければ Rust が型の位置などで厳しいだけ
          const holes = t.emitted.flatMap((e) => inspectEmitted('x.ts', e).filter((f) => f.kind === 'hole').map((f) => f.reason));
          if (holes.length > 0) tsHoles.push(`${label} → ${holes[0]}`);
          else stricter++;
        }
      }
    }
    expect(cases).toBe(2100);
    expect(rustMissed, `Rust が通した (検算役の穴):\n${rustMissed.slice(0, 10).join('\n')}`).toEqual([]);
    // Rust だけが断った形のうち、TS の生成物に危険な綴りが残るもの = TS コンパイラの穴 (0 件)
    expect(tsHoles, `TS が通し、生成物に穴が残る:\n${tsHoles.slice(0, 10).join('\n')}`).toEqual([]);
    // 残りは Rust が型の位置・文法の誤りの位置でも綴りを断るだけ (保守側)。0 でないことで比べる物が生きていると分かる
    expect(stricter).toBeGreaterThan(0);
  });
});
