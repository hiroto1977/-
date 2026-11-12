// 生成物 —— src/main/clients/exportSink.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * exportSink — **書き出しのファイル書き込みの、行き先の関門と口の組** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 書き出しの書き手 4 本 (templates / teamradar / stocks / business) は、行き先を真偽を返す関門
 * (`isSafeExportPath`) で調べてから、**同じ素の string** を書き込みの口 (`writeExportFile`) へ渡していた。
 * 調べた事実は型に残らないので、検査を飛ばして書く 1 行は `tsc` を通った (`SINK_LEDGER` の pending の 1 本)。
 *
 * ここでは調べた結果を印 `VettedExportPath` にして返し (`exportTargetOrNull` · gate)、書き込みの口は
 * 印つきの行き先しか受けない (`writeExportFileVetted` · sink —— 本文は第 2 引数で、型は問わない · M3)。
 * 判定そのものは `isSafeExportPath` (変異検査 100% の対象) を 1 字も変えずに使い、書き込みは
 * `writeExportFile` (実行時の閉じ込めと 0600) を通す —— ここが足すのは**型の来歴**だけである。
 */

import { isSafeExportPath } from './exportPaths';
import { writeExportFile } from './exportPaths';
import type { VettedExportPath } from '../../shared/vetted';

/** 書き出してよい行き先なら印つきのパス、駄目なら null (`isSafeExportPath` と同じ判定)。 */
export function exportTargetOrNull(filePath: unknown, home: string, ext: string): VettedExportPath | null {
  if (typeof filePath !== 'string') return null;
  if (!isSafeExportPath(filePath, home, ext)) return null;
  // 印を作るのはここだけ (M1)。書き込みの口はこの型しか行き先に受けない。
  return filePath as VettedExportPath;
}

/** 印つきの行き先へ書く。閉じ込めの再確認と権限 (0600) は `writeExportFile` が持つ。 */
export function writeExportFileVetted(filePath: VettedExportPath, content: string): Promise<void> {
  return writeExportFile(filePath, content);
}
