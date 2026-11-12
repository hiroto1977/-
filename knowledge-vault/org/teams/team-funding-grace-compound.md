---
team_id: funding-grace-compound
type: org-team
manager: mgr-funding
title: "資金調達(据置中の複利計上)"
tags:
  - org/team
  - orchestration
aliases:
  - "資金調達(据置中の複利計上)"
---
# 資金調達(据置中の複利計上)
- 焦点: 据置期間中の利息を都度払い(simple)か元本資本化(compound)で選択(graceInterestHandling)。複利選択時は据置後の元本・返済額・amortizationScheduleに反映、per-entry payment=principal+interest 不変条件を維持
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-funding|資金調達部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*