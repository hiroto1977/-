---
cycle: ooda
type: org-cycle
title: "OODA サイクル"
tags:
  - org/cycle
  - orchestration
---

# OODA サイクル

1. **[observe]** owner=cqo （並列）
   - CI/mutation/lint/verify の異常やレビュー指摘・障害を観測(webhook/監視)
2. **[orient]** owner=coo+executive （直列）
   - 観測を指揮系統で解釈し、影響範囲・既知の罠(render StringLiteral帰属等)と照合して原因を方向付け
3. **[decide]** owner=coo （直列）
   - 修正/エスカレーション/様子見を即決。曖昧or大規模はCEOへ確認
4. **[act]** owner=coo （直列）
   - 最小修正を直列適用→再検証→push。学びをregistry/READMEへ反映

## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
