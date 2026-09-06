/**
 * **計算に使う固定の数字は、既定値の位置にも書き写してはいけない。**
 *
 * CLAUDE.md の作法はこう書いてある —— 「計算に使う固定の数字 (法定値・参考値・
 * しきい値・前提) は `src/shared/parameters.ts` の台帳に登録し、画面は
 * `useParameters()` で読んで関数へ引数で渡す。**既定値はモジュールの定数を
 * そのまま参照する (数字を写さない)**」。
 *
 * 2026-09-06 に、この後半が破れている場所を 1 件見つけた:
 *
 *   `shared/funding.ts` の `summarize(items, effectiveTaxRate, consumptionTaxRate = 0.1)`
 *   —— `0.1` は**消費税法の標準税率**で、出所は `shared/taxCalc.ts` の
 *   `CONSUMPTION_TAX_STANDARD` 1 つだけであり、台帳 `tax.consumptionStandardRate`
 *   (`kind: 'law'`・出典「消費税法 (10%)」) の既定値もその定数を参照している。
 *   ところが funding 側はリテラルで持っていて、**唯一の呼び出し元
 *   (`main/clients/funding.ts` の `summarize(items)`) は引数を渡していない**ので、
 *   実際に使われるのは台帳と繋がっていない側だった。法が変わった日に、
 *   税ページと資金調達ページが**同じ法定値について違うことを言う**。
 *
 * `parameterWiring.test.ts` は「台帳に登録した値が画面に効く」ことを留めるが、
 * 「同じ値がリテラルで別に存在しない」ことは見ていない。そこで**関数の既定値の
 * 位置に居る素の数値リテラル**を台帳にして、増えたら理由を書かせる。
 *
 * 走査対象は計算が集まる `src/shared` と `src/renderer/data`。名前が率・割合・
 * しきい値・期間を思わせる引数だけを見る (色や添字ではなく「量」の既定値が対象)。
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';

const REPO = join(__dirname, '..', '..', '..');

/** 引数の既定値の位置に居る素の数値リテラル。`;` が続く代入文は拾わない。 */
const DEFAULT_RE = /\b([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(-?\d[\d_]*(?:\.\d+)?)\s*(?:[,)]|$)/g;

/** 「量」を表す名前か (率・割合・しきい値・期間)。 */
const QUANTITY_NAME = /(rate|ratio|pct|percent|threshold|limit|years|months|days)$/i;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly param: string;
  readonly value: number;
}

function scan(files: readonly { readonly file: string; readonly text: string }[]): Site[] {
  const found: Site[] = [];
  for (const { file, text } of files) {
    for (const line of text.split('\n').entries()) {
      const [i, src] = line;
      // JSDoc の説明文にも `rate=0` のような字面が出る (funding.ts の「無利息
      // (rate=0) は単純に P/n」で実際に踏んだ)。行頭が `*` / `//` の行は注記。
      if (/^\s*(?:\*|\/\/)/.test(src)) continue;
      DEFAULT_RE.lastIndex = 0;
      let m: RegExpExecArray | null = DEFAULT_RE.exec(src);
      while (m !== null) {
        if (QUANTITY_NAME.test(m[1]!)) {
          found.push({ file, line: i + 1, param: m[1]!, value: Number(m[2]!.replace(/_/g, '')) });
        }
        m = DEFAULT_RE.exec(src);
      }
    }
  }
  return found;
}

function calcSources(): { file: string; text: string }[] {
  return globSync(['src/shared/**/*.ts', 'src/renderer/data/**/*.ts'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**'],
  }).map((abs) => ({
    file: relative(REPO, abs).split('\\').join('/'),
    text: readFileSync(abs, 'utf8'),
  }));
}

interface Entry {
  readonly file: string;
  readonly param: string;
  readonly value: number;
  readonly count: number;
  /** なぜこの数字は台帳の定数の写しではないのか。 */
  readonly why: string;
}

/**
 * 台帳 —— 行番号では持たない (上に 1 行足すだけで壊れる台帳は守っていない)。
 * ファイル + 引数名 + 値 + 個数で持つので、同じ形が 1 つ増えれば個数が合わなくなる。
 */
const LEDGER: readonly Entry[] = [
  {
    file: 'src/shared/funding.ts', param: 'gracePeriodMonths', value: 0, count: 1,
    why: '元金据置は「無し」が既定。0 は中立値 (据置ゼロ) で、どこかの定数の写しではない。',
  },
  {
    file: 'src/shared/funding.ts', param: 'threshold', value: 1, count: 1,
    why: 'DSCR (営業CF ÷ 返済額) の分水嶺。1.0 は「返済額と同額の営業CF」という比率の定義そのもので、法定値でも判断値でもない (不動産の DSCR しきい値は別機能・別台帳)。',
  },
  {
    file: 'src/shared/managementScorecard.ts', param: 'threshold', value: 100, count: 1,
    why: '伸びしろ = 満点 100 点との距離。100 はスコアの定義上の満点で、判断値ではない。',
  },
  {
    file: 'src/shared/mutualFundsMetrics.ts', param: 'riskFreeRatePct', value: 0.5, count: 1,
    why: '無リスク金利の参考値。calcSharpeRatio は本番の呼び出し元が無く (テストのみ) 画面に出ないので、台帳に載せると「設定できるのに効かない」項目になる。画面へ出すときに parameters.ts へ移す。',
  },
  {
    file: 'src/shared/mutualFundsMetrics.ts', param: 'hiddenCostPct', value: 0, count: 1,
    why: '未入力を 0 と見る中立値 (隠れコスト無し)。参考値ではない。',
  },
  {
    file: 'src/shared/mutualFundsMetrics.ts', param: 'grossReturnPct', value: 0, count: 1,
    why: '未入力を 0 と見る中立値 (総リターン不明)。参考値ではない。',
  },
  {
    file: 'src/shared/mutualFundsMetrics.ts', param: 'years', value: 0, count: 1,
    why: '保有年数が未入力のとき CAGR を算出不能 (null) にするための中立値。年数の目安ではない。',
  },
  {
    file: 'src/shared/mutualFundsMetrics.ts', param: 'years', value: 1, count: 1,
    why: '実質コストを 1 年分で見るのが既定 (年率表示の期間そのもの)。前提値ではなく単位。',
  },
  {
    file: 'src/shared/realEstateMetrics.ts', param: 'occupancyRate', value: 1, count: 1,
    why: '満室想定 = 恒等倍率。1 は中立値で、法定値でも参考値でもない。',
  },
  {
    file: 'src/shared/taxIndividualBusiness.ts', param: 'businessMonths', value: 12, count: 2,
    why: '1 年 = 12 か月という暦の定義。税率でも控除額でもないので台帳には載せない。',
  },
  {
    file: 'src/shared/taxNationalPension.ts', param: 'months', value: 12, count: 1,
    why: '国民年金の保険料を 1 年分 (12 か月) 出すのが既定。暦の定義で、保険料額そのものは別途 kind:law で台帳にある。',
  },
  {
    file: 'src/shared/api/canva.ts', param: 'limit', value: 20, count: 1,
    why: 'Canva 検索の 1 ページの取得件数。通信の作法 (ページ長) であり、計算に使う固定の数字ではない。',
  },
  {
    file: 'src/shared/api/slack.ts', param: 'limit', value: 200, count: 1,
    why: 'Slack conversations.list の 1 ページの取得件数。通信の作法 (ページ長) であり、計算に使う固定の数字ではない。',
  },
  {
    file: 'src/renderer/data/budgetVariance.ts', param: 'thresholdPct', value: 10, count: 1,
    why: '予実差異の要注意しきい値 ±10%。assessVariance は本番の呼び出し元が無く画面に出ないため台帳に載せない (画面へ出すときに登録する)。',
  },
  {
    file: 'src/renderer/data/budgetVariance.ts', param: 'periodMonths', value: 12, count: 1,
    why: '1 年 = 12 か月という暦の定義。予実を集計する期間の単位であって、判断の要るしきい値ではない。',
  },
  {
    file: 'src/renderer/data/cashForecast.ts', param: 'horizonMonths', value: 12, count: 4,
    why: '予測期間の既定を 1 年 (= 12 か月) とする暦の定義。本番の呼び出し元 (overview.ts) は明示的に 12 を渡している。',
  },
  {
    file: 'src/renderer/data/cashflowDebtService.ts', param: 'threshold', value: 1, count: 1,
    why: 'DSCR の分水嶺。funding.ts と同じく「返済額と同額の営業CF = 1.0」という比率の定義で、値が動く余地が無いので共有定数にはしない。',
  },
  {
    file: 'src/renderer/data/financialStatements.ts', param: 'dividendRate', value: 0, count: 1,
    why: '配当なし (0 円) が既定。0 は中立値で、配当政策の前提値ではないため台帳には載せない。',
  },
  {
    file: 'src/renderer/data/revenueConcentration.ts', param: 'thresholdPct', value: 80, count: 1,
    why: 'パレート分析の慣習値 80%。computePareto は本番の呼び出し元が無く画面に出ないため台帳に載せない (画面へ出すときに登録する)。',
  },
];
const SITES = scan(calcSources());
const key = (e: { file: string; param: string; value: number }) => `${e.file} ${e.param}=${e.value}`;

describe('引数の既定値に置いた固定の数字', () => {
  it('走査が生きている (床: 20 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(20);
  });

  it('★ 既定値の数字はすべて台帳に載っている', () => {
    const known = new Set(LEDGER.map(key));
    const stray = [...new Set(SITES.filter((s) => !known.has(key(s))).map((s) => `${key(s)} (${s.file}:${s.line})`))];
    expect(stray, '計算に使う固定の数字は parameters.ts の台帳へ。写しでない理由があるなら LEDGER に書く').toEqual([]);
  });

  it('★ 台帳の個数は実測と一致する (同じ形が 1 つ増えたら気づく)', () => {
    const actual = new Map<string, number>();
    for (const s of SITES) actual.set(key(s), (actual.get(key(s)) ?? 0) + 1);
    expect(Object.fromEntries([...actual].sort())).toEqual(
      Object.fromEntries(LEDGER.map((e) => [key(e), e.count]).sort()),
    );
  });

  it('台帳に理由が書いてある (各 30 字以上)', () => {
    const thin = LEDGER.filter((e) => e.why.length < 30).map(key);
    expect(thin).toEqual([]);
  });

  it('標本: 走査は引数の既定値のリテラルを実際に拾う', () => {
    const hits = scan([{ file: 'x.ts', text: 'export function f(\n  consumptionTaxRate = 0.1,\n): number {\n  return consumptionTaxRate;\n}\n' }]);
    expect(hits.map((h) => `${h.param}=${h.value}`)).toEqual(['consumptionTaxRate=0.1']);
  });

  it('標本: 定数を参照する既定値は拾わない (これが直した形)', () => {
    const hits = scan([{ file: 'x.ts', text: 'export function f(\n  consumptionTaxRate: number = CONSUMPTION_TAX_STANDARD,\n): number {\n  return consumptionTaxRate;\n}\n' }]);
    expect(hits).toEqual([]);
  });

  it('標本: ふつうの代入文 (`;` で終わる) は既定値ではないので拾わない', () => {
    const hits = scan([{ file: 'x.ts', text: 'const defaultRate = 0.1;\nexport const taxRate = 0.08;\n' }]);
    expect(hits).toEqual([]);
  });

  it('標本: 注記の中の字面は拾わない (JSDoc の「無利息 (rate=0)」)', () => {
    const hits = scan([{ file: 'x.ts', text: '/**\n * 無利息 (rate=0) は単純に P/n。\n */\nexport function f(): number {\n  return 0;\n}\n' }]);
    expect(hits).toEqual([]);
  });

  it('標本: 量でない名前 (添字・件数) は対象外', () => {
    const hits = scan([{ file: 'x.ts', text: 'export function f(\n  index = 0,\n  color = 3,\n): number {\n  return index + color;\n}\n' }]);
    expect(hits).toEqual([]);
  });

  it('★ 消費税の標準税率は既定値のリテラルとして残っていない', () => {
    // 上の「標本」2 本が、この不在の主張を支える —— 走査はこの形を拾えるし、
    // 定数を参照する形は拾わない。
    const consumption = SITES.filter((s) => /consumptionTax/i.test(s.param));
    expect(consumption, 'shared/taxCalc.ts の CONSUMPTION_TAX_STANDARD を参照すること').toEqual([]);
  });
});
