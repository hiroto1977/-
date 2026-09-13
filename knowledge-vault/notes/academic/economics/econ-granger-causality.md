---
collection: academic
id: econ-granger-causality
category: "economics"
category_ja: "経済学"
title: "グレンジャー因果性"
as_of: "2026-06"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "グレンジャー因果性"
---

# グレンジャー因果性

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-06 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
グレンジャー因果性とは、クライヴ・グレンジャーが1969年に Econometrica 誌で提唱した時系列分析における予測的因果関係の検定手法である。時系列 X の過去の値が、Y 自身の過去（および他の利用可能な情報）のみによる予測を超えて Y の予測誤差を有意に減らすとき「X は Y をグレンジャー因果する」と定義され、実装上はベクトル自己回帰（VAR）に X のラグ項を加えた際の係数の同時有意性を F 検定等で判定する。要点は、これが構造的・介入的な因果ではなく予測の先行性であることで、第三の共通要因や、将来を織り込む期待形成（株価が将来の配当を「因果」するように見える）によって、真の因果なしに検定が通りうる。ラグ次数の選択への感度、同時点の相関（瞬時因果）の扱い、非定常系列での見せかけの回帰という落とし穴があり、単位根・共和分がある場合には誤り修正モデルや適切な検定手続へ置き換える必要がある——グレンジャーはまさにこの共和分の研究（エングルとの誤り修正表現定理）により2003年にノーベル経済学賞を受賞した。多変量への条件付き拡張、周波数領域版、非線形版が整備され、マクロ・金融の先行指標分析から、脳領域間の有向結合を推定する神経科学（脳波・fMRI）まで広く応用される一方、構造的識別を要する政策効果の議論では構造 VAR 等と役割分担すべきことが方法論上の合意である。

## 提唱者・初出
クライヴ・グレンジャー（Clive W. J. Granger, 1934–2009）／2003年ノーベル経済学賞（ロバート・エンゲルと共同受賞）

## 出典
- [Granger, C. W. J. (1969) "Investigating Causal Relations by Econometric Models and Cross-spectral Methods," Econometrica 37(3), 424–438](https://www.jstor.org/stable/1912791) `学術`
- [NobelPrize.org — Clive W. J. Granger, Prize in Economic Sciences 2003](https://www.nobelprize.org/prizes/economic-sciences/2003/granger/facts/) `リファレンス`

## 関連概念
- [[econ-cointegration-error-correction-engle-granger|共和分と誤差修正モデル——非定常系列の長期均衡を捉えるエングル＝グレンジャーの表現定理]] — 同じ思想家
- [[econ-volatility-clustering-engle|ボラティリティ・クラスタリングとARCH——時間変動するリスクのモデル化]] — 同じ思想家
- [[econ-export-led-growth-model|輸出主導型成長モデル]] — 同分野の近傍
- [[econ-barzel-measurement-cost-property-rights|財産権の測定費用理論（バーゼルのメジャーメント・コスト・アプローチ）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
