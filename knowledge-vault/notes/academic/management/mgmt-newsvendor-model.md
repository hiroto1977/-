---
collection: academic
id: mgmt-newsvendor-model
category: "management"
category_ja: "経営学"
title: "新聞売り子モデル——不確実な需要のもとでの最適発注量"
as_of: "2026-06-27"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/management
  - knowledge/verified
aliases:
  - "新聞売り子モデル——不確実な需要のもとでの最適発注量"
---

# 新聞売り子モデル——不確実な需要のもとでの最適発注量

> [!info] コレクション: [[学術概念]] ・ 区分: 経営学 ・ asOf: 2026-06-27 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
新聞売り子モデル（newsvendor model、新聞売子問題）は、オペレーションズ・マネジメント（生産・在庫管理）の基礎をなす数理モデルで、需要が不確実な状況で、一度きりの発注量をいくらにすれば期待利益が最大になるかを問う。名前の由来は、毎朝その日の新聞を仕入れて売る新聞売りである。新聞は売れ残れば翌日には価値がなく（廃棄）、逆に足りなければ売る機会を逃す。どれだけ仕入れるべきか。この構造は、季節商品、生鮮食品、ファッション衣料、雑誌、ワクチン、座席や部屋の確保など、「作り直し・追加発注が間に合わず、売れ残りも品切れもどちらも損失になる」あらゆる単一期間の在庫問題に共通する。モデルは二種類のコストの綱引きとして定式化される。一つは「品切れコスト（過少発注の損失、underage cost、Cu）」——需要に対して仕入れが足りず、売れたはずの一単位の利益（および信用の損失）を逃すコスト。もう一つは「売れ残りコスト（過剰発注の損失、overage cost、Co）」——需要を超えて仕入れた一単位が売れ残り、廃棄や値引きで被るコストである。最適な発注量は、追加で一単位仕入れることの期待限界便益と期待限界費用が釣り合う点で決まる。その条件は「臨界比（critical ratio、限界比率）」と呼ばれ、最適な在庫水準は、需要がその量以下に収まる確率が Cu ÷（Cu＋Co）に等しくなる点に設定される、というエレガントな式で表される。すなわち、品切れの損失が大きい（Cu が大きい）ほど多めに、売れ残りの損失が大きい（Co が大きい）ほど少なめに発注するのが最適となる。アロー、ハリス、マルシャックらが1951年に定式化したこのモデルは、安全在庫、サプライチェーンの在庫配置、過剰予約（オーバーブッキング）、収益管理（レベニュー・マネジメント）へと発展し、不確実性下の意思決定を扱うオペレーションズ・マネジメントの中核的な枠組みとなっている。

## 提唱者・初出
ケネス・アロー ／ セオドア・ハリス ／ ヤコブ・マルシャック ／ エヴァン・ポーテウス

## 出典
- [Arrow, K. J., Harris, T. & Marschak, J. (1951) Optimal Inventory Policy — Econometrica, 19(3), 250–272](https://doi.org/10.2307/1907465) `学術`
- [Wikipedia: Newsvendor model — single-period stochastic inventory, critical ratio Cu/(Cu+Co), overage vs. underage cost](https://en.wikipedia.org/wiki/Newsvendor_model) `リファレンス`

## 関連概念
- [[econ-welfare-theorems|厚生経済学の基本定理]] — 同じ思想家
- [[econ-experience-curve-henderson|経験曲線——累積生産量の倍増ごとに単位費用が一定率で低下する]] — 同じ思想家
- [[econ-learning-by-doing|学習効果（ラーニング・バイ・ドゥーイング）]] — 同じ思想家
- [[econ-welfare-economics|厚生経済学：社会的厚生と資源配分効率性の理論的分析]] — 同じ思想家
- [[econ-condorcet-paradox-cycling|コンドルセのパラドックス——多数決における選好の循環と社会的選択の不安定性]] — 同じ思想家
- [[econ-contingent-valuation|仮想評価法——表明選好により非市場財の価値を計測する手法]] — 同じ思想家
- [[econ-discrimination-becker|差別の経済学——「差別への嗜好」と競争による差別の侵食]] — 同じ思想家
- [[econ-edgeworth-box-exchange-efficiency|エッジワース・ボックスと契約曲線——純粋交換経済における効率的配分の幾何学]] — 同じ思想家
- [[econ-elasticity-of-substitution-ces|代替の弾力性と CES 生産関数——要素比率が相対価格にどれだけ反応するかを一つの数 σ で表し、コブ＝ダグラスとレオンチェフを特殊ケースに含む]] — 同じ思想家
- [[econ-general-equilibrium-walras|ワルラスの一般均衡理論]] — 同じ思想家

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
