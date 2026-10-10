/**
 * **時価評価 (現金 + 保有の時価) の式は 1 か所だけ** (2026-09-12 · パス 189)。
 *
 * `main/clients/stocks.ts` は 2026-08 に「時価評価は `portfolioEquity` に 1 つだけ
 * 置く。ここと Markdown 側とバックテストで同じ式を 3 つ持っていたが、値段の
 * 取り違えは画面に出ないので、写し間違えても気付けない形だった」と**書いた**。
 * それでも 2026-09-12 の実測では、その宣言の外に写しが **2 つ**在った:
 *
 * | 場所 | 形 |
 * | --- | --- |
 * | `renderer/pages/StocksPage.tsx` | `equity` の `useMemo` が自分で足し上げる |
 * | `renderer/data/stocksAnalysisWeb.ts` | 私用の `portfolioEquity` (同じ本体) |
 *
 * **散文の宣言は鍵にならない。** 走査にする —— 保有を値段で掛けて足し込む形が
 * `shared/paperAccount.ts` の外に現れたら鳴る。
 *
 * 1 取引の現金の動き (`applySignal` の `const cost = shares * price` /
 * `const proceeds = pos.shares * price`) は**別の量**なので、規則は
 * 「積み上げる形」(`+=`) だけに当てる。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/** 保有 × 値段を累算器へ足し込む形。 */
const ACCUMULATE = /\+=\s*[A-Za-z_$][\w$]*\.shares\s*\*/;

/** 規則を持つことを許された 1 ファイル。 */
const OWNER = 'src/shared/paperAccount.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('時価評価の式は shared/paperAccount.ts だけが持つ', () => {
  const files = walk('src');

  it('走査対象が実在する (走査が死んでいれば鳴る)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain(OWNER);
    expect(files).toContain('src/renderer/pages/StocksPage.tsx');
    expect(files).toContain('src/renderer/data/stocksAnalysisWeb.ts');
    expect(files).toContain('src/main/clients/stocks.ts');
  });

  it('★ 規則は標本に当たる (綴り違いで黙る検査でないこと)', () => {
    expect(ACCUMULATE.test('    if (price != null) equity += pos.shares * price;')).toBe(true);
    expect(ACCUMULATE.test('      if (w) e += pos.shares * w.latestClose;')).toBe(true);
    // 1 取引の現金の動きには当たらない (別の量)
    expect(ACCUMULATE.test('    const cost = shares * price;')).toBe(false);
    expect(ACCUMULATE.test('  const proceeds = pos.shares * price;')).toBe(false);
  });

  it('★ 所有者の外に写しが無い', () => {
    const copies = files.filter((f) => f !== OWNER && ACCUMULATE.test(readOriginalSource(f)));
    expect(copies).toEqual([]);
  });

  it('★ 所有者は実際にその式を持っている (規則が空振りしていない)', () => {
    expect(ACCUMULATE.test(readOriginalSource(OWNER))).toBe(true);
  });

  it('★ 画面と main とブラウザ版は所有者を読む (自前で持たない)', () => {
    for (const f of [
      'src/renderer/pages/StocksPage.tsx',
      'src/main/clients/stocks.ts',
      'src/renderer/data/stocksAnalysisWeb.ts',
    ]) {
      expect(readOriginalSource(f)).toMatch(/from '(\.\.\/)+shared\/paperAccount'/);
    }
  });
});
