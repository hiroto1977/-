---
collection: academic
id: econ-regression-discontinuity
category: "economics"
category_ja: "経済学"
title: "回帰不連続デザイン（RDD）"
as_of: "2026-06"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "回帰不連続デザイン（RDD）"
---

# 回帰不連続デザイン（RDD）

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-06 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
因果推論のための準実験デザインで、処置が連続的な「割当変数（running/forcing variable）」が既知の閾値（カットオフ）を超えるか否かで決定的に決まる場合に適用される（例：試験点が合格点以上、所得が基準以下、得票率が50%超）。閾値のすぐ上と下の対象は処置の有無以外ほぼ同質とみなせるため、両側の僅差の対象の結果を比較すれば、閾値における局所的な因果効果が識別できる――いわば閾値近傍での局所的な無作為実験である。処置が閾値超えの決定的な階段関数となるシャープRDDと、閾値超えで処置を受ける確率が不連続に変化する（0→1とは限らない）ファジーRDDの二類型がある。推定されるのは閾値における局所平均処置効果（LATE）であり、閾値から離れた領域への外的妥当性は限定的である。シスルスウェイト＆キャンベル（1960）に起源を持ち、近年の計量経済学（Imbens & Lemieux、Lee & Lemieux ほか）で発展した。処置前後で並行トレンドを仮定する差の差分析とは区別される。

## 提唱者・初出
ドナルド・シスルスウェイト／ドナルド・キャンベル（Thistlethwaite & Campbell, 1960）／Imbens & Lemieux／Lee & Lemieux

## 出典
- [Lee & Lemieux (2010), Regression Discontinuity Designs in Economics, NBER Working Paper No. 14723](https://www.princeton.edu/~davidlee/wp/w14723.pdf) `学術`
- [ScienceDirect Topics — Regression Discontinuity Design (overview)](https://www.sciencedirect.com/topics/economics-econometrics-and-finance/regression-discontinuity-design) `リファレンス`

## 関連概念
- [[econ-goodharts-law-monetary|グッドハートの法則——指標が目標となるとき有効性を失う統計的規則性]] — 同じ思想家
- [[human-hedonic-adaptation-brickman|快楽適応理論——幸福度のセットポイントと重大な生活事象からの回復]] — 同じ思想家
- [[econ-agglomeration-economies|集積の経済]] — 出典を共有
- [[econ-coase-conjecture|コースの推測（耐久財独占）]] — 出典を共有
- [[econ-deaton-paradox|ディートンのパラドックス（消費の過剰平滑性）]] — 出典を共有
- [[econ-rothschild-stiglitz|ロスチャイルド＝スティグリッツ・モデル（保険市場の選別）]] — 出典を共有
- [[econ-seigniorage-hyperinflation-cagan|インフレ税と超インフレ——ケーガンモデルが解明するハイパーインフレの自己強化メカニズム]] — 同分野の近傍
- [[econ-general-equilibrium-walras|ワルラスの一般均衡理論]] — 同分野の近傍
- [[econ-sheepskin-effect|シープスキン効果（sheepskin effect／卒業証書効果）——学位取得そのものがもたらす賃金の非連続的上昇]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
