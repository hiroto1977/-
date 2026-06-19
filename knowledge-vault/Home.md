---
title: Home
type: home
total_entries: 1866
tags:
  - home
  - MOC
---

# 確証済み知識ヴォルト — Home

リポジトリの確証済み知識データすべてを横断する **1866件** のノート。
いずれも独立2出典以上・うち1件以上は権威ある出典（大学／学会／査読論文／公的機関・自治体／百科事典級リファレンス）で確認済み。
`src/renderer/data/*Knowledge.ts` ほかを真実源として `npm run vault:build` で生成。

## コレクション別MOC
- [[学術概念]] — 1235件
- [[法務・税務・労務]] — 402件
- [[補助金・助成金]] — 140件
- [[相談窓口]] — 3件
- [[経済史]] — 86件

## AIオーケストレーション連携
- [[Organization]] — 組織図（CEO→COO→役員→秘書室／管理職→一般職）とサイクル。各役員ノートに知識ブリーフを相互リンク
- [[AI_ORCHESTRATION_CONTEXT]] — 各役員ロール（COO/CSO/CFO/CHRO/CIO/CQO）への知識ブリーフ索引
- 実行時取得: `npm run orchestrate:context -- --role <execId>`（dispatch に自動注入）

## 方法論（蓄積した運用知）
- [[research-discipline|確証ディシプリン（出典検証の規律）]]
- [[orchestration-loop|並列オーケストレーション・ループ]]
- [[source-hygiene|出典衛生（正規化ルール）]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
