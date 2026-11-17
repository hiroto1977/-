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
  /閉じていません|行の内で閉じていません/,
  // 0.40 (MG-078) の数の綴りと、数字の無い `0x` —— 検算役は 0.3 (MG-079) から規則 12 で断る
  /数の綴り `/,
  /の後に 16 進の数字/,
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
    ['number leading zero', 'return 08;'],
    ['number double zero', 'return 00;'],
    ['number zero underscore', 'return 0_1;'],
    ['number trailing underscore', 'return 1_;'],
    ['number double underscore', 'return 1__0;'],
    ['number underscore before dot', 'return 1_.5;'],
    ['number leading zero fraction', 'return 01.5;'],
    ['hex without digits', 'return 0x;'],
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

  /** TS が数の綴り (0.40) か数字の無い `0x` で断ったか。字句の段の誤りは診断か例外で届くので、両方を読む。 */
  const NUMBER_REASON = /数の綴り `|の後に 16 進の数字/;
  function tsRefusesNumber(src: string): boolean {
    try {
      const r = compileProject([{ path: 'src/x/m0.mamori', source: src }]);
      return !r.ok && r.diagnostics.some((d) => d.rule === 'M0' && NUMBER_REASON.test(d.message));
    } catch (e) {
      return NUMBER_REASON.test(String((e as Error).message));
    }
  }

  /**
   * 数の綴りの総当たり (MG-079): 数に関わる 7 字 (`0` `1` `8` `_` `.` `x` `f`) の長さ 1〜5 の並びすべてを式の位置へ置き、
   * 「TS が数の綴りで断る ⟺ Rust が規則 12 を返す」を両方向で見る。この 7 字からは他の禁じた綴りが作れないので、
   * Rust が 0 でも 12 でもない番号を返すことも無い。2 つの実装は書き方が違う (TS は正規表現 1 本・Rust は 1 字ずつ前の字を見る)。
   */
  it('★ 数の綴りの総当たり: TS が断る ⟺ Rust が規則 12 (7 字 × 長さ 1〜5 = 19,607 本)', () => {
    const ALPHABET = ['0', '1', '8', '_', '.', 'x', 'f'];
    const mismatches: string[] = [];
    let total = 0;
    let refused = 0;
    let accepted = 0;
    const walkWords = (word: string): void => {
      if (word.length > 0) {
        total++;
        const src = `export fn f(a: unknown) -> unknown {\n  return ${word};\n}\n`;
        const t = tsRefusesNumber(src);
        const r = rust(src);
        if (r !== 0 && r !== 12) mismatches.push(`${word}: Rust が ${r} を返した`);
        else if (t !== (r === 12)) mismatches.push(`${word}: TS ${t ? '断る' : '通す'} / Rust ${r}`);
        if (r === 12) refused++;
        else accepted++;
      }
      if (word.length < 5) for (const c of ALPHABET) walkWords(word + c);
    };
    walkWords('');
    expect(total).toBe(7 + 7 ** 2 + 7 ** 3 + 7 ** 4 + 7 ** 5);
    expect(mismatches.slice(0, 10), `食い違い ${mismatches.length} 件`).toEqual([]);
    // 両側に標本が在る (どちらかが 0 なら、総当たりは片方の答えしか見ていない)
    expect(refused).toBeGreaterThan(1000);
    expect(accepted).toBeGreaterThan(1000);
  });

  /**
   * 禁じた語は `.` の後ろでも両方が断る (MG-079)。検算役は 0.2 まで `.` の後ろの語を原型への道 (規則 6) だけで見ており、
   * `x.eval` / `x.as` / `x.any` を通していた —— TS の字句の段は位置を見ずに断るので「TS は断り Rust は通す」形だった。
   * 揺さぶりの検査は差し込む物の表を変えた日に初めてこの形へ届いた (それまでの種の並びでは 1 度も作られなかった)。
   */
  it('★ 禁じた語 (as / any / eval) は `.` / `?.` の後ろでも TS と Rust の両方が断る', () => {
    const wrap = (body: string): string => `export fn f(a: unknown) -> unknown {\n  return ${body};\n}\n`;
    const CODE: Readonly<Record<string, number>> = { as: 1, any: 2, eval: 3 };
    for (const word of Object.keys(FORBIDDEN_WORDS)) {
      expect(CODE[word], `検算役の番号の表に無い禁じた語: ${word}`).toBeDefined();
      for (const body of [`a.${word}`, `a?.${word}`, `a.${word}(1)`, `a . ${word}`, `a.b.${word}`]) {
        const src = wrap(body);
        expect(tsVerdict(src).spelling, `TS が断らない: ${body}`).toBe(true);
        expect(rust(src), `Rust: ${body}`).toBe(CODE[word]);
      }
    }
    // 対照: その語を含むだけの名前は、どちらも綴りでは断らない
    for (const body of ['a.asset', 'a.anything', 'a.evaluate', 'a.has']) {
      const src = wrap(body);
      expect(tsVerdict(src).spelling, body).toBe(false);
      expect(rust(src), body).toBe(0);
    }
  });

  it('対照: 正しい数の綴りは Rust も通し、断るときは規則 12 を名乗る', () => {
    const wrap = (w: string): string => `export fn f(a: unknown) -> unknown {\n  return ${w};\n}\n`;
    for (const ok of ['0', '7', '10', '1_000', '1_0_0', '0.5', '10.25', '1_000.5', '0x1F', '0X0a', '0xff']) expect(rust(wrap(ok)), ok).toBe(0);
    for (const bad of ['08', '00', '007', '0_1', '1_', '1__0', '1_.5', '01.5', '0x', '0X']) expect(rust(wrap(bad)), bad).toBe(12);
    // 文字列と注記の中の同じ綴りは数ではない
    expect(rust(wrap('"08"'))).toBe(0);
    expect(rust('// 08 1__0 0x\n' + wrap('1'))).toBe(0);
    // 名前の途中の数字は数ではない (`a08` `x1_`)
    expect(rust(wrap('a08'))).toBe(0);
    expect(rust(wrap('x1_'))).toBe(0);
  });

  /**
   * 変異ファジング: 実物の原文へ禁じた綴り・隠し字・行終端を、行頭・注記の中・文字列の中・識別子の途中などへ
   * 種つきで差し込み、「TS が M0 で断る ∧ Rust が通す」を 0 件にする。
   */
  it('ファジング: TS が M0 で断り Rust が通す形は 0 件・Rust だけが断る形は台帳の範囲 (種 3 つ)', () => {
    const PAYLOADS = [
      'as', ' as ', 'any', 'eval(1)', '`t`', '/* c */', '.constructor', '?.prototype', '.__proto__', '...a', '["constructor"]',
      "['__proto__']", '{ __proto__: 1 }', '\r', '\u2028', '\u2029', '\u202e', '\u200b', '\u0000', '\ufeff', ' ', 'é', '#', '@', '\\',
      '"', "'", '/', '//', '/[/', '}/', ')/', '"]', '["', '\u0085', '\u061c', '\u180e', 'ａ', '\u00ad', '\u034f', '\u3164', '\u2800', '\u206a', '\u2065', '\u{E0041}', '\u{E0100}', '\u115f',
      // 数の綴り (0.40 · 検算役は 0.3 から規則 12): 名前の途中・数の途中・文字列の中へも差し込まれる
      '08', ' 00 ', '1__0', ' 1_ ', '0x ', '0_1', '_', '0',
    ];
    const files = realFiles.map((f) => readOriginalSource(f));
    const tsHoles: string[] = [];
    let stricter = 0;
    let bothRefused = 0;
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
        if (t.spelling && r !== 0) bothRefused++;
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
    // 残りは Rust が型の位置・文法の誤りの位置でも綴りを断るだけ (保守側)。0.38 まではこの種で 2 件在った (戻り値の型の語の後ろの
    // `.constructor` / `.__proto__`) —— 0.39 (T-276) で TS のコンパイラも型の語の後ろの `.名前` を断るようになり、この種では 0 件になった。
    // だから「比べる物が生きている」ことは、両方が断った件数で見る (0 件なら、差し込みが 1 つも綴りの検めに届いていない)。
    expect(stricter).toBeGreaterThanOrEqual(0);
    expect(bothRefused).toBeGreaterThan(100);
  });
});
