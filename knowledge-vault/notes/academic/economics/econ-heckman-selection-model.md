---
collection: academic
id: econ-heckman-selection-model
category: "economics"
category_ja: "経済学"
title: "ヘックマンの標本選択モデル（Heckman Selection Model／ヘックマン補正）"
as_of: "2026-06"
source_count: 3
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "ヘックマンの標本選択モデル（Heckman Selection Model／ヘックマン補正）"
---

# ヘックマンの標本選択モデル（Heckman Selection Model／ヘックマン補正）

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-06 ・ 出典: 3件（うち権威ある出典 ✓）

## 概要
標本選択バイアス（サンプルセレクション・バイアス）とは、観測されるデータが母集団からの無作為抽出ではなく、当事者自身の行動によって非無作為に選び出された結果であるために生じる統計的偏りをいう。代表例が女性の労働供給・賃金研究である。市場賃金が観測できるのは実際に働いている女性に限られるが、就業するか否かの決定自体が、観測されない賃金決定要因（能力・意欲・留保賃金等）と相関しうるため、就業者だけの賃金データを単純に最小二乗法で回帰しても、誤差項の条件付き期待値がゼロにならず、母集団全体に当てはまる真の賃金関数を一致推定できない。ジェームズ・ヘックマンは1979年の論文「Sample Selection Bias as a Specification Error」（Econometrica誌47巻153-161頁）において、この問題を欠落変数バイアスと同型の「特定化の誤り」として整理し、実行可能な二段階推定法を提示した。第一段階では、就業するか否かをプロビット・モデルで推定し、そこから逆ミルズ比（選択確率の密度関数と累積分布関数の比）を各観測値について算出する。第二段階では、この逆ミルズ比を追加の説明変数として賃金関数に組み込んだ上で最小二乗法により回帰することで、選択による偏りを補正した一致推定量を得る。この手法は「ヘックマン補正」または「ヘッキット」と呼ばれ、労働経済学・保健医療経済学・開発経済学など、観測データが自己選択を伴う幅広い実証研究の標準的手法として定着した。ヘックマンはこの貢献により、離散選択モデルのダニエル・マクファデンとともに2000年のノーベル経済学賞を受賞した。

## 提唱者・初出
Heckman, James J.（1979 "Sample Selection Bias as a Specification Error", Econometrica）／McFadden, Daniel L.（離散選択モデル、2000年ノーベル経済学賞共同受賞）

## 出典
- [Heckman, J.J. (1979) Sample Selection Bias as a Specification Error — Econometrica 47(1), 153-161](https://doi.org/10.2307/1912352) `学術`
- [The Sveriges Riksbank Prize in Economic Sciences 2000 — Nobel Prize Summary (Heckman & McFadden)](https://www.nobelprize.org/prizes/economic-sciences/2000/summary/) `公的`
- [Heckman, J.J. (1977/1979) Sample Selection Bias As a Specification Error (with an Application to the Estimation of Labor Supply Functions) — NBER Working Paper 172](https://www.nber.org/papers/w0172) `学術`

## 関連概念
- [[econ-rational-inattention-sims|合理的不注意理論——情報処理コストに基づく意思決定と価格硬直性]] — 同分野の近傍
- [[econ-burdett-mortensen-wage-dispersion|バーデット＝モーテンセン・モデル——同一労働者でも賃金が分散する均衡]] — 同分野の近傍
- [[econ-supplier-induced-demand|供給者誘発需要——医師は自らの需要を生み出すのか]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
