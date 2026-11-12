---
team_id: tax-national-health-insurance
type: org-team
manager: mgr-tax
title: "税務(国民健康保険料)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(国民健康保険料)"
---
# 税務(国民健康保険料)
- 焦点: 自営業者等の国民健康保険料の概算(被用者保険taxSocialInsuranceとは別ドメイン)。医療分/後期高齢者支援金分/介護分(40-64歳のみ)の3区分, 各区分=所得割(賦課基準額=総所得−基礎控除43万 ×料率)+均等割×加入者数(+平等割×世帯), 各賦課限度額(医療65万/支援24万/介護17万)でmin。料率は自治体差のため引数NhiRatesで受けDEFAULT_NHI_RATES(令和6一例)を既定。totalIncome負/非有限・members<1/非整数・料率負はthrow。低所得軽減(7/5/2割)等は非対象・概算注記。限度額/基礎控除/代表料率はStryker block除外, 所得割/min(cap)/加算/切捨/介護分条件は実値撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*