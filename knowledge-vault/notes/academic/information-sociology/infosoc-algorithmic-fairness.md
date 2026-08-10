---
collection: academic
id: infosoc-algorithmic-fairness
category: "information-sociology"
category_ja: "情報社会学"
title: "アルゴリズム公正性（機械学習の公平性理論）"
as_of: "2026-06"
source_count: 4
authoritative: true
tags:
  - collection/academic
  - academic/information-sociology
  - knowledge/verified
aliases:
  - "アルゴリズム公正性（機械学習の公平性理論）"
---

# アルゴリズム公正性（機械学習の公平性理論）

> [!info] コレクション: [[学術概念]] ・ 区分: 情報社会学 ・ asOf: 2026-06 ・ 出典: 4件（うち権威ある出典 ✓）

## 概要
自動意思決定システムが差別的結果を生む問題を扱う分野。Friedlerらが公正性の不可能性を示し、Chouldechovaは複数の公正性基準が同時成立しないことを証明した。Selbstらは社会技術的文脈からの「抽象化の罠」を論じた。発火点は COMPAS 再犯予測をめぐる論争で、ProPublica は黒人被告の偽陽性率が高いと批判し、開発側は較正（同じスコアなら再犯率が人種で同じ）を反論に使った——Chouldechova と Kleinberg らは、基礎率が集団間で異なる限り、較正と偽陽性/偽陰性率の均等は同時に満たせないことを証明し、「どの公正性を採るか」が数学ではなく価値判断であることを示した。主要基準は、集団間の予測結果の分布を揃える独立性（デモグラフィック・パリティ）、誤り率を揃える分離性（equalized odds）、スコアの意味を揃える十分性（較正）に整理され、個人的公正（似た個人は似た扱い）と反実仮想的公正（属性を変えても結果が変わらない）が補完枠組みとして提案されている。Selbst らの「抽象化の罠」は、公正性を数式に閉じ込めると、フレーミング（何を予測問題にするか）・移植（別文脈への流用）・法制度との接続でシステム全体の不正義を見逃すと警告し、Friedler らの「公正の不可能性」は世界観（測定は真実を写すか、構造的バイアスを含むか）の選択が技術的選択に先行することを示した——EU AI Act・雇用審査規制・日本の AI 事業者ガイドラインなど、規制実務がこの学術的整理を参照している。

## 提唱者・初出
Sorelle A. Friedler ／ Alexandra Chouldechova ／ Andrew D. Selbst

## 出典
- [Friedler et al. (2016) — On the (im)possibility of fairness, arXiv](https://arxiv.org/abs/1609.07236) `学術`
- [Chouldechova (2017) — Fair Prediction with Disparate Impact, arXiv](https://arxiv.org/abs/1703.00056) `学術`
- [Selbst et al. (2019) — Fairness and Abstraction in Sociotechnical Systems, FAT*](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3265913) `学術`
- [Stanford Encyclopedia of Philosophy — Algorithmic Fairness](https://plato.stanford.edu/entries/algorithmic-fairness/) `リファレンス`

## 関連概念
- [[infosoc-machine-learning-bias-fairness|アルゴリズムバイアスとAI公平性——機械学習の差別リスクと「公平性（fairness）」の複数定義]] — 語彙が近い
- [[infosoc-web3|Web3]] — 出典を共有
- [[mgmt-cannibalization|カニバリゼーション（市場共食い）]] — 出典を共有
- [[infosoc-metaverse|メタバース]] — 出典を共有
- [[infosoc-civic-technology-movement|シビックテクノロジー運動]] — 出典を共有
- [[infosoc-algorithmic-bias-fairness|アルゴリズムの偏りと公平性（アルゴリズム的公正性）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
