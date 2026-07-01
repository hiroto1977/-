---
collection: academic
id: econ-synthetic-control-method
category: "economics"
category_ja: "経済学"
title: "合成コントロール法（synthetic control method）"
as_of: "2026-07"
source_count: 3
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "合成コントロール法（synthetic control method）"
---

# 合成コントロール法（synthetic control method）

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-07 ・ 出典: 3件（うち権威ある出典 ✓）

## 概要
合成コントロール法（synthetic control method）は、単一または少数の処置対象（国・州・地域等）に生じた政策や介入の因果効果を推定するための統計的手法である。処置を受けていない複数の対照ユニットの候補群から、処置前の結果変数や関連する共変量の推移が処置対象に最も近似するように非負かつ合計が1となる加重を最適化して算出し、その加重平均として「合成コントロール」と呼ばれる反実仮想（もし処置が生じなかった場合に実現していたはずの経路）を人工的に構成する。単一の対照群を分析者が主観的・恣意的に選ぶ従来の比較事例研究の問題を排し、加重の決定手続きをデータ駆動的に透明化した点に特色がある。アラン・アバディとハビエル・ガルデアサバルが2003年の論文でスペイン・バスク地方における分離主義テロの経済的損失を推定するために考案し、アバディ、アレクシス・ダイアモンド、イェンス・ハインミュラーが2010年のカリフォルニア州タバコ規制策（提案99号）の分析で加重最適化の推定手続きとプラセボ検定による統計的推論の方法を確立した。差の差分析が処置群と対照群が処置前に平行に推移するという「平行トレンド仮定」に依拠するのに対し、合成コントロール法は処置前の適合度そのものから加重を推定するため識別上の頑健性が高いとされる。比較可能な処置対象が単数または少数しか存在しない自然災害・制度改革・大規模イベント等の政策評価に広く応用され、実証経済学における因果推論の標準的手法の一つとなっている。

## 提唱者・初出
Abadie, Alberto （2003 "The Economic Costs of Conflict: A Case Study of the Basque Country"）／Gardeazabal, Javier ／Diamond, Alexis ／Hainmueller, Jens （2010 "Synthetic Control Methods for Comparative Case Studies"）

## 出典
- [Abadie, A., Diamond, A. & Hainmueller, J. (2010) "Synthetic Control Methods for Comparative Case Studies: Estimating the Effect of California's Tobacco Control Program", Journal of the American Statistical Association 105(490), 493-505](https://www.tandfonline.com/doi/abs/10.1198/jasa.2009.ap08746) `学術`
- [Abadie, A. (2021) "Using Synthetic Controls: Feasibility, Data Requirements, and Methodological Aspects", Journal of Economic Literature 59(2), 391-425](https://www.aeaweb.org/articles?id=10.1257/jel.20191450) `学術`
- [Wikipedia — Synthetic control method (Abadie & Gardeazabal 2003 Basque Country origin, weighted counterfactual construction, applications overview)](https://en.wikipedia.org/wiki/Synthetic_control_method) `リファレンス`

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
