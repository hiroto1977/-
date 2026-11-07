---
team_id: cash-forecast-precision
type: org-team
manager: mgr-fpa
title: "経営管理(資金繰り予測)"
tags:
  - org/team
  - orchestration
aliases:
  - "経営管理(資金繰り予測)"
---
# 経営管理(資金繰り予測)
- 焦点: シナリオ別ランウェイ(楽観/標準/悲観)・乗法的季節指数+季節予測・必要調達額(目標残高維持)・感応度(売上±%×回収サイト悪化)を加算。空/分母0/非有限/期間0ガード、既存(forecastCashBalance/cashForecastTrajectory)不変
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cso|最高戦略責任者 (CSO)]] → [[mgr-fpa|経営管理部長 (FP&A)]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cso|最高戦略責任者 (CSO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*