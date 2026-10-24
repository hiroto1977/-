---
team_id: tax-inheritance
type: org-team
manager: mgr-tax
title: "税務(相続税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(相続税)"
---
# 税務(相続税)
- 焦点: 相続税(法定相続分課税方式・令和ベース)の総額概算。inheritanceBasicDeduction(3000万+600万×法定相続人数)・INHERITANCE_TAX_BRACKETS速算表(10%〜55%累進+控除額)・inheritanceTaxOnShare(金額×税率−控除,負は0)・netTaxableEstate(課税価格−基礎控除)・totalInheritanceTax(課税遺産総額を法定相続分で按分し各税額合算,100円未満切捨)・estimateInheritanceTax統合。配偶者税額軽減/小規模宅地特例/各人按分後納付/2割加算は非対象=総額の概算まで・概算注記。速算表block除外, 按分/累進/切捨は実値撃墜(等価変異pragma 2件: 速算表境界連続+IEEE754許容誤差到達不能)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*