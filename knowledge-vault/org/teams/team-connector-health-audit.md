---
team_id: connector-health-audit
type: org-team
manager: mgr-quality
title: "プラットフォーム(連携スタック健全性監査)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(連携スタック健全性監査)"
---
# プラットフォーム(連携スタック健全性監査)
- 焦点: connectorRegistry/connectorCatalog/pluginRuntime核に対する純粋な可観測性レポート connectorHealth(IO非保持・決定論的)。capabilityCoverage(capability毎connector id, 全キー必須)・serviceConnectivity(asSource/asTarget)・findUnreachableServices・pluginPermissionGaps(requiredPermissionFor/isPermittedで権限欠落検出)・connectorHealthReport集約。空入力でもthrowせず妥当な空レポート。全変異を実値全文照合で撃墜(pragma 0件)
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*