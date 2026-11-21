---
team_id: tax-stamp-duty
type: org-team
manager: mgr-tax
title: "税務(印紙税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(印紙税)"
---
# 税務(印紙税)
- 焦点: 印紙税額一覧表(令和ベース本則)の階段表ルックアップ。第1号(不動産譲渡)/第2号(請負)共通階段・第17号(領収書, 5万円未満非課税/営業外0)・第7号(継続的基本契約 一律4000円)・記載金額なし200円。境界は以下/超を厳密実装, 負/非有限/ホワイトリスト外はthrow。税額テーブルはStryker block除外, 境界比較は実値テストで撃墜。軽減措置は対象外(本則のみ)・概算注記必須
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*