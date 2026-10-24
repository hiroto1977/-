---
team_id: cloud-backup-core
type: org-team
manager: mgr-quality
title: "プラットフォーム(暗号化クラウドバックアップ)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(暗号化クラウドバックアップ)"
---
# プラットフォーム(暗号化クラウドバックアップ)
- 焦点: E2E暗号(vault AES-GCM委譲)前提のマニフェスト/差分(added/changed/unchanged/removedは削除候補のみ)/非破壊バージョニング/チャンク分割/SHA-256整合検証/暗号エンベロープのモデル化。鍵・平文は非保持、自動削除なし(安全側)。実クラウド送信は後続アダプタ
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*