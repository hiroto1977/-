---
team_id: tax-realestate-transaction-cost
type: org-team
manager: mgr-tax
title: "税務(不動産取得コスト合算)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(不動産取得コスト合算)"
---
# 税務(不動産取得コスト合算)
- 焦点: 不動産購入時の税コスト総額を概算する純粋コンポーザ taxRealEstateTransactionCost。estimateRealEstatePurchaseTaxCost(realEstateAcquisitionTax/realEstateRegistrationTax/stampDuty(realEstateTransfer)を呼び{acquisitionTax,registrationTax,stampDuty,total}返却)。税率・税額表は一切再定義せず既存3モジュールの呼び出しのみで算出(単一情報源)、本体は入力マッピング+合算のみ。必須欠落(null/undefined)は明示throw, サブのthrowは伝播。固定資産税日割/仲介手数料/消費税は非対象・概算注記
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*