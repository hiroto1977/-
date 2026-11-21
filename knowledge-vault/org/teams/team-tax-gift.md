---
team_id: tax-gift
type: org-team
manager: mgr-tax
title: "税務(贈与税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(贈与税)"
---
# 税務(贈与税)
- 焦点: 贈与税(暦年課税/相続時精算課税・令和ベース)の概算。暦年課税annualGiftTax(基礎控除110万後課税価格に一般GENERAL/特例SPECIAL速算表(直系尊属→18歳以上)を適用,10%〜55%累進+控除額,100円未満切捨)・相続時精算課税settlementGiftTax(年110万基礎控除累計+特別控除2500万超過に一律20%)。GiftTypeホワイトリスト・負/非有限throw。住宅取得資金/教育資金一括等の非課税特例は非対象・概算注記。速算表block除外, 累進/基礎控除/特別控除超過/切捨は実値撃墜(pragma 1件:taxableAmount===0早期return)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*