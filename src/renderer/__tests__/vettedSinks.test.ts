import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWindowVetted } from '../vettedSinks';
import { externalUrlOrNull } from '../../shared/externalUrlGate';
import type { VettedExternalUrl, VettedShellPath } from '../../shared/vetted';

/*
 * **ブラウザ版の外へ開く口** (2026-10-30 · パス 559 · threat: T-220)。
 * 包みは `noopener,noreferrer` を固定する —— 呼び出し側が付け忘れても、開いた頁は `window.opener`
 * 経由でこの頁 (保管庫と同じオリジン) を書き換えられない。
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openWindowVetted', () => {
  it('印つきの URL を新しいタブで、opener を渡さずに開く', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const url = externalUrlOrNull('https://example.com/a');
    expect(url).not.toBeNull();
    openWindowVetted(url!);
    expect(open.mock.calls).toEqual([['https://example.com/a', '_blank', 'noopener,noreferrer']]);
  });
});

/* 型の陰性対照 —— 呼ばれない。`npm run typecheck` が検査する。 */
function compileTimeControls(raw: string, path: VettedShellPath, url: VettedExternalUrl): void {
  // @ts-expect-error 関門を通らない URL は開けない
  openWindowVetted(raw);
  // @ts-expect-error パスの印は URL の口へ渡せない
  openWindowVetted(path);
  openWindowVetted(url);
}
void compileTimeControls;
