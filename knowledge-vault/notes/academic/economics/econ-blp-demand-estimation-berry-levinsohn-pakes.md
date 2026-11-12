---
collection: academic
id: econ-blp-demand-estimation-berry-levinsohn-pakes
category: "economics"
category_ja: "経済学"
title: "BLP法（ランダム係数ロジット需要推定）——IIA制約と価格の内生性を解消し差別化財市場の需要を推定する構造推定法"
as_of: "2026-09"
source_count: 5
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "BLP法（ランダム係数ロジット需要推定）——IIA制約と価格の内生性を解消し差別化財市場の需要を推定する構造推定法"
---

# BLP法（ランダム係数ロジット需要推定）——IIA制約と価格の内生性を解消し差別化財市場の需要を推定する構造推定法

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-09 ・ 出典: 5件（うち権威ある出典 ✓）

## 概要
BLP法は、差別化財市場の需要を消費者ごとに異なる選好（ランダム係数）を持つロジットモデルで推定する構造推定法で、スティーブン・ベリー、ジェームズ・レビンソン、アリエル・パックスが「Automobile Prices in Market Equilibrium」（Econometrica第63巻4号、1995年、841-890頁）で提示した。単純なロジットは無関係な選択肢からの独立性（IIA）により代替パターンを歪め、観測されない製品品質ξが価格と相関する内生性も無視する。BLP法はこの異質性でIIAを緩和し、市場シェアと整合する平均効用を求める縮小写像（contraction mapping）と、競合の製品特性を操作変数とするGMM推定で価格内生性に対処する。ネヴォ（2000年、Journal of Economics & Management Strategy第9巻4号）は推定手順を実務解説し、シリアル業界分析（2001年、Econometrica第69巻2号）では価格コストマージンを差別化・複数商品保有・共謀の3要因に分解し、共謀でなく差別化とポートフォリオが主因と示した。後続研究では局所解への収束などの数値的困難（クニッテル＆メタクソグルー、2014年）が指摘され、コンロン＆ゴートメーカー（2020年、PyBLP）が推定実務の指針を整理した。中小企業でも、自社製品の需要弾力性は競合の特性配置に左右されるため、構造需要モデルは価格・製品戦略の定量的根拠となる。

## 提唱者・初出
スティーブン・ベリー、ジェームズ・レビンソン、アリエル・パックス（1995『Automobile Prices in Market Equilibrium』Econometrica）／アビブ・ネヴォ（2000 実務者向け解説／2001 シリアル業界応用）／クリストファー・クニッテル＆コンスタンティノス・メタクソグルー（2014・計算上の批判）／クリストファー・コンロン＆ジェフ・ゴートメーカー（2020・PyBLPで標準化）

## 出典
- [Berry, S., Levinsohn, J., & Pakes, A. (1995). Automobile Prices in Market Equilibrium. Econometrica, 63(4), 841-890. — BLP法の原典。ランダム係数ロジット需要モデルと縮小写像による推定手法を提示。](https://www.econometricsociety.org/publications/econometrica/1995/07/01/automobile-prices-market-equilibrium) `学術`
- [Nevo, A. (2000). A Practitioner's Guide to Estimation of Random-Coefficients Logit Models of Demand. Journal of Economics & Management Strategy, 9(4), 513-548. — BLP操作変数を含む推定手順の実務的解説を支持。](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1430-9134.2000.00513.x) `学術`
- [Nevo, A. (2001). Measuring Market Power in the Ready-to-Eat Cereal Industry. Econometrica, 69(2), 307-342. — シリアル業界への応用と価格コストマージンの3要因分解を支持。](https://econpapers.repec.org/RePEc:ecm:emetrp:v:69:y:2001:i:2:p:307-42) `学術`
- [Knittel, C. R., & Metaxoglou, K. (2014). Estimation of Random-Coefficient Demand Models: Two Empiricists' Perspective. Review of Economics and Statistics, 96(1), 34-59. — 推定アルゴリズムの局所解収束など計算上の限界の指摘を支持。](https://econpapers.repec.org/RePEc:tpr:restat:v:96:y:2014:i:1:p:34-59) `学術`
- [Conlon, C. T., & Gortmaker, J. (2020). Best Practices for Differentiated Products Demand Estimation with PyBLP. RAND Journal of Economics, 51(4), 1108-1161. — 推定実務のベストプラクティスとPyBLPによる標準化を支持。](https://onlinelibrary.wiley.com/doi/abs/10.1111/1756-2171.12352) `学術`

## 関連概念
- [[econ-edgeworth-price-cycles-maskin-tirole|エッジワース価格サイクル——マスキン＝ティロールの動学的価格競争と小売ガソリン価格の鋸歯状変動]] — 出典を共有
- [[econ-bank-lending-channel-kashyap|銀行貸出チャネル——金融政策が銀行の信用供給を通じて作用する経路]] — 出典を共有
- [[econ-baron-myerson-optimal-regulation|バロン＝マイヤーソンの最適規制理論（Baron-Myerson Optimal Regulation）]] — 出典を共有
- [[econ-chartalism-modern-monetary-theory|チャータリズムと現代貨幣理論（MMT）]] — 出典を共有
- [[econ-cointegration-error-correction-engle-granger|共和分と誤差修正モデル——非定常系列の長期均衡を捉えるエングル＝グレンジャーの表現定理]] — 出典を共有
- [[econ-generalized-method-of-moments-hansen|一般化モーメント法（GMM）——モーメント条件のみから分布を仮定せず母数を推定するハンセンの一般理論]] — 出典を共有
- [[econ-kreps-scheinkman-capacity-precommitment-cournot|クレプス＝シャインクマンの生産能力事前コミットメント・モデル——価格競争でもクールノー的寡占均衡へ至る二段階ゲーム]] — 出典を共有
- [[econ-natural-experiment-angrist|自然実験と操作変数法による因果識別戦略（アングリスト）]] — 出典を共有
- [[econ-reputation-effects-kreps-wilson-milgrom-roberts|不完備情報下の評判効果——わずかなタイプの不確実性が参入阻止と協調を合理化する]] — 出典を共有
- [[econ-rotemberg-saloner-price-wars-booms|ロテンバーグ＝サローナー・モデル——好況期に協調的価格が崩れ価格戦争が生じる反循環的マークアップ理論]] — 出典を共有

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
