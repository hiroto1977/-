---
team_id: connector-catalog-runtime
type: org-team
manager: mgr-quality
title: "プラットフォーム(コネクタ・カタログ/実行計画)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(コネクタ・カタログ/実行計画)"
---
# プラットフォーム(コネクタ・カタログ/実行計画)
- 焦点: connectorRegistry核を土台に実在サービス間の具体コネクタを宣言する CONNECTOR_CATALOG(8件)・起動時loud-fail構築 CATALOG_REGISTRY・純粋実行計画器 planConnectorRun(applyFieldMapでtargetペイロード生成, unknown idはthrow, IO非保持=送信は薄アダプタ責務)・resolveConnectors委譲ヘルパ(listConnectorsFor/ByCapability/catalogConnectorIds)。宣言データはStryker block除外, 振る舞いは実値全文照合で撃墜
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*