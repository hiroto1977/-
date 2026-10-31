---
team_id: tax-individual-business
type: org-team
manager: mgr-tax
title: "税務(個人事業税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(個人事業税)"
---
# 税務(個人事業税)
- 焦点: 個人事業税(地方税・都道府県)の概算。法定業種別税率(第1種5%/第2種(畜産・水産・薪炭)4%/第3種5%/第3種のあんま等3%/非課税0)・事業主控除290万(businessMonthsで月割切上)・課税標準=max(事業所得+青色足し戻し−繰越控除−事業主控除,0)・税額100円未満切捨。業種区分判定と所得計算は対象外(入力受領)。負/非有限・category/businessMonths範囲外はthrow。概算注記。税率テーブルはStryker block除外, max/切捨/月割/乗算/境界は実値撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*