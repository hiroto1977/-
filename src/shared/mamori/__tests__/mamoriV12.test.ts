import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.12 —— `catch (e)` の束縛** (2026-11-01 · MG-016)。
 *
 * 束ねた例外は `unknown` で、印を運ばない局所の値。回す変数と同じ扱いで handler の中だけで見える。
 * 足す前に破った (手探り 12 形): 印を受ける口へ渡す・印の型として返す・handler の外で使う・代入する・`.constructor`・文字列の添字・
 * 型注釈・2 つ以上の名前・分割代入・sink の名前で影にする・`field e.message` (通ってよい形)。
 */

const PRE = 'extern sink global window;\nexport vetted VettedUrl = "url";\nexport sink fn openIt(u: VettedUrl) -> void {\n  window.open(u);\n}\n';
function compile(source: string) {
  return compileProject([{ path: 'src/x/m0.mamori', source }]);
}
function diag(source: string): string[] {
  const r = compile(source);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function emitted(source: string): string {
  const r = compile(source);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return r.outputs.get('src/x/m0.ts')!;
}
const TRY = (binding: string, handler: string): string =>
  `export fn f(raw: string) -> unknown {\n  try {\n    return JSON.parse(raw);\n  } catch ${binding}{\n${handler}\n  }\n}\n`;

describe('0.12: catch (e) の束縛', () => {
  it('★ 束縛つきの catch は通り、生成物にそのまま出る', () => {
    expect(emitted(TRY('(e) ', '    return field e.message;'))).toContain('} catch (e) {');
  });
  it('★ 束縛の無い catch は今までどおり (束縛を足さない)', () => {
    const text = emitted(TRY('', '    return 1;'));
    expect(text).toContain('} catch {');
    expect(text).not.toContain('catch (');
  });
  it('★ 束縛の名前は括弧の中の識別子 1 つだけ (型注釈・2 つ・分割代入は断る)', () => {
    expect(diag(TRY('(e: unknown) ', '    return 1;')).join('\n')).toContain('[M0]');
    expect(diag(TRY('(a, b) ', '    return 1;')).join('\n')).toContain('[M0]');
    expect(diag(TRY('({ message }) ', '    return 1;')).join('\n')).toContain('[M0]');
    expect(diag(TRY('() ', '    return 1;')).join('\n')).toContain('[M0]');
  });
});

describe('0.12: 束ねた例外は印を運ばない (threat: MG-016)', () => {
  it('★ 印を受ける口へ渡すと M4 で断る (素の値と同じ)', () => {
    const d = diag(PRE + 'export fn f(raw: string) -> void {\n  try {\n    openIt(raw);\n  } catch (e) {\n    openIt(e);\n  }\n}\n').join('\n');
    expect(d).toContain('[M4]');
    expect(d).toContain('印 VettedUrl を持つ値だけを受けます');
  });
  it('★ 印の型として返す形は gate の外では M1 で断る', () => {
    const d = diag(PRE + 'export fn f(raw: string) -> VettedUrl {\n  try {\n    return raw;\n  } catch (e) {\n    return e;\n  }\n}\n').join('\n');
    expect(d).toContain('[M1]');
  });
  it('★ handler の外では見えない (try の本体でも、catch の後でも宣言していない名前)', () => {
    const after = diag('export fn f(raw: string) -> unknown {\n  try {\n    return raw;\n  } catch (e) {\n    return 1;\n  }\n  return e;\n}\n').join('\n');
    expect(after).toContain('[M6]');
    expect(after).toContain('宣言していない名前 e');
    const inBody = diag('export fn f(raw: string) -> unknown {\n  try {\n    return e;\n  } catch (e) {\n    return 1;\n  }\n}\n').join('\n');
    expect(inBody).toContain('[M6]');
  });
  it('★ 束縛へは代入できない (let ではない)', () => {
    const d = diag(TRY('(e) ', '    e = 1;\n    return e;')).join('\n');
    expect(d).toContain('[M6]');
    expect(d).toContain('let ではないので代入できません');
  });
  it('★ 束縛の欄は T-224 の表を通る (.constructor と文字列の添字は断る)', () => {
    expect(diag(TRY('(e) ', '    return e.constructor;')).join('\n')).toContain('[M0]');
    expect(diag('export fn f(raw: string, k: string) -> unknown {\n  try {\n    return raw;\n  } catch (e) {\n    return e[k];\n  }\n}\n').join('\n')).toContain('[M6]');
  });
  it('対照: 欄は field で読め、外側の同名の定数は handler の後でも使える', () => {
    expect(diag(TRY('(e) ', '    return field e.message;'))).toEqual([]);
    expect(diag('export fn f(raw: string) -> unknown {\n  const e = 1;\n  try {\n    return raw;\n  } catch (e) {\n    return 2;\n  }\n  return e;\n}\n')).toEqual([]);
  });
});
