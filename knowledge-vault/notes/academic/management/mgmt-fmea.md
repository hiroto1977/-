---
collection: academic
id: mgmt-fmea
category: "management"
category_ja: "経営学"
title: "故障モード影響解析（FMEA／Failure Mode and Effects Analysis）——起こりうる故障を体系的に洗い出し、深刻度・発生度・検出度で優先順位づける"
as_of: "2026-06-27"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/management
  - knowledge/verified
aliases:
  - "故障モード影響解析（FMEA／Failure Mode and Effects Analysis）——起こりうる故障を体系的に洗い出し、深刻度・発生度・検出度で優先順位づける"
---

# 故障モード影響解析（FMEA／Failure Mode and Effects Analysis）——起こりうる故障を体系的に洗い出し、深刻度・発生度・検出度で優先順位づける

> [!info] コレクション: [[学術概念]] ・ 区分: 経営学 ・ asOf: 2026-06-27 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
故障モード影響解析（FMEA）は、製品・工程・システムに起こりうる故障の様式（故障モード）をあらかじめ体系的に洗い出し、それぞれが引き起こす影響と原因を分析して、危険度の高いものから優先的に対策を講じるための、信頼性工学・品質管理の手法である。起源は1949年の米軍規格（MIL-P-1629）にさかのぼり、1960年代にNASAのアポロ計画で信頼性確保のために用いられ、その後フォードをはじめとする自動車産業（AIAGの標準）へ広まり、製造・医療・航空・ソフトウェアなど幅広い分野に普及した。手順の要点はこうである。分析対象を構成要素や工程のステップに分解し、各要素について「どのように故障しうるか（故障モード）」を列挙する。次に、その故障が顧客やシステムに与える「影響（effect）」と、影響の深刻さ（Severity, S）を評価し、故障を引き起こす「原因（cause）」とその発生しやすさ（Occurrence, O）、さらに故障や原因が事前に検出される可能性（Detection, D）を、それぞれ通常1〜10の尺度で点数化する。三つの点数の積として「危険優先数（RPN＝S×O×D）」を算出し、その値が大きい故障モードほど優先的に是正措置を講じる。対象により、設計を分析するDFMEA（設計FMEA）と工程を分析するPFMEA（工程FMEA）に分かれる。FMEAは、故障が起きてから対処する事後的な発想ではなく、設計・工程の段階で潜在的なリスクを予見し予防する「未然防止」の思想を体現する。近年は自動車産業のAIAG・VDA共通手法など、RPN一辺倒の弱点（点数の積が同じでも深刻度の重みが異なる問題など）を補う「行動優先度（AP）」方式への改訂も進んでいる。品質機能展開（QFD）や特性要因図とならぶ、品質・信頼性マネジメントの基幹ツールである。

## 提唱者・初出
米軍規格MIL-P-1629（1949）に起源・NASAアポロ計画・自動車産業（AIAG）への普及 ／ 故障モード・影響・原因の体系的な洗い出し ／ 危険優先数（RPN＝深刻度Severity×発生度Occurrence×検出度Detection） ／ 設計FMEA（DFMEA）と工程FMEA（PFMEA）・未然防止（予防）の思想

## 出典
- [Wikipedia, “Failure mode and effects analysis”（起源＝MIL-P-1629/NASA/自動車AIAG・故障モードと影響の分析・RPN＝S×O×D・DFMEA/PFMEA の概説）](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) `リファレンス`
- [American Society for Quality (ASQ) — Failure Mode and Effects Analysis (FMEA)（手順・severity/occurrence/detection・RPN・未然防止の解説）](https://asq.org/quality-resources/fmea) `リファレンス`

## 関連概念
- [[mgmt-pdca-cycle|PDCAサイクル]] — 出典を共有
- [[mgmt-quality-function-deployment|品質機能展開（QFD・品質の家／Quality Function Deployment）——顧客の声を技術特性へ翻訳する品質計画手法]] — 出典を共有
- [[mgmt-six-sigma|シックス・シグマ]] — 出典を共有
- [[agile-development|アジャイルソフトウェア開発]] — 同分野の近傍
- [[mgmt-360-feedback|360度フィードバック（多面評価）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
