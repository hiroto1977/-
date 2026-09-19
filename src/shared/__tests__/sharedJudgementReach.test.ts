/**
 * **判定 census の「main はこの問いを発しない」を、事実の側から留める。** (2026-09-15 · パス 272)
 *
 * `lint:shared-judgement` の台帳 (`scripts/shared-judgement-census.cjs` の `VERDICTS`) は
 * **散文**である。パス 272 で最後の未読 6 件を読み切ったが、そのうち 5 件の判定は
 * ただ 1 つの事実に乗っている:
 *
 *   「main がその鎖から import するのは**射影する関数 1 つだけ**で、
 *     否定で答える関数を 1 度も呼ばない」
 *
 * **その事実が変わった日に、散文は黙って偽になる。** 台帳の両方向のゲートは
 * 「モジュールが母集団に入ったか」しか見ないので、*同じモジュールのまま
 * main 側が import を増やした*場合は鳴らない —— 判定の前提だけが崩れる。
 *
 * ここで留めるのは 2 本の鎖の**入口の狭さ**である。広げたら鳴る。
 * 広げること自体は禁じていない —— 鳴ったら **census の判定を読み直せ**という合図である。
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = resolve(__dirname, '../../..');
const read = (rel: string): string => readOriginalSource(resolve(REPO, rel));

/** `from '…<module>'` を持つ import 文の、波括弧の中身 (値の import だけ・型は落とす)。 */
export function valueImportsFrom(src: string, moduleTail: string): string[] {
  const names: string[] = [];
  const rx = new RegExp(
    String.raw`import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*${moduleTail}['"]`,
    'g',
  );
  for (const m of src.matchAll(rx)) {
    if (m[1] !== undefined) continue; // `import type { … }` は判定を呼べない
    for (const part of (m[2] ?? '').split(',')) {
      const name = part.trim().replace(/^type\s+/, '');
      if (name.length > 0 && !/^type\s/.test(part.trim())) names.push(name.split(/\s+as\s+/)[0]!);
    }
  }
  return names.sort();
}

describe('判定 census の前提 — 鎖の入口の狭さ (パス 272)', () => {
  /*
   * 鎖 A: main → clients/hydroponics.ts → hydroponicsControl → hydroponicCrops
   *       → { hydroponics, readNumeric }
   *
   * 台帳の 4 件 (`hydroponicCrops` / `hydroponics` / `readNumeric` /
   * `hydroponicsControl`) が「非対称は起きない」と言える根拠。
   */
  it('★ main は hydroponicsControl から射影 1 つしか取らない', () => {
    const src = read('src/main/clients/hydroponics.ts');
    expect(valueImportsFrom(src, 'hydroponicsControl')).toEqual(['buildHydroponicsSnapshot']);
  });

  it('★ buildHydroponicsSnapshot は定数表を射影するだけ (否定を呼ばない)', () => {
    const src = read('src/shared/hydroponicsControl.ts');
    const start = src.indexOf('export function buildHydroponicsSnapshot');
    expect(start, '関数が見つからない (走査の死)').toBeGreaterThan(0);
    // 次の `\nexport ` までを本体とする。
    const end = src.indexOf('\nexport ', start + 1);
    const body = end < 0 ? src.slice(start) : src.slice(start, end);
    // 呼んでいる名前を集め、**否定で答える関数が 1 つも無い**ことを見る。
    for (const forbidden of [
      'readingFromStored',
      'batchFromStored',
      'batchSchedule',
      'nextSolutionChange',
      'lowPotassiumSwitchDate',
      'latestReading',
      'isBatchState',
      'cropListOrDefault',
      'resolveCropFrom',
      'findCrop',
      'readNumberOr0',
    ]) {
      expect(body.includes(`${forbidden}(`), `${forbidden} を呼んでいる`).toBe(false);
    }
    // 肯定形 —— 射影が 2 つ在ること (走査が本体を取れている証拠)。
    expect(body).toContain('READING_FIELDS.map(');
    expect(body).toContain('DEFAULT_CROP_LIST.map(');
  });

  /*
   * 鎖 B: main → 4 クライアント → serviceAdvisor → mutualFundsMetrics → savingsPlanning
   *
   * `mutualFundsMetrics` は越境する (`isImpossibleReturnPct`) が対称。
   * `savingsPlanning` は **call の辺が無い**ので問いが発されない。
   */
  it('★ serviceAdvisor が mutualFundsMetrics から取るのは定数 1 + 述語 1 だけ', () => {
    const src = read('src/shared/serviceAdvisor.ts');
    expect(valueImportsFrom(src, 'mutualFundsMetrics')).toEqual([
      'RETURN_FLOOR_PCT',
      'isImpossibleReturnPct',
    ]);
  });

  it('★ serviceAdvisor は savingsPlanning の述語を呼ばない (import も 0 件)', () => {
    const src = read('src/shared/serviceAdvisor.ts');
    expect(valueImportsFrom(src, 'savingsPlanning')).toEqual([]);
    expect(src.includes('isPlannableRate(')).toBe(false);
    expect(src.includes('isPlannableYears(')).toBe(false);
  });

  it('★ isImpossibleReturnPct は 1 行の比較 (下請けを呼ばない)', () => {
    const src = read('src/shared/mutualFundsMetrics.ts');
    const start = src.indexOf('export function isImpossibleReturnPct');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('\n}', start) + 2);
    expect(body).toContain('pct < RETURN_FLOOR_PCT');
    expect(body.includes('isPlannable')).toBe(false);
  });

  it('★ taxCalc を import する main / preload のファイルは 0 件 (depreciation の根拠)', () => {
    // 鎖 `depreciation` → `taxCalc` の先に main が居ないことを、綴りで見る。
    // 台帳の `depreciation` の判定はこの 0 件に乗っている。
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readOriginalDirEntries(dir)) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p);
        } else if (e.name.endsWith('.ts') && /taxCalc['"]/.test(readOriginalSource(p))) {
          hits.push(p.slice(REPO.length + 1));
        }
      }
    };
    walk(resolve(REPO, 'src/main'));
    walk(resolve(REPO, 'src/preload'));
    expect(hits).toEqual([]);
  });

  /* 対照 —— 抽出器が本当に名前を取れているか (空の検査にしない)。 */
  describe('対照 — 抽出器が生きている', () => {
    it('★ 値の import は名前を返す', () => {
      const s = "import { a, b as c } from '../x/thing';";
      expect(valueImportsFrom(s, 'thing')).toEqual(['a', 'b']);
    });

    it('★ `import type { … }` は判定を呼べないので落とす', () => {
      const s = "import type { A, B } from '../x/thing';";
      expect(valueImportsFrom(s, 'thing')).toEqual([]);
    });

    it('★ 別のモジュールの import は混ざらない', () => {
      const s = "import { a } from '../x/thing';\nimport { z } from '../x/other';";
      expect(valueImportsFrom(s, 'other')).toEqual(['z']);
    });

    it('名前が無ければ空 (import が無いとき)', () => {
      expect(valueImportsFrom('const x = 1;', 'thing')).toEqual([]);
    });
  });
});
