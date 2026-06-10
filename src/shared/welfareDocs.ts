import { jpy } from './formatters';
import type { WelfareSchemeInput, WelfareSchemeResult } from './welfareScheme';

/**
 * 福利厚生スキームの実務ドキュメント生成 (純ロジック・概算・ひな形)。
 *
 * 試算結果 (welfareScheme) と連動して、
 *   1. 従業員向け説明資料 (額面が下がっても実質手取りが増える根拠)
 *   2. 給与変更・天引き同意書 (労使協定 / 個別同意のひな形)
 *   3. 福利厚生規程ひな形 (社宅 / 食事補助 / 育児支援 / カフェテリアプラン)
 * の Markdown を出力する。**いずれもひな形であり、税務・法務の最終確認は
 * 税理士・社労士・弁護士へ。** 数値は概算。
 *
 * 文面 (StringLiteral content) は罠#2 に従い block-level `Stryker disable all`。
 * 数値の正しさは welfareScheme のテストで担保し、本モジュールは「数値・見出しが
 * 文面に現れる」ことをテストで検証する。
 */

const yen = (n: number) => jpy(Math.round(n));
const today = () => new Date().toISOString().slice(0, 10);

/** 従業員向け説明資料 (Markdown)。 */
export function employeeExplanationMarkdown(result: WelfareSchemeResult): string {
  const { normal, scheme, diff } = result;
  // Stryker disable all
  return `# 新しい給与・福利厚生制度のご説明

## なぜ額面（基本給）が下がるのに、手取りが増えるのか

会社が **社宅・食事補助・育児補助・自社EC ポイント** を直接ご提供することで、
その分の基本給を下げます。額面が下がると **社会保険料と税金も下がる** ため、
生活費を払った後に自由に使えるお金（手元残り）は同じでも、**会社が現物で
提供する価値の分だけ、あなたの実質的な手取りは増えます。**

## 数字での比較（月額・概算）

| 項目 | ① これまで | ② 新制度 |
|---|---|---|
| 額面基本給 | ${yen(normal.gross)} | ${yen(scheme.gross)} |
| 社会保険料（あなたの負担） | ${yen(normal.employeeSocialInsurance)} | ${yen(scheme.employeeSocialInsurance)} |
| 所得税・住民税（概算） | ${yen(normal.tax)} | ${yen(scheme.tax)} |
| 口座振込額 | ${yen(normal.netPaid)} | ${yen(scheme.netPaid)} |
| **自由に使えるお金（手元残り）** | **${yen(normal.freeCash)}** | **${yen(scheme.freeCash)}** |
| 会社が提供する現物価値（非課税） | ${yen(normal.inKindValue)} | ${yen(scheme.inKindValue)} |
| **あなたの実質的な手元残り** | **${yen(normal.employeeRealValue)}** | **${yen(scheme.employeeRealValue)}** |

## ポイント

- 手元残り（自由に使えるお金）は **同じ ${yen(scheme.freeCash)}** をキープします。
- 会社が家賃・食事・育児・EC を負担/支給するため、あなたが支払う固定費が減ります。
- 結果として、実質的な手取りは **月 ${yen(diff.employeeRealValue)} 増える** 計算です。

## ご注意（必ずお読みください）

- 額面基本給が下がるため、**残業代の単価・賞与・将来の年金額** など、額面に
  連動する項目に影響する場合があります。
- 上表は概算です。実際の社会保険料・税額は標準報酬月額の等級や自治体により
  前後します。ご不明点は人事までお問い合わせください。

_作成日: ${today()}（概算・社内説明用）_
`;
  // Stryker restore all
}

/** 給与変更・天引き 同意書 (Markdown)。 */
export function consentFormMarkdown(result: WelfareSchemeResult): string {
  const { normal, scheme } = result;
  // Stryker disable all
  return `# 給与制度変更に関する同意書

私は、会社が導入する福利厚生制度（社宅・食事補助・育児補助・カフェテリアプラン）
の適用に伴い、下記の給与変更および給与天引きについて、内容を理解したうえで同意します。

## 変更内容（月額・概算）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 額面基本給 | ${yen(normal.gross)} | ${yen(scheme.gross)} |
| 給与天引き（社宅・食事の自己負担分） | ${yen(normal.payrollDeduction)} | ${yen(scheme.payrollDeduction)} |
| 口座振込額 | ${yen(normal.netPaid)} | ${yen(scheme.netPaid)} |
| 自由に使えるお金（手元残り） | ${yen(normal.freeCash)} | ${yen(scheme.freeCash)} |

## 確認事項

1. 額面基本給の変更、および社宅家賃・食事代の自己負担分（合計
   ${yen(scheme.payrollDeduction)}／月）を給与から控除（天引き）することに同意します。
2. 会社が提供する現物給付（非課税）は、各制度の規程に従うことを理解しています。
3. 額面に連動する手当・賞与・将来の年金額への影響について説明を受けました。

会社名：＿＿＿＿＿＿＿＿＿＿＿＿

適用開始：＿＿＿＿年＿＿月分給与より

従業員 氏名：＿＿＿＿＿＿＿＿＿＿ 署名／捺印：＿＿＿＿＿ 日付：＿＿＿＿

_本書は労使協定・就業規則の定めと併せて運用してください（${today()} 作成のひな形）。_
`;
  // Stryker restore all
}

/** 福利厚生規程 ひな形 (Markdown)。 */
export function welfareRegulationMarkdown(input: WelfareSchemeInput): string {
  const rentSelf = Math.max(0, input.rentTotal - input.rentCompanyShare);
  // Stryker disable all
  return `# 福利厚生規程（ひな形）

## 第1条（目的）
本規程は、従業員の生活支援および子育て支援を目的として、会社が提供する
福利厚生（社宅・食事補助・育児支援・カフェテリアプラン）の運用について定める。

## 第2条（社宅）
1. 会社は、対象従業員に対し会社名義で賃借した住宅を社宅として貸与する。
2. 会社負担は月 ${yen(input.rentCompanyShare)} を上限とし、賃料相当額のうち
   従業員負担分（月 ${yen(rentSelf)} 相当）を給与から控除する
   （非課税となる賃料相当額の徴収基準を満たすこと）。

## 第3条（食事補助）
1. 会社は、対象従業員に対し食事の現物支給または食事補助を行う。
2. 非課税の要件（従業員が食事代の半額以上を負担し、かつ会社負担が
   月 3,500 円（税抜）以下）を満たす範囲で運用する。会社負担の目安は月
   ${yen(input.mealCompanyShare)}。

## 第4条（育児支援）
会社は、ベビーシッター利用券の付与等により、対象従業員の育児を支援する
（目安：月 ${yen(input.childcare)} 相当・非課税の役務提供の範囲）。

## 第5条（カフェテリアプラン）
1. 会社は、全従業員を対象に、毎月一律のカフェテリアポイント
   （月 ${yen(input.ecPoints)} 相当）を付与する。
2. ポイントは会社が定めるメニュー（自社EC 等）の範囲で利用でき、
   現金との交換はできない（換金性を排除し非課税枠を維持する）。

## 第6条（非課税要件の遵守）
本規程の運用は、所得税法・所得税基本通達その他関係法令に定める非課税要件を
満たす範囲で行う。要件を満たさない給付は課税対象となる場合がある。

## 第7条（改廃）
本規程の改廃は、労使協議のうえ会社が行う。

附則：本規程は＿＿＿＿年＿＿月＿＿日から施行する。

_本書はひな形です。施行前に税理士・社労士・弁護士の確認を受けてください（${today()} 作成）。_
`;
  // Stryker restore all
}
