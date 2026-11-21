---
collection: academic
id: econ-volatility-clustering-engle
category: "economics"
category_ja: "経済学"
title: "ボラティリティ・クラスタリングとARCH——時間変動するリスクのモデル化"
as_of: "2026-06-27"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "ボラティリティ・クラスタリングとARCH——時間変動するリスクのモデル化"
---

# ボラティリティ・クラスタリングとARCH——時間変動するリスクのモデル化

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-06-27 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
ボラティリティ・クラスタリング（volatility clustering）は、金融時系列データに広く見られる経験的な規則性で、価格変動の大きさ（ボラティリティ、変動性）が時間的にかたまって（クラスター）現れる現象を指す。すなわち、価格が大きく動いた後には、その向きが上であれ下であれ、再び大きな変動が続きやすく、逆に小さな変動の後には小さな変動が続きやすい。市場が荒れる時期と穏やかな時期が、それぞれ持続して現れるのである。この観察自体は、ブノワ・マンデルブロらが早くから指摘していたが、これを統計モデルとして定式化したのが、ロバート・エングルが1982年の論文で提唱した「自己回帰条件付き分散不均一性（ARCH、autoregressive conditional heteroskedasticity）」のモデルである。伝統的な計量経済学のモデルは、しばしば、誤差項の分散（ボラティリティ）が時間を通じて一定であると仮定していた（分散均一性、homoskedasticity）。しかしエングルは、金融データのボラティリティが一定ではなく、時間とともに変動し、しかも過去のボラティリティに依存して持続することに着目した。ARCHモデルは、ある時点の収益率の条件付き分散（その時点で予想されるボラティリティの大きさ）が、過去の予測誤差の二乗に依存するとモデル化する。直近に大きな変動（大きな予測誤差）があれば、次の時点の予想ボラティリティも大きくなる。これにより、ボラティリティ・クラスタリングが捉えられる。ティム・ボラースレフは1986年に、ARCHモデルを一般化した「GARCH（generalized ARCH）」モデルを提唱し、条件付き分散が、過去の予測誤差だけでなく過去の条件付き分散自体にも依存するとして、より少ないパラメータで現実のボラティリティの動きを柔軟に捉えられるようにした。これらのARCH／GARCH型のモデルは、金融計量経済学に革命をもたらした。それまで一定と仮定されがちだったリスク（ボラティリティ）を、時間変動するものとして動的にモデル化し予測できるようにしたことで、オプションの価格付け、リスク管理（バリュー・アット・リスクの推定）、ポートフォリオの最適化など、金融の理論と実務に広く応用された。市場のリスクが時とともに変動するという認識は、現代のリスク管理の基礎をなす。エングルは、時間変動するボラティリティの分析手法であるARCHモデルの開発などの貢献により、2003年にノーベル経済学賞を受賞した。ボラティリティ・クラスタリングとARCH／GARCHモデルは、金融市場のリスクの時間的な動態を捉え、金融計量経済学とリスク管理の根幹をなす、重要な理論と手法である。

## 提唱者・初出
ロバート・エングル ／ ティム・ボラースレフ ／ ブノワ・マンデルブロ ／ クライブ・グレンジャー

## 出典
- [Engle, R.F. (1982) Autoregressive Conditional Heteroscedasticity with Estimates of the Variance of UK Inflation — Econometrica 50(4)](https://doi.org/10.2307/1912773) `学術`
- [Wikipedia: Volatility clustering / ARCH — Engle, GARCH (Bollerslev), time-varying volatility, risk management](https://en.wikipedia.org/wiki/Volatility_clustering) `リファレンス`

## 関連概念
- [[econ-granger-causality|グレンジャー因果性]] — 同じ思想家
- [[econ-cointegration-error-correction-engle-granger|共和分と誤差修正モデル——非定常系列の長期均衡を捉えるエングル＝グレンジャーの表現定理]] — 同じ思想家
- [[econ-smooth-ambiguity-klibanoff|スムーズ曖昧性モデル——曖昧性への態度を信念から分離する]] — 同分野の近傍
- [[econ-eaton-lipsey-local-clustering|イートン＝リプシーの局所的集塊の原理（Eaton-Lipsey's Principle of Local Clustering）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
