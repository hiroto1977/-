---
team_id: aftertax-report
type: org-team
manager: mgr-fpa
title: "経営管理(税引後利益のレポート出力)"
tags:
  - org/team
  - orchestration
aliases:
  - "経営管理(税引後利益のレポート出力)"
---
# 経営管理(税引後利益のレポート出力)
- 焦点: buildFinancialReportMarkdown に「法人税等(概算)」セクションを追加。ordinaryProfit指定時のみ法人税等内訳・実効税率・税引後利益をMarkdown出力、欠損分岐。未指定は既存出力不変
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cso|最高戦略責任者 (CSO)]] → [[mgr-fpa|経営管理部長 (FP&A)]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cso|最高戦略責任者 (CSO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*