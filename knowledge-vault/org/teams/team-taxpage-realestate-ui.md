---
team_id: taxpage-realestate-ui
type: org-team
manager: mgr-tax
title: "UI導線(不動産・資産税)"
tags:
  - org/team
  - orchestration
aliases:
  - "UI導線(不動産・資産税)"
---
# UI導線(不動産・資産税)
- 焦点: 今セッションの純粋税モジュールを税務試算ページTaxPageの実UIに導線(バッチ1)。新セクション「不動産・資産にかかる税」に5ブロック: 固定資産税(taxFixedAsset)・不動産取得税(taxRealEstateAcquisition)・登録免許税(taxRegistrationLicense)・印紙税(taxStampDuty)・取得コスト総額(taxRealEstateTransactionCost)。既存イディオム(useState+parseAmountInput+useMemo+Stat/jpy)厳密準拠, 既存挙動不変・空入力ガードで描画クラッシュなし・概算注記。TaxPage.render.test.ts(8 it)で実値照合。+8 it (#243)。静的→4915/実行時→4997
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*