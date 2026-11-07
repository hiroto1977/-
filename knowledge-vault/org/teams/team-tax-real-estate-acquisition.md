---
team_id: tax-real-estate-acquisition
type: org-team
manager: mgr-tax
title: "税務(不動産取得税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(不動産取得税)"
---
# 税務(不動産取得税)
- 焦点: 不動産取得税(地方税法73条〜)の概算。acquisitionTaxRate(本則4%/土地・住宅軽減3%, applyReduction)・residentialLandTaxableBase(宅地評価額1/2特例 isUrbanLand)・realEstateAcquisitionTax(課税標準×税率, 100円未満切捨, 免税点 土地10万/新築家屋23万/その他家屋12万 未満非課税, {rate,taxableBase,tax,exempt})・isBelowAcquisitionThreshold。特別控除(新築1200万等)は簡略非対応・概算注記。負/非有限/PropertyTypeホワイトリスト外はthrow。固定値テーブルはStryker block除外, 乗算/切捨/境界は実値テストで撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*