---
team_id: tax-business-office
type: org-team
manager: mgr-tax
title: "税務(事業所税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(事業所税)"
---
# 税務(事業所税)
- 焦点: 事業所税(地方税法701条の30〜, 指定都市等で課税)の概算。資産割assetBasedTax(床面積免税点1000㎡超で床面積全体×600円, 100円未満切捨)・従業者割employeeBasedTax(従業者100人超で給与総額×0.25%, 切捨)・businessOfficeTax合算内訳・免税点判定isAssetTaxExempt/isEmployeeTaxExempt。負/非有限はthrow。指定都市のみ課税・課税標準特例は簡略・概算注記。重複バリデーションを免税点判定に集約し等価変異を構造排除(pragma 0件)で実値撃墜
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*