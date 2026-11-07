---
team_id: tax-automobile
type: org-team
manager: mgr-tax
title: "税務(自動車税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(自動車税)"
---
# 税務(自動車税)
- 焦点: 自家用乗用車の自動車税概算。種別割automobileTaxByDisplacement(令和元年10月以降本則の排気量階段表10段, 1000cc以下25000〜6000cc超110000, 以下/超厳密)・環境性能割environmentalPerformanceRate(electric/85%達成0%・75%1%・60%2%・other3%)+environmentalPerformanceLevy(取得価額×率,100円未満切捨)・monthlyProratedAutomobileTax(年度4月起算,登録翌月〜3月の月数/12,100円未満切捨)。cc<=0/非有限・月1..12外・category/ホワイトリスト外・取得価額負はthrow。グリーン化特例は非対象・概算注記。税額/税率表はStryker block除外,境界/月割/切捨は実値テストで撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*