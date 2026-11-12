---
team_id: tax-national-pension
type: org-team
manager: mgr-tax
title: "税務(国民年金保険料)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(国民年金保険料)"
---
# 税務(国民年金保険料)
- 焦点: 第1号被保険者(自営業者等)の国民年金保険料概算(taxPublicPensionの受取課税とは別ドメイン)。定額保険料NATIONAL_PENSION_MONTHLY(月17510, 年度改定)・付加保険料400(任意)・ExemptionLevel6区分(none1/quarter免除0.75納付/half0.5/threeQuarter0.25/full0/studentOrDeferral0)のpaymentRatio写像・nationalPensionPremium(月四捨五入後months乗算, 付加は免除非依存)。months0以下/非整数/非有限・exemptionホワイト外はthrow。前納割引/追納は非対象・概算注記。定数block除外, 乗算/丸め/割合/付加独立/境界は実値撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*