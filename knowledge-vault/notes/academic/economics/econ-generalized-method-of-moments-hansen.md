---
collection: academic
id: econ-generalized-method-of-moments-hansen
category: "economics"
category_ja: "経済学"
title: "一般化モーメント法（GMM）——モーメント条件のみから分布を仮定せず母数を推定するハンセンの一般理論"
as_of: "2026-09"
source_count: 5
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "一般化モーメント法（GMM）——モーメント条件のみから分布を仮定せず母数を推定するハンセンの一般理論"
---

# 一般化モーメント法（GMM）——モーメント条件のみから分布を仮定せず母数を推定するハンセンの一般理論

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-09 ・ 出典: 5件（うち権威ある出典 ✓）

## 概要
一般化モーメント法（GMM）は、モーメント条件E[g(X,θ)]=0の標本平均をゼロに近づけパラメータθを推定する手法で、ラース・ピーター・ハンセンが論文『Large Sample Properties of Generalized Method of Moments Estimators』（Econometrica 50巻4号、1982年、1029–1054頁）で確立した。条件数がパラメータ数を超える過剰識別では二次形式を重み行列で加重して最小化し、最適重み行列はモーメントの分散共分散行列の逆行列で、妥当性はJ検定（サーガン検定の一般化）でカイ二乗検定する。ハンセンはケネス・シングルトンと消費資産価格モデルのオイラー方程式にGMMを応用（同50巻5号、1269–1286頁）、分布を仮定せず割引因子とリスク回避度を推定したが、過剰識別制約は多くの定式化で棄却された。線形かつ最適重み行列ならOLS・IV・2段階最小二乗法はGMMの特殊ケースで、分布仮定が正しければ最尤法も漸近的に一致する。後にHAC推定量（ニューウィー＆ウェスト1987）、動的パネルGMM（アレラーノ＆ボンド1991）、二段階・逐次・連続更新GMMの比較（ハンセン・ヒートン・ヤロン1996）へ発展したが、操作変数が弱いか条件過多だと有限標本で偏りが生じ、ストック＆ライト（2000）は弱識別下で漸近理論が破綻すると示した。分布形状が未知でも操作変数があれば一致推定と過剰識別検定を行え、需要の価格弾力性やリスクプレミアム分析に役立つ。

## 提唱者・初出
ラース・ピーター・ハンセン（1982『Large Sample Properties of Generalized Method of Moments Estimators』／2013年ノーベル経済学賞をユージン・ファーマ＆ロバート・シラーと共同受賞）／ケネス・シングルトン（ハンセンとの共著1982『Generalized Instrumental Variables Estimation of Nonlinear Rational Expectations Models』）／ホイットニー・ニューウィー＆ケネス・ウェスト（1987 HAC共分散行列）／マヌエル・アレラーノ＆スティーブン・ボンド（1991 動的パネルGMM）／ジェームズ・ストック＆ジョナサン・ライト（2000 弱識別下のGMM理論）

## 出典
- [Hansen, L. P. (1982). "Large Sample Properties of Generalized Method of Moments Estimators." Econometrica, 50(4), 1029–1054. — GMMの原論文。モーメント条件・過剰識別・最適重み行列・J検定の定式化の一次資料。](https://www.econometricsociety.org/publications/econometrica/1982/07/01/large-sample-properties-generalized-method-moments-estimators) `学術`
- [Hansen, L. P. & Singleton, K. J. (1982). "Generalized Instrumental Variables Estimation of Nonlinear Rational Expectations Models." Econometrica, 50(5), 1269–1286. — 消費資産価格モデルのオイラー方程式へのGMM応用を確認。](https://www.econometricsociety.org/publications/econometrica/1982/09/01/generalized-instrumental-variables-estimation-nonlinear) `学術`
- [The Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel 2013 — NobelPrize.org. — ハンセンが2013年にユージン・ファーマ、ロバート・シラーと共同受賞したこと（資産価格の実証分析）を確認。](https://www.nobelprize.org/prizes/economic-sciences/2013/hansen/facts/) `リファレンス`
- [Newey, W. K. & West, K. D. (1987). "A Simple, Positive Semi-Definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix." Econometrica, 55(3), 703–708. — GMMの最適重み行列を系列相関・不均一分散に対応させたHAC推定量の後続研究を確認。](https://www.econometricsociety.org/publications/econometrica/1987/05/01/notes-and-comments-simple-positive-semi-definite) `学術`
- [Stock, J. H. & Wright, J. H. (2000). "GMM with Weak Identification." Econometrica, 68(5), 1055–1096. DOI: 10.1111/1468-0262.00151. — 弱い操作変数・弱識別下でGMMの標準的漸近理論が破綻することを示した批判研究を確認。](https://onlinelibrary.wiley.com/doi/abs/10.1111/1468-0262.00151) `学術`

## 関連概念
- [[econ-efficient-market-hypothesis|効率的市場仮説（efficient market hypothesis, EMH）]] — 同じ思想家
- [[econ-efficient-market-hypothesis-fama|効率的市場仮説とファーマの資産価格形成論]] — 同じ思想家
- [[econ-narrative-economics|ナラティブ経済学：物語の伝播が経済変動を駆動するメカニズム]] — 同じ思想家
- [[econ-asset-pricing-anomalies|資産価格アノマリー（Asset Pricing Anomalies）]] — 同じ思想家
- [[econ-housing-market-bubble-case-shiller|住宅市場バブルとケース＝シラー指数——行動的資産価格と不動産市場の周期的変動]] — 同じ思想家
- [[econ-agency-theory-jensen-meckling|エージェンシー理論——ジェンセン＆メックリングの所有・経営分離問題とインセンティブ設計]] — 同じ思想家
- [[econ-alchian-demsetz-team-production|チーム生産と残余請求権（アルチャン＆デムセッツ）]] — 同じ思想家
- [[econ-asset-price-bubbles-kindleberger-minsky|資産価格バブル——キンドルバーガーとミンスキーの信用サイクルと崩壊のモデル]] — 同じ思想家
- [[econ-campbell-shiller-decomposition|キャンベル＝シラー分解——株価の変動は配当か割引率か]] — 同じ思想家
- [[econ-career-concerns-holmstrom|キャリア・コンサーン（ホルムストローム）——評判が生む暗黙の誘因]] — 同じ思想家

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
