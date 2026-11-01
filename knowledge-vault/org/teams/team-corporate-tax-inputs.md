---
team_id: corporate-tax-inputs
type: org-team
manager: mgr-fpa
title: "経営管理(法人税 精度入力)"
tags:
  - org/team
  - orchestration
aliases:
  - "経営管理(法人税 精度入力)"
---
# 経営管理(法人税 精度入力)
- 焦点: CorporateTaxCard に資本金/従業者数/繰越欠損金の任意入力を追加し calcCorporateTax へ渡してライブ再計算。全欄空は既定で表示不変。rounds54-57の精度を実利用可能に
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cso|最高戦略責任者 (CSO)]] → [[mgr-fpa|経営管理部長 (FP&A)]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cso|最高戦略責任者 (CSO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*