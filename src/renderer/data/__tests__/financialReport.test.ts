import { describe, expect, it } from 'vitest';
import { localIsoDate } from '../../../shared/localDate';
import { buildFinancialReportMarkdown } from '../financialReport';
import { computeFinancialRatios, radarAxes } from '../financialRatios';
import { diagnoseFinancials } from '../financialDiagnosis';
import { analyzeMarginTrend } from '../financialTrend';
import { deriveBusinessFinancials } from '../businessFinancials';
import { calcCorporateTax } from '../../../shared/taxCorporate';

function fixture() {
  const fin = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
  const ratios = computeFinancialRatios(fin);
  const diagnosis = diagnoseFinancials(radarAxes(ratios));
  const trend = analyzeMarginTrend([{ revenue: 100, profit: 5 }, { revenue: 100, profit: 12 }]);
  return { ratios, diagnosis, trend };
}

describe('buildFinancialReportMarkdown', () => {
  const { ratios, diagnosis, trend } = fixture();
  // ビルドは各テスト内で行う (getter)。これにより `if (ordinaryProfit !== undefined)`
  // ガードの ConditionalExpression/EqualityOperator 変異で undefined 経路が throw
  // した場合でも、suite 収集時 (describe 本体) ではなく当該 it 内で fail させ、
  // 確実に mutant を撃墜できる (collection-throw だと survived 扱いになりうるため)。
  const buildBase = () => buildFinancialReportMarkdown({ label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12) });

  it('includes the title, date and overall grade', () => {
    const md = buildBase();
    expect(md).toContain('# 財務分析レポート — EC事業');
    expect(md).toContain('作成日: 2026-06-02');
    expect(md).toContain(`## 総合評価: ${diagnosis.grade}`);
  });

  it('renders category scores and all 17 indicator rows', () => {
    const md = buildBase();
    expect(md).toContain('| 安全性 |');
    expect(md).toContain('| 収益性 |');
    expect(md).toContain('| 効率性 |');
    // 17 指標 + 2 ヘッダ行 (指標|値 と区切り) のうち主要なものを確認
    expect(md).toContain('| 自己資本比率 |');
    expect(md).toContain('| ROE |');
    expect(md).toContain('| CCC |');
  });

  it('reflects the margin trend and keeps the disclaimer', () => {
    const md = buildBase();
    expect(md).toContain('営業利益率トレンド:** 改善傾向');
    expect(md).toContain('財務助言ではありません');
  });

  it('golden: renders the exact full Markdown report', () => {
    const expected = [
      '# 財務分析レポート — EC事業',
      '',
      '作成日: 2026-06-02',
      '',
      '## 総合評価: S （総合スコア 84 / 100）',
      '',
      '| カテゴリ | スコア |',
      '| --- | ---: |',
      '| 安全性 | 92 |',
      '| 収益性 | 98 |',
      '| 効率性 | 39 |',
      '',
      '**営業利益率トレンド:** 改善傾向（履歴 +7pt）',
      '',
      '## 強み',
      '- 自己資本比率（スコア 100）',
      '- 固定長期適合率（スコア 100）',
      '- 債務償還年数（スコア 100）',
      '',
      '## 要改善（一般情報）',
      '- 売上債権回転率が低め。回収サイトの長期化に注意。',
      '- 棚卸資産回転率が低め。在庫の滞留に注意。',
      '- CCC（現金化日数）が長め。回収・在庫・支払のサイト最適化を検討。',
      '',
      '## 主要財務指標',
      '',
      '| 指標 | 値 |',
      '| --- | ---: |',
      '| 自己資本比率 | 50% |',
      '| 流動比率 | 183.3% |',
      '| 固定長期適合率 | 64.3% |',
      '| 借入金月商倍率 | 2.21ヶ月 |',
      '| 債務償還年数 | 0.8年 |',
      '| 営業利益率 | 20% |',
      '| 経常利益率 | 19.6% |',
      '| 当期純利益率 | 13.7% |',
      '| 当期純利益 | 1,649,088 円 |',
      '| 労働分配率 | 39.5% |',
      '| EBITDA | 2,760,000 円 |',
      '| EBITDAマージン | 23% |',
      '| 売上債権回転率 | 8倍 |',
      '| 棚卸資産回転率 | 12倍 |',
      '| CCC | 39.5日 |',
      '| ROA | 17.2% |',
      '| ROE | 34.4% |',
      '',
      '---',
      '※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。',
    ].join('\n');
    expect(buildBase()).toBe(expected);
  });

  it('null の指標は値欄を — で描画する (fmtValue の null ガード)', () => {
    // 売上0 → 多くの比率が null。CCC 行が「| CCC | — |」になることを確認。
    // `if (v == null) return '—'` の条件を false 固定 / '—' を空に変える mutant を殺す。
    const zeroRatios = computeFinancialRatios(deriveBusinessFinancials({ revenue: 0, variableCost: 0, fixedCost: 0, profit: 0, profitMargin: 0 }));
    const mdNull = buildFinancialReportMarkdown({ label: 'Z', ratios: zeroRatios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12) });
    expect(mdNull).toContain('| CCC | — |');
  });

  it('deltaPct=0 は +0pt ではなく 0pt (> 0 と >= 0 を区別)', () => {
    // 利益率が完全横ばい → deltaPct=0。`deltaPct > 0 ? '+' : ''` を `>= 0` にする
    // mutant は「+0pt」になるため、0pt 表記の検証で殺せる。
    const flat0 = analyzeMarginTrend([{ revenue: 100, profit: 10 }, { revenue: 100, profit: 10 }]);
    expect(flat0.deltaPct).toBe(0);
    const md0 = buildFinancialReportMarkdown({ label: 'Z', ratios, diagnosis, trend: flat0, generatedAt: new Date(2026, 5, 2, 12) });
    expect(md0).toContain('（履歴 0pt）');
    expect(md0).not.toContain('+0pt');
  });

  it('defaults generatedAt to now when omitted (利用者の時計の今日 — UTC だと日本の朝は前日)', () => {
    const today = localIsoDate();
    const md2 = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis, trend });
    expect(md2).toContain(`作成日: ${today}`);
  });

  it('ordinaryProfit 未指定なら法人税等セクションを出力しない (既存出力と不変)', () => {
    // ローカルに組み立て、`if (ordinaryProfit !== undefined)` ガードの
    // ConditionalExpression / EqualityOperator 変異 (true 固定 / === 反転) を撃墜する。
    const mdNoTax = buildFinancialReportMarkdown({ label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12) });
    expect(mdNoTax).not.toContain('## 法人税等(概算)');
    expect(mdNoTax).not.toContain('税引後利益');
    // 強い不変条件: 未指定なら golden (既存の税抜きレポート) と完全一致。
    // `if(true)` 変異だと undefined 経路で throw / 別文字列となり、この it 内で fail する。
    expect(mdNoTax.endsWith('※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。')).toBe(true);
  });

  it('golden: ordinaryProfit ありで法人税等セクションを末尾 (disclaimer 直前) に正確に出力する', () => {
    const mdTax = buildFinancialReportMarkdown({
      label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 5_000_000,
    });
    const section = [
      '## 法人税等(概算)',
      '',
      '| 項目 | 金額 |',
      '| --- | ---: |',
      '| 税引前利益(経常利益) | 5,000,000 円 |',
      '| 法人税 | 750,000 円 |',
      '| 地方法人税 | 77,250 円 |',
      '| 法人住民税 | 122,500 円 |',
      '| 法人事業税 | 193,000 円 |',
      '| 特別法人事業税 | 71,410 円 |',
      '| 法人税等合計 | 1,214,160 円 |',
      '| 実効税率 | 24.3% |',
      '| 法定実効税率(参考) | 23.2% |',
      '| 税引後利益 | 3,785,840 円 |',
      '',
      '> 区分: 中小法人（経常利益を課税所得の概算として使用。資本金等の細目は経営コックピットの法人税カードで調整可）。',
      '',
      '> 実効税率は法人税等合計÷課税所得の単純合算ベース。法定実効税率(参考)は事業税(+特別法人事業税)の損金算入を織り込んだ標準指標(限界税率)で、両者は目的の異なる別の参考値です。',
      '',
      '※ 法人税等は概算試算であり、正確な税額計算・税務助言ではありません。申告・納税は税理士 / 国税庁・e-Tax / 都道府県・市区町村で確定してください。',
      '',
      '---',
      '※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。',
    ].join('\n');
    // 既存の指標セクションはそのまま残り、その末尾に新セクションが続く。
    expect(mdTax.endsWith(section)).toBe(true);
    // 既存出力 (md) の指標表までは不変: 新セクションを除けば従来レポートと一致。
    expect(mdTax.startsWith('# 財務分析レポート — EC事業')).toBe(true);
    expect(mdTax).toContain('| ROE | 34.4% |');
  });

  it('黒字 (ordinaryProfit>0) は中小法人の区分注記を出す (欠損分岐の > / <= 境界も撃墜)', () => {
    const mdSmall = buildFinancialReportMarkdown({
      label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 5_000_000,
    });
    expect(mdSmall).toContain('> 区分: 中小法人（経常利益を課税所得の概算として使用。資本金等の細目は経営コックピットの法人税カードで調整可）。');
    // 黒字なので欠損注記は出ない (分岐が排他)。
    expect(mdSmall).not.toContain('欠損(税引前利益が0以下)');
  });

  it('欠損 (ordinaryProfit<=0) は均等割のみ・税引後=税引前−均等割 の注記を出す', () => {
    const b = calcCorporateTax(-200_000);
    const mdLoss = buildFinancialReportMarkdown({
      label: 'Z', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: -200_000,
    });
    expect(mdLoss).toContain('| 税引前利益(経常利益) | -200,000 円 |');
    expect(mdLoss).toContain('| 法人税 | 0 円 |');
    expect(mdLoss).toContain('| 法人税等合計 | 70,000 円 |');
    // **「法人税等合計 70,000 円」と「実効税率 0.0%」は両立しない。**
    // 2026-09-08 までこの見本が `0.0%` を仕様として固定していた。
    expect(mdLoss).toContain('| 実効税率 | — |');
    expect(mdLoss).not.toContain('| 実効税率 | 0.0% |');
    expect(mdLoss).toContain('| 税引後利益 | -270,000 円 |');
    expect(mdLoss).toContain(`> 欠損(税引前利益が0以下)のため、法人住民税の均等割(${b.residentTax.toLocaleString('ja-JP')} 円)のみが課されます。税引後利益 = 税引前利益 − 均等割。`);
    // **「—」の理由を述べる。** 空欄だけを刷ると、読む側は「税が無い」とも
    // 「まだ入れていない」とも読める。
    expect(mdLoss).toContain('> 控除後の課税所得が 0 のため、実効税率は算定していません。');
    // 黒字側の区分注記は出ない (分岐が排他であること)。
    expect(mdLoss).not.toContain('区分:');
  });

  it('★ 対照: 課税所得が残る期は率を刷り、空欄の理由は述べない', () => {
    const mdProfit = buildFinancialReportMarkdown({
      label: 'Z', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 5_000_000,
    });
    expect(mdProfit).toMatch(/\| 実効税率 \| \d+\.\d% \|/);
    expect(mdProfit).not.toContain('| 実効税率 | — |');
    expect(mdProfit).not.toContain('実効税率は算定していません');
  });

  it('ordinaryProfit=0 も欠損扱い (<=0 の境界: > ではなく >=)', () => {
    const md0 = buildFinancialReportMarkdown({
      label: 'Z', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 0,
    });
    expect(md0).toContain('欠損(税引前利益が0以下)のため');
    expect(md0).not.toContain('区分:');
  });

  it('法人税等は概算・税務助言ではない旨の注記を含む', () => {
    const mdTax = buildFinancialReportMarkdown({
      label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 5_000_000,
    });
    expect(mdTax).toContain('法人税等は概算試算であり、正確な税額計算・税務助言ではありません');
  });

  it('法定実効税率(参考) の行と、実効税率との違いの注記を出す (round 60)', () => {
    const b = calcCorporateTax(5_000_000);
    const mdTax = buildFinancialReportMarkdown({
      label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12), ordinaryProfit: 5_000_000,
    });
    // 行は statutoryEffectiveRate を小数1桁% で出す (5M中小→23.2%)。
    const expectedRow = `| 法定実効税率(参考) | ${(b.statutoryEffectiveRate * 100).toFixed(1)}% |`;
    expect(expectedRow).toBe('| 法定実効税率(参考) | 23.2% |');
    expect(mdTax).toContain(expectedRow);
    // 単純合算 vs 損金算入の違いを説明する注記が出る。
    expect(mdTax).toContain('法定実効税率(参考)は事業税(+特別法人事業税)の損金算入を織り込んだ標準指標');
    // 法定実効税率の行は 実効税率 の直後・税引後利益 の直前に並ぶ。
    const idxEff = mdTax.indexOf('| 実効税率 |');
    const idxStatutory = mdTax.indexOf('| 法定実効税率(参考) |');
    const idxAfter = mdTax.indexOf('| 税引後利益 |');
    expect(idxEff).toBeLessThan(idxStatutory);
    expect(idxStatutory).toBeLessThan(idxAfter);
  });

  it('covers down/flat trends, null delta, and empty strengths/weaknesses', () => {
    const ax = (key: string, score: number) => ({ key, label: key, unit: '', raw: score, score });
    const D = new Date('2026-06-02T00:00:00Z');
    const weak = diagnoseFinancials([ax('equityRatio', 10), ax('operatingMargin', 5)]); // 強みなし
    const strong = diagnoseFinancials([ax('equityRatio', 95), ax('operatingMargin', 95)]); // 弱みなし
    const down = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis: weak, trend: analyzeMarginTrend([{ revenue: 100, profit: 20 }, { revenue: 100, profit: 10 }]), generatedAt: D });
    expect(down).toContain('**営業利益率トレンド:** 悪化傾向（履歴 -10pt）');
    expect(down).toContain('- 特筆すべき強みは検出されませんでした。');
    const flat = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis: strong, trend: analyzeMarginTrend([{ revenue: 100, profit: 10 }]), generatedAt: D });
    expect(flat).toContain('**営業利益率トレンド:** 横ばい（履歴 —）');
    expect(flat).toContain('- 大きな弱みは検出されませんでした。');
  });
});

/**
 * **レポートに文字列 "null" を刷らない (2026-09-08)。**
 *
 * パス 74 で `overallScore` / `grade` / `CategoryScore.score` を
 * `number | null` にしたとき、この 3 つは**テンプレートリテラルへ直に
 * 埋め込まれていた** (`## 総合評価: ${diagnosis.grade} （総合スコア
 * ${diagnosis.overallScore} / 100）`)。
 *
 * **`${null}` は型検査を素通りして "null" を刷る** —— `tsc` は 1 つも
 * 文句を言わなかった。実測すると:
 *
 * ```
 * ## 総合評価: null （総合スコア null / 100）
 * | 安全性 | null |
 * ```
 *
 * 利用者がダウンロードする診断レポートに "null" が並ぶ状態を、
 * **自分の直しが作りかけた。** 型では見えないので検査で留める。
 */
describe('buildFinancialReportMarkdown — 未評価 (null) の刷り方', () => {
  const { ratios, trend } = fixture();
  /** 1 軸も算定できない診断 (全軸 raw=null)。 */
  const allUnscored = diagnoseFinancials([
    { key: 'ccc', label: 'CCC', unit: '日', raw: null, score: null },
    { key: 'roe', label: 'ROE', unit: '%', raw: null, score: null },
  ]);
  const md = () =>
    buildFinancialReportMarkdown({ label: 'Z事業', ratios, diagnosis: allUnscored, trend, generatedAt: new Date(2026, 5, 2, 12) });

  it('★ 文字列 "null" を 1 つも含まない', () => {
    const out = md();
    // **不在の主張には標本を添える** —— 下の対照で「この綴りが実際に出る形」を示す。
    expect(out).not.toContain('null');
  });

  it('★ 対照: 直す前の書き方なら "null" が出る (上の検査が空でない証拠)', () => {
    // 旧い実装と同じ埋め込みを手で作り、`${null}` が "null" を刷ることを見せる。
    const asOldCode = `## 総合評価: ${allUnscored.grade} （総合スコア ${allUnscored.overallScore} / 100）`;
    expect(asOldCode).toBe('## 総合評価: null （総合スコア null / 100）');
    expect(asOldCode).toContain('null');
  });

  it('★ 総合評価とカテゴリ行を「未評価」と書く', () => {
    const out = md();
    expect(out).toContain('## 総合評価: 未評価 （算定できた指標がありません）');
    expect(out).toContain('| 安全性 | 未評価 |');
  });

  it('★ 除いた軸を書面の中で述べる (数字が変わった理由が読める)', () => {
    const out = md();
    expect(out).toContain('**未評価の 2 軸:** CCC・ROE');
    expect(out).toContain('総合スコア・カテゴリ平均・強み／要改善から除いています');
  });

  it('★ 対照: 算定できる診断では従来どおり数と格付けを書く', () => {
    const { diagnosis } = fixture();
    const out = buildFinancialReportMarkdown({ label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date(2026, 5, 2, 12) });
    expect(out).toMatch(/## 総合評価: [SABCD] （総合スコア \d+ \/ 100）/);
    expect(out).not.toContain('未評価');
    expect(out).not.toContain('null');
  });
});
