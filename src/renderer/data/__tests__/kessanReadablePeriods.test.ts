/**
 * **計算書類が、アプリ自身が「読めない」と宣言した期の行を合算していた**
 * (2026-09-22 · パス 393)。
 *
 * ## 何が起きていたか
 *
 * `buildKessanImport` は事業年度を**文字列の大小だけ**で切り出していた ——
 * `r.period >= fy.from && r.period <= fy.to`。文字列の大小は `YYYY-MM` の形を
 * 要求しないので、**窓に入るが読めない**形が通る。実測 (`fy = 2025-04〜2026-03`)
 * で 6 形: `'2025-6'` / `'2025-13'` / `'2025-06-15'` / `'2025-99'` / `'2025-1x'` /
 * `'2026-00'`。
 *
 * **同じ形が 3 か所に在り、選別を落としていたのはこの 1 か所だけ**だった ——
 * 同じ関数の `else` の枝は `PERIOD_RE.test` で選別し、兄弟の
 * `docImports.ts` の事業計画書も `valid.filter(...)` で先に選別していた。
 *
 * ## 効くのはいちばん重い紙である (実測)
 *
 * 読める 1 件 (100 万) + `'2025-6'` の 1 件 (900 万):
 *
 * | 面 | 売上高 |
 * | --- | --- |
 * | **計算書類 (損益計算書)** | **10,000,000** —— 読めない 1 行で 10 倍 |
 * | 事業計画書 | 1,000,000 |
 * | 経営サマリー | 1,000,000 |
 *
 * しかもその行の出所は `KPI 実績 (2025年4月〜2026年3月)` と**事業年度の窓を
 * 名乗る** (その窓のどの月にも無い行を含んでいる)。注記は棚卸と雑費の 2 件だけで、
 * 混ぜたことを 1 文も言っていなかった。
 *
 * ## パリティが load-bearing になった
 *
 * `monthLabel` / `lastDayLabel` は `PERIOD_RE.exec(period)!` と**非 null 断定**で
 * 組を取り、docblock は「呼ぶ側が正規表現で確かめた期だけを渡す」と書いている。
 * 選別を共有の判定 (`readablePeriodRows` → `isValidPeriod`) へ移したので、
 * **2 つの受理集合が割れるとその `!` が TypeError になる** —— 計算書類を組む
 * 途中で投げるので、利用者は紙を出せない。だから一致を機械が持つ。
 */
import { describe, expect, it } from 'vitest';
import {
  PERIOD_RE,
  buildKessanImport,
  fiscalYearWindow,
  monthLabel,
  type KessanImportInput,
} from '../kessanImport';
import { buildBusinessPlanImport } from '../docImports';
import { buildBusinessOverview } from '../overview';
import { isValidPeriod, type KpiActual } from '../kpiActuals';

const FY_END = '2026-03';
const PROFILE = {
  companyName: '株式会社テスト',
  representative: '代表取締役 山田 太郎',
  address: '東京都千代田区1-1',
  fiscalYearEnd: FY_END,
};

/** 読める 1 件。事業年度 (2025-04〜2026-03) の中。 */
const GOOD: KpiActual = {
  period: '2025-06', unit: '全社',
  revenue: 1_000_000, cogs: 200_000, advertising: 0, sga: 100_000, depreciation: 0,
};

/** 期が読めないのに、**文字列の大小では事業年度の窓に入る**形。 */
const IN_WINDOW_BUT_UNREADABLE = ['2025-6', '2025-13', '2025-06-15', '2025-99', '2025-1x', '2026-00'] as const;

const unreadableRow = (period: string, revenue: number): KpiActual =>
  ({ period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 }) as unknown as KpiActual;

const input = (rows: readonly KpiActual[]): KessanImportInput => ({
  kpiActuals: [...rows],
  balanceSheet: null,
  profile: PROFILE,
  existing: {},
});

const valueOf = (m: { rows: readonly { k: string; value: string }[] }, k: string): string | undefined =>
  m.rows.find((r) => r.k === k)?.value;

describe('★ 計算書類は読める期の行だけを合算する (パス 393)', () => {
  it('★ 標本: 6 形は「窓に入る」かつ「読めない」 —— 走査が空虚でない', () => {
    const fy = fiscalYearWindow(FY_END);
    expect(fy, '事業年度の窓が組めない —— この検査の前提が成り立たない').not.toBeNull();
    for (const p of IN_WINDOW_BUT_UNREADABLE) {
      // 文字列の大小では窓の中 (直す前の判定がこれだけだった)
      expect(p >= fy!.from && p <= fy!.to, `${p} は文字列の大小で窓に入らない`).toBe(true);
      // しかし読めない
      expect(isValidPeriod(p), `${p} が読めると判定されている`).toBe(false);
    }
  });

  it('★ 読めない行は売上高に入らない (直す前は 10 倍だった)', () => {
    const m = buildKessanImport(input([GOOD, unreadableRow('2025-6', 9_000_000)]));
    expect(valueOf(m, 'sales'), '読めない行の売上が合算されている').toBe('1000000');
    // 出所は事業年度の窓を名乗る —— 名乗るなら窓の中の行だけであること。
    expect(m.rows.find((r) => r.k === 'sales')?.source).toContain('2025年4月〜2026年3月');
  });

  it('★ 6 形すべてで合算されない', () => {
    for (const p of IN_WINDOW_BUT_UNREADABLE) {
      const m = buildKessanImport(input([GOOD, unreadableRow(p, 9_000_000)]));
      expect(valueOf(m, 'sales'), `${p} が合算されている`).toBe('1000000');
    }
  });

  it('★ 落とした件数を紙が述べる (黙って除かない)', () => {
    const m = buildKessanImport(input([GOOD, unreadableRow('2025-6', 9_000_000)]));
    expect(m.notes.join('\n')).toContain('期 (YYYY-MM) が読めない 1 件は集計から除いています');
  });

  it('★ 対照: 読めない行が無ければ断りは出ない', () => {
    const m = buildKessanImport(input([GOOD]));
    expect(m.notes.join('\n')).not.toContain('期 (YYYY-MM) が読めない');
    expect(valueOf(m, 'sales')).toBe('1000000');
  });

  it('★ 3 つの面が同じ売上高を答える (計算書類 / 事業計画書 / 経営サマリー)', () => {
    const rows = [GOOD, unreadableRow('2025-6', 9_000_000)];
    const kessan = valueOf(buildKessanImport(input(rows)), 'sales');
    const plan = buildBusinessPlanImport({ kpiActuals: rows, profile: PROFILE, today: '2026-09-22', existing: {} })
      .rows.find((r) => r.k === 'y1sales')?.value;
    const overview = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: rows, members: [{ role: 'owner' }] as never,
    }).kpi.revenue;
    // 肯定の前提: 3 つとも値を出している (どれかが空なら比較は空虚)。
    expect(kessan, '計算書類が売上高を出していない').toBeDefined();
    expect(plan, '事業計画書が 1 年目の売上高を出していない').toBeDefined();
    expect(Number(kessan)).toBe(1_000_000);
    expect(Number(plan)).toBe(1_000_000);
    expect(overview).toBe(1_000_000);
  });

  /**
   * ★ **事業年度の枝に入らない側も見る** —— 決算期の 12 か月に 1 件も無いときは
   * `else` の枝 (入力済みの全期間を合算) を通る。そちらも読めない行を入れない。
   */
  it('★ 決算期に実績が無い枝でも合算しない', () => {
    const outside: KpiActual = { ...GOOD, period: '2020-06' };
    const m = buildKessanImport(input([outside, unreadableRow('2020-6', 9_000_000)]));
    expect(valueOf(m, 'sales'), 'else の枝で読めない行が合算されている').toBe('1000000');
    expect(m.notes.join('\n')).toContain('期 (YYYY-MM) が読めない 1 件は集計から除いています');
  });
});

/**
 * ★ **`PERIOD_RE` の受理集合が共有の判定と同じであること。**
 *
 * 正規表現は**組 (年・月) を取る**ために残っており (`monthLabel` /
 * `lastDayLabel` / `fiscalYearWindow` の 3 か所)、「読めるか」の判定は
 * `isValidPeriod` に寄せた。`monthLabel` は `exec(...)!` なので、**2 つが割れた
 * 日に計算書類を組む途中で TypeError になる**。
 */
describe('★ PERIOD_RE と共有の判定は同じ物を受理する (パス 393)', () => {
  /** 手で選んだ形 + 月を総当たり (00〜99) + 年の形いくつか。 */
  function samples(): string[] {
    const out: string[] = [
      '2026-08', '2026-01', '2026-12', '2026-1', '26-08', '2026-08-01', '', 'bad',
      '0000-01', '9999-12', '99999-01', '2026-08 ', ' 2026-08', '+2026-08', '-2026-08',
      '2026－08', '2026-08\n', '0001-01', '2026-08x', 'x2026-08', '2026_08', '2026/08',
      '2026-8-1', '2026--8', '2026-  8',
    ];
    for (let m = 0; m < 100; m += 1) out.push(`2026-${String(m).padStart(2, '0')}`);
    return out;
  }

  it('★ 標本すべてで答えが一致する', () => {
    const diffs = samples().filter((s) => PERIOD_RE.test(s) !== isValidPeriod(s));
    expect(diffs, `受理集合が割れている: ${JSON.stringify(diffs.slice(0, 8))}`).toEqual([]);
  });

  it('★ 走査が空虚でない (両方 true と 両方 false が在る)', () => {
    const all = samples();
    expect(all.filter((s) => PERIOD_RE.test(s) && isValidPeriod(s)).length).toBeGreaterThanOrEqual(12);
    expect(all.filter((s) => !PERIOD_RE.test(s) && !isValidPeriod(s)).length).toBeGreaterThanOrEqual(20);
  });

  it('★ 組を取る側は、共有の判定が通した期で必ず組を返す (exec(...)! が投げない)', () => {
    for (const s of samples().filter((x) => isValidPeriod(x))) {
      expect(() => monthLabel(s), `${s} で monthLabel が投げる`).not.toThrow();
    }
  });
});
