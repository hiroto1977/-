import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.11 —— 戻り値の型に印を名乗れるのは gate 関数だけ** (2026-11-01 · MG-011 · T-248)。
 *
 * safeFilename.ts を移すとき、型述語 `-> s is string` が通るかを確かめて見つけた。述語は `tsc` も検めない型の主張 (`as` と同じ) で、
 * 戻り値に `true` を返すだけで呼び出し側の `x` が `T` に絞られる。`T` が印の型 (`VettedUrl`) なら、関門 (`mint`) を通らずに
 * 印の型を作れる —— 印を作れるのは gate の `mint` だけ、という M1 の穴だった。plain / sink 関数が `-> VettedUrl` と宣言する形も
 * Mamori 自身は通していて、`tsc` が断るのを待っていた。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function diag(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const MSG = '戻り値の型に印 VettedUrl を名乗れるのは gate 関数だけです';

describe('T-248: 戻り値の型の印は gate 関数だけ', () => {
  const CASES: readonly [string, string][] = [
    ['型述語 `s is VettedUrl`', 'export fn isUrl(s: unknown) -> s is VettedUrl {\n  return true;\n}\n'],
    ['型述語 `s is VettedUrl | null`', 'export fn isUrl(s: unknown) -> s is VettedUrl | null {\n  return true;\n}\n'],
    ['型述語 `s is string | VettedUrl`', 'export fn isUrl(s: unknown) -> s is string | VettedUrl {\n  return true;\n}\n'],
    ['型述語 `s is readonly VettedUrl[]`', 'export fn isUrls(s: unknown) -> s is readonly VettedUrl[] {\n  return true;\n}\n'],
    ['`asserts s is VettedUrl`', 'export fn a(s: unknown) -> asserts s is VettedUrl {\n  return;\n}\n'],
    ['`this is VettedUrl`', 'export fn f(s: unknown) -> this is VettedUrl {\n  return true;\n}\n'],
    ['plain 関数の `-> VettedUrl`', 'export fn f(raw: string) -> VettedUrl {\n  return raw;\n}\n'],
    ['plain 関数の `-> Promise<VettedUrl>`', 'export fn f(raw: string) -> Promise<VettedUrl> {\n  return raw;\n}\n'],
    ['sink 関数の `-> VettedUrl`', 'export sink fn g(u: VettedUrl) -> VettedUrl {\n  return u;\n}\n'],
  ];
  for (const [name, body] of CASES) {
    it(`★ ${name} は断る (threat: T-248)`, () => {
      const d = diag(PRE + body).join('\n');
      expect(d).toContain('[M1]');
      expect(d).toContain(MSG);
    });
  }
  it('★ 9 つの形がすべて M1 で断られる (印の型を関門の外で名乗れない) (threat: T-248)', () => {
    expect(CASES.every(([, body]) => diag(PRE + body).join('\n').includes(MSG))).toBe(true);
  });
  it('★ 断りは戻り値の型の位置を名乗る', () => {
    const d = diag(PRE + 'export fn isUrl(s: unknown) -> s is VettedUrl {\n  return true;\n}\n');
    expect(d[0]).toMatch(/^src\/x\/m0\.mamori:6:32: \[M1\] isUrl: /);
  });
  it('対照: gate 関数は印を返せる・印を名乗らない型述語や戻り値は plain でも書ける', () => {
    expect(diag(PRE + 'export gate fn gate(raw: string) -> VettedUrl {\n  return mint VettedUrl(raw);\n}\n')).toEqual([]);
    expect(diag(PRE + 'export fn isStr(s: unknown) -> s is string {\n  return typeof s === "string";\n}\n')).toEqual([]);
    expect(diag(PRE + 'export fn n(raw: string) -> string | null {\n  return raw;\n}\n')).toEqual([]);
    expect(diag(PRE + 'export fn p(raw: string) -> Promise<void> {\n  return openUrl(raw);\n}\n').join('\n')).not.toContain(MSG);
  });
});

describe('T-249: `extern pure global` にできない host の名前', () => {
  const NAMES = ['window', 'document', 'globalThis', 'self', 'navigator', 'location', 'localStorage', 'indexedDB', 'process', 'require', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Function', 'Reflect', 'Proxy'];
  for (const name of NAMES) {
    it(`★ \`extern pure global ${name}\` は M6 で断る (threat: T-249)`, () => {
      const d = diag(`extern pure global ${name};\nexport fn f() -> number {\n  return 1;\n}\n`).join('\n');
      expect(d).toContain('[M6]');
      expect(d).toContain(`extern pure global ${name}\` は宣言できません`);
    });
  }
  it('★ 宣言を断ったので `window.open(生の値)` / `document.write(html)` も書けない (threat: T-249)', () => {
    expect(diag('extern pure global window;\nexport fn f(u: string) -> void {\n  window.open(u);\n}\n').join('\n')).toContain('[M6]');
    expect(diag('extern pure global document;\nexport fn f(h: string) -> void {\n  document.write(h);\n}\n').join('\n')).toContain('[M6]');
  });
  it('対照: 副作用の判断を持たない `Date` と、`extern sink global` と、関数を読む `extern pure { … } from` は今までどおり通る', () => {
    expect(diag('extern pure global Date;\nexport fn f() -> number {\n  return Date.now();\n}\n')).toEqual([]);
    expect(diag('extern sink global window;\nexport vetted VettedUrl = "url";\nexport sink fn g(u: VettedUrl) -> void {\n  window.open(u);\n}\n')).toEqual([]);
    // 名前が host と同じでも、モジュールから読む物は host そのものではない (global の宣言だけを断る)
    expect(diag('extern pure { window } from "./host";\nexport fn f() -> unknown {\n  return window;\n}\n')).toEqual([]);
    expect(diag('extern pure { hostWindowTarget } from "./host";\nexport fn f() -> unknown {\n  return hostWindowTarget();\n}\n')).toEqual([]);
  });
});
