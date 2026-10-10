---
team_id: cloud-sync-runtime
type: org-team
manager: mgr-quality
title: "プラットフォーム(クラウド同期ランタイム)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(クラウド同期ランタイム)"
---
# プラットフォーム(クラウド同期ランタイム)
- 焦点: cloudBackup核を実動かす同期計画(planSync:アップロードキュー/skip/削除候補のみ)・状態機械(scanning→encrypting→uploading→verifying→done)・自動同期スケジューラ(shouldSync)・進捗。薄アダプタ(vault暗号+注入transport)+SettingsPanel最小UI。非破壊・自動削除なし
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*