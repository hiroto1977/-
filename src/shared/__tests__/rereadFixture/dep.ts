/**
 * `rereadModule` の振る舞いを測るための標本 —— **依存先** (2026-09-27 · パス 495)。
 *
 * 評価されるたびに新しい物を作るので、同じ物か (`toBe`) で「評価し直されたか」が分かる。
 * 製品のコードは 1 行も読まない (この標本を評価し直しても、変異検査の被覆は動かない)。
 */
export const depInstance: { readonly label: string } = { label: 'dep' };

export function depAnswer(): string {
  return 'real';
}
