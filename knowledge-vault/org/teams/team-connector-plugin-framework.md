---
team_id: connector-plugin-framework
type: org-team
manager: mgr-quality
title: "プラットフォーム(コネクタ/プラグイン拡張基盤)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(コネクタ/プラグイン拡張基盤)"
---
# プラットフォーム(コネクタ/プラグイン拡張基盤)
- 焦点: サービス横断のコネクタ検証/解決(validateConnectors集約エラー・buildConnectorRegistry起動時loud-fail・resolveConnectors能力解決)・宣言的フィールドマッピング(applyFieldMap: fallback/skip/falsy-but-defined保持/同一to後勝ち)・プラグイン(PluginManifest, semver検証isValidSemver, 権限/hookホワイトリスト+重複検出, isPermitted defense-in-depth)。IO非保持の純粋核。shopifyのduplicate-action不変条件をサービス横断基盤へ昇華
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*