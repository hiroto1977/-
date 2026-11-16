/**
 * 印 (関門を通った値の型) へ、関門を通らない値が流れ込む道を、型検査器で数える
 * (2026-11-16 · MG-074 · 台帳の T-272 / T-273)。
 *
 * 「危ない口は関門が作る印つきの型しか受けない」(T-220) を見ていたのは、`tsc` と、
 * 綴りの検査 (`vettedTypes.test.ts` —— `as Vetted…` を数える) だった。実測 (TypeScript 5.9.3 · strict) で、
 * 次の行は **`tsc` も綴りの検査も通る**:
 *
 *   openExternalVetted(JSON.parse(s));            // 型の無い値は、どの型の位置にも置ける
 *   openExternalVetted(await jsonFetch(url));     // 型引数 T が、文脈から印に推論される
 *   const cfg = JSON.parse(s) as Settings;        // Settings が印の欄を持つ (綴りに印が出ない)
 *
 * どれも「うっかり」書ける形である。ここでは両方の TypeScript の project (主プロセス・preload と、
 * renderer・shared) を型検査器に掛け、検査でない全ファイルについて違反が 0 件であることを見る。
 * 道具は `markFlow.ts`、鳴ることの標本は `markFlowSamples.ts` / `markFlowSamplesGenerated.ts`
 * (行末の印と両方向に突き合わせる —— 規則を 1 つ外すと、その標本の行で落ちる)。
 *
 * 型検査器を 2 つ立てるので、この検査は数十秒かかる。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import type ts from 'typescript';
import { loadMarkFlowProgram, scanMarkFlow, type MarkFlowFinding } from './markFlow';
import { originalSourcePath, readOriginalSource } from './originalSource';

/** リポジトリの根。変異検査の sandbox の中で走っても、原文の木を読む (計装した写しは型が変わる)。 */
const ROOT = originalSourcePath(resolve(__dirname, '../../..'));
const SAMPLES = join(ROOT, 'src/shared/__tests__/markFlowSamples.ts');
const SAMPLES_GENERATED = join(ROOT, 'src/shared/__tests__/markFlowSamplesGenerated.ts');

/** 違反ではない分類 (走査が実物を見ていることの証拠として返る)。 */
const isViolation = (f: MarkFlowFinding): boolean => !f.rule.startsWith('ok-');
const show = (f: MarkFlowFinding): string => `${f.rule} ${f.file}:${f.line}:${f.column} ${f.text}`;

let nodeProgram: ts.Program;
let appProgram: ts.Program;
let nodeFindings: MarkFlowFinding[];
let appFindings: MarkFlowFinding[];

beforeAll(() => {
  nodeProgram = loadMarkFlowProgram(ROOT, 'tsconfig.node.json');
  appProgram = loadMarkFlowProgram(ROOT, 'tsconfig.app.json', [SAMPLES, SAMPLES_GENERATED]);
  nodeFindings = scanMarkFlow(nodeProgram, { root: ROOT });
  appFindings = scanMarkFlow(appProgram, { root: ROOT });
}, 600_000);

/** 標本の行末の印を読む: `// !! <rule>` は鳴る・`// ok <rule>` は違反でない分類・`// ok` は鳴らない。 */
function expectedFromMarkers(file: string): string[] {
  const out: string[] = [];
  readOriginalSource(file).split('\n').forEach((line, i) => {
    const bad = /!!\s+([a-z-]+)/.exec(line);
    if (bad !== null) out.push(`${i + 1} ${bad[1]}`);
    const ok = /\/\/ ok\s+(ok-[a-z-]+)/.exec(line);
    if (ok !== null) out.push(`${i + 1} ${ok[1]}`);
  });
  return out.sort();
}
function foundIn(program: ts.Program, file: string, generated: boolean): string[] {
  const hits = scanMarkFlow(program, { root: ROOT, only: [file], isGenerated: () => generated });
  return [...new Set(hits.map((f) => `${f.line} ${f.rule}`))].sort();
}

describe('印へ流れ込む道: 実物', () => {
  it('★ 主プロセス・preload: 関門を通らない値が印へ流れ込む道は 0 件 (threat: T-272)', () => {
    expect(nodeFindings.filter(isViolation).map(show)).toEqual([]);
  });

  it('★ renderer・shared: 関門を通らない値が印へ流れ込む道は 0 件 (threat: T-272)', () => {
    expect(appFindings.filter(isViolation).map(show)).toEqual([]);
  });

  it('★ 型引数に印を明示して値を作れるのは、状態の入れ物 (useState) だけ', () => {
    // `useState<印 | null>(null)` は、入れた物しか出てこない (入れる側は上の検査が見る)。
    // 標準の関数でも、名前がここに無い物へ印を明示したら落ちる —— 何から値を作るのかを読んでから足す。
    const explicit = appFindings.filter((f) => f.rule === 'ok-generic-lib-explicit');
    expect(explicit.filter((f) => !/^useState</.test(f.text)).map(show)).toEqual([]);
    expect(nodeFindings.filter((f) => f.rule === 'ok-generic-lib-explicit').map(show)).toEqual([]);
  });

  it('床: 走査は実物を見ている (ファイルの数・生成物・印を作る呼び出し)', () => {
    const files = (p: ts.Program): string[] =>
      p.getSourceFiles().map((sf) => sf.fileName).filter((f) => f.startsWith(join(ROOT, 'src')));
    expect(files(nodeProgram).length).toBeGreaterThanOrEqual(60);
    expect(files(appProgram).length).toBeGreaterThanOrEqual(400);
    // 危ない口の包みと関門は、どちらかの project に必ず入っている。
    const all = new Set([...files(nodeProgram), ...files(appProgram)]);
    for (const rel of ['src/main/osSinks.ts', 'src/renderer/vettedSinks.ts', 'src/shared/externalUrlGate.ts', 'src/shared/vetted.ts']) {
      expect(all.has(join(ROOT, rel)), rel).toBe(true);
    }
    // 印を実際に作る呼び出し (型引数つき) を、走査が実物の中に見つけている —— 0 件なら型を訊けていない。
    expect(appFindings.filter((f) => f.rule.startsWith('ok-generic-')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('印へ流れ込む道: 標本 (規則が鳴ること・鳴らないこと)', () => {
  it('★ 標本の行末の印と、鳴った行が両方向に一致する (threat: T-272)', () => {
    const expected = expectedFromMarkers(SAMPLES);
    expect(foundIn(appProgram, SAMPLES, false)).toEqual(expected);
    // 標本は規則の種類を全部持つ (規則を足して標本を書き忘れると落ちる)。
    const rules = new Set(expected.map((e) => e.split(' ')[1]));
    for (const rule of [
      'any-to-mark', 'generic-from-nothing', 'cast-to-mark', 'cast-to-never', 'predicate-names-mark',
      'bodyless-names-mark', 'ts-directive', 'sink-widened', 'container-widened',
      'ok-generic-arg-carries-mark', 'ok-cast-from-mark',
    ]) {
      expect(rules.has(rule), rule).toBe(true);
    }
  });

  it('★ 生成物の標本: 型の無い値を型引数の位置へ置く形が鳴る (threat: T-272)', () => {
    const expected = expectedFromMarkers(SAMPLES_GENERATED);
    expect(expected.length).toBeGreaterThanOrEqual(4);
    expect(foundIn(appProgram, SAMPLES_GENERATED, true)).toEqual(expected);
  });

  it('★ 印を受ける関数・印の入れ物を、印を求めない型として持ち出す形が鳴る (threat: T-273)', () => {
    // 上の一致の検査と同じ走査の、持ち出しの 2 規則だけを名指しで見る (どちらかの規則を外すと、ここが落ちる)。
    const widened = (list: readonly string[]): string[] => list.filter((e) => / (sink|container)-widened$/.test(e));
    const expected = widened(expectedFromMarkers(SAMPLES));
    expect(expected.filter((e) => e.endsWith('sink-widened')).length).toBeGreaterThanOrEqual(4);
    expect(expected.filter((e) => e.endsWith('container-widened')).length).toBeGreaterThanOrEqual(4);
    expect(widened(foundIn(appProgram, SAMPLES, false))).toEqual(expected);
  });

  it('対照: 同じ標本を生成物でないとして走査すると、型引数の規則は鳴らない', () => {
    expect(foundIn(appProgram, SAMPLES_GENERATED, false)).toEqual([]);
  });

  it('標本は tsc (strict) を通る —— 型検査だけでは、どの行も断られない', () => {
    for (const file of [SAMPLES, SAMPLES_GENERATED]) {
      const sf = appProgram.getSourceFile(file);
      expect(sf, file).toBeDefined();
      const diagnostics = appProgram.getSemanticDiagnostics(sf).map((d) => String(d.messageText));
      expect(diagnostics, file).toEqual([]);
    }
  });
});
