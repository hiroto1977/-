/**
 * Mamori のコンパイラの入口 (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 入力は `.mamori` のファイル群 (道と中身)、出力は同じ道の `.ts`。読み書きはしない —— ディスクに触るのは
 * CLI (`scripts/mamori.cjs`) と検査だけで、ここは純関数である (同じ入力は同じ出力)。
 *
 * 1 つでも誤りが在れば**何も出さない** —— 来歴の規則を破ったモジュールから TypeScript を作ると、
 * 破った所が `tsc` には正しいコードに見えたまま出荷されうる。
 */
import { checkModule, collectTable, type MamoriDiagnostic } from './checker';
import { emitModule } from './emit';
import { MamoriError, parse } from './parser';
import type { Module } from './ast';

export interface SourceFile {
  /** リポジトリからの道 (`src/shared/vetted.mamori`)。 */
  readonly path: string;
  readonly source: string;
}

export type CompileResult =
  | { readonly ok: true; readonly outputs: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly diagnostics: readonly MamoriDiagnostic[] };

/** `.mamori` の道 → 生成する `.ts` の道。 */
export function outputPathOf(path: string): string {
  if (!path.endsWith('.mamori')) throw new Error(`Mamori の元は .mamori で終わります: ${path}`);
  return `${path.slice(0, -'.mamori'.length)}.ts`;
}

export function compileProject(files: readonly SourceFile[]): CompileResult {
  const diagnostics: MamoriDiagnostic[] = [];
  const parsed: { file: string; module: Module }[] = [];
  for (const f of files) {
    try {
      parsed.push({ file: f.path, module: parse(f.path, f.source) });
    } catch (e) {
      if (!(e instanceof MamoriError)) throw e;
      diagnostics.push({ file: e.file, line: e.pos.line, col: e.pos.col, rule: 'M0', message: e.reason });
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const { table, diagnostics: tableProblems } = collectTable(parsed);
  diagnostics.push(...tableProblems);
  for (const { file, module } of parsed) diagnostics.push(...checkModule(file, module, table));
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const outputs = new Map<string, string>();
  for (const { file, module } of parsed) outputs.set(outputPathOf(file), emitModule(module, file));
  return { ok: true, outputs };
}

/** 誤りを人が読む 1 行ずつに。 */
export function formatDiagnostic(d: MamoriDiagnostic): string {
  return `${d.file}:${d.line}:${d.col}: [${d.rule}] ${d.message}`;
}
