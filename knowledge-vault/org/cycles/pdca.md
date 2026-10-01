---
cycle: pdca
type: org-cycle
title: "PDCA サイクル"
tags:
  - org/cycle
  - orchestration
---

# PDCA サイクル

1. **[plan]** owner=coo+executive （直列）
   - CEO方針を受け orchestration:plan で推奨チーム数と着手候補を算出。担当役員へ割当て論点を確定
2. **[do]** owner=staff （並列）
   - 役員→管理職→一般職の調査チーム(read-only Agent)を並列起動し、各論点を設計(式/境界値/テスト方針/不変条件)
3. **[check]** owner=cqo+coo （直列）
   - COOが素案を1論点ずつ直列実装し、CQO配下が端数/ゼロ除算/境界/等価変異を監査。typecheck/lint/test/verify:all/build:web と対象mutation100%を全green化
4. **[act]** owner=coo （直列）
   - shippedをregistryに記録(teams[]追加/round追記/backlog更新)、コミット・PR。次サイクルの細分化方針を確定

## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
