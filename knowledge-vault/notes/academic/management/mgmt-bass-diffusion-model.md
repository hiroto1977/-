---
collection: academic
id: mgmt-bass-diffusion-model
category: "management"
category_ja: "経営学"
title: "バスの普及モデル（Bass diffusion model）——新製品の採用を革新係数pと模倣係数qで記述する数理予測モデル"
as_of: "2026-06-27"
source_count: 3
authoritative: true
tags:
  - collection/academic
  - academic/management
  - knowledge/verified
aliases:
  - "バスの普及モデル（Bass diffusion model）——新製品の採用を革新係数pと模倣係数qで記述する数理予測モデル"
---

# バスの普及モデル（Bass diffusion model）——新製品の採用を革新係数pと模倣係数qで記述する数理予測モデル

> [!info] コレクション: [[学術概念]] ・ 区分: 経営学 ・ asOf: 2026-06-27 ・ 出典: 3件（うち権威ある出典 ✓）

## 概要
バスの普及モデル（Bass diffusion model）は、フランク・M・バス（Frank M. Bass）が1969年に発表した、新製品の採用がいつ・どの速さで進むかを予測する数理モデルである。基本式は dF(t)/dt = [ p + q・F(t) ]・[ 1 − F(t) ] という微分方程式で表され、F(t) は時刻 t までに製品を採用した人の累積割合を示す。革新係数 p は、広告やマスメディアなど他者の採用状況とは無関係に働く外部影響を表し、模倣係数 q は、既採用者からの口コミや社会的伝染といった内部影響を表す。市場全体の潜在採用者数 m を加えた三つのパラメータで、採用が初期はゆっくり、中盤で加速し、終盤で飽和するという特徴的なS字型の累積採用曲線と、ベル型（鐘型）の販売ピーク曲線が導かれる。ロジャーズの「イノベーター」「アーリーアダプター」といった定性的な採用者カテゴリーと異なり、バスのモデルは将来の販売量を数値で予測できる定量的ツールであり、耐久消費財や新技術の需要予測に広く用いられてきた。バスは発表当時パデュー大学の教授で、この論文は2004年にINFORMSによりマネジメントサイエンス誌50年史で最も影響力のある10論文の一つに選ばれた。一方で批判・限界も指摘される。p・q・m を時間を通じて一定と仮定するため、価格変動や競合・マーケティング施策の効果を組み込めない点、市場を均質で全員がつながったネットワークとみなす単純化、そしてパラメータの安定推定には発売後の実販売データが必要で、投資判断が済んだ後でしか精度が確保しにくいという予測上の弱点である。後年これらを補う一般化バスモデルなどの拡張も提案されている。

## 提唱者・初出
Frank M. Bass（提唱者, 1969年） ／ Management Science 15(5):215-227（初出論文, DOI 10.1287/mnsc.15.5.215） ／ 革新係数 p・模倣係数 q・潜在採用者数 m（3パラメータ） ／ Everett M. Rogers（普及理論の先行研究, 比較対象）

## 出典
- [Bass, F. M. (1969) "A New Product Growth for Model Consumer Durables", Management Science, 15(5), 215-227, DOI 10.1287/mnsc.15.5.215](https://doi.org/10.1287/mnsc.15.5.215) `学術`
- [Wikipedia, "Bass diffusion model" — p（革新係数）, q（模倣係数）, 微分方程式 dF/dt=\[p+qF\](1−F), S字曲線](https://en.wikipedia.org/wiki/Bass_diffusion_model) `リファレンス`
- [INFORMS, Biographical Profile: Frank M. Bass (1926–2006) — 1969年論文を Management Science 50年史の最重要論文10件に選出（2004年）](https://www.informs.org/Explore/History-of-O.R.-Excellence/Biographical-Profiles/Bass-Frank-M) `リファレンス`

## 関連概念
- [[agile-development|アジャイルソフトウェア開発]] — 同分野の近傍
- [[mgmt-360-feedback|360度フィードバック（多面評価）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
