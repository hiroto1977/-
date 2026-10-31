---
team_id: plugin-runtime-dispatch
type: org-team
manager: mgr-quality
title: "プラットフォーム(プラグイン実行ランタイム)"
tags:
  - org/team
  - orchestration
aliases:
  - "プラットフォーム(プラグイン実行ランタイム)"
---
# プラットフォーム(プラグイン実行ランタイム)
- 焦点: connectorRegistry/connectorCatalog核を土台に, 登録プラグイン群+発火イベントから どのフックが・どのコネクタを・実行許可付きで動かすかを決める純粋計画器 pluginRuntime。buildPluginRuntime(validatePlugin検証+id一意, 起動時loud-fail,.errors付与)・resolveHookPlan(入力順保持HookDispatchStep, 権限なしは除外せずpermitted:false明示で可観測)・requiredPermissionFor(capability→権限ホワイトリスト写像)・planPermittedSteps(実行直前ゲート)。IO非保持(送信は薄アダプタ責務)。mutation pragma 0件で全変異を実値撃墜
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cqo|最高品質責任者 (CQO)]] → [[mgr-quality|品質保証部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cqo|最高品質責任者 (CQO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*