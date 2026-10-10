---
team_id: tax-registration-license
type: org-team
manager: mgr-tax
title: "税務(登録免許税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(登録免許税)"
---
# 税務(登録免許税)
- 焦点: 登録免許税(登録免許税法別表第一 本則)の概算。不動産登記realEstateRegistrationTax(所有権移転売買2.0%/保存0.4%/相続0.4%/贈与2.0%/抵当権設定0.4%)×課税標準, 100円未満切捨。会社設立companyIncorporationTax(株式会社=max(資本金×0.7%,15万)/合同会社=max(0.7%,6万)の大きい方)。負/非有限/ホワイトリスト外はthrow。軽減措置(租特法)は非対象=本則のみ・概算注記必須。税率/最低額テーブルはStryker block除外, 大小判定・切捨は実値/境界テストで撃墜
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*