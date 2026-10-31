/**
 * `rereadModule` の振る舞いを測るための標本 —— **読み直す対象** (2026-09-27 · パス 495)。
 *
 * 評価したときに見た依存先を `seenDep` として持つ。読み直した対象の `seenDep` が
 * 静的に読んだ依存先と同じ物なら、依存先は評価し直されていない。
 */
import { depAnswer, depInstance } from './dep';

export const targetInstance: { readonly label: string } = { label: 'target' };

/** 評価したときに見た依存先。 */
export const seenDep = depInstance;

export function answerFromDep(): string {
  return depAnswer();
}
