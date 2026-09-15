---
collection: academic
id: infosoc-differential-privacy-dwork
category: "information-sociology"
category_ja: "情報社会学"
title: "差分プライバシー——個人1件の有無が出力をほぼ変えないことを数式で保証するプライバシーの数理的定義"
as_of: "2026-09"
source_count: 5
authoritative: true
tags:
  - collection/academic
  - academic/information-sociology
  - knowledge/verified
aliases:
  - "差分プライバシー——個人1件の有無が出力をほぼ変えないことを数式で保証するプライバシーの数理的定義"
---

# 差分プライバシー——個人1件の有無が出力をほぼ変えないことを数式で保証するプライバシーの数理的定義

> [!info] コレクション: [[学術概念]] ・ 区分: 情報社会学 ・ asOf: 2026-09 ・ 出典: 5件（うち権威ある出典 ✓）

## 概要
差分プライバシーは、ドワーク・マクシェリー・ニッシム・スミスの論文『Calibrating Noise to Sensitivity in Private Data Analysis』（TCC 2006）とドワーク単著『Differential Privacy』（ICALP 2006）で定式化された。1レコードのみ異なる隣接データベースD・D′と任意の出力集合Sについて、乱択機構MでM(D)がSに入る確率がM(D′)がSに入る確率のe^ε倍以下に収まるときε-差分プライバシーとし、クエリの最大変化量（大域的センシティビティ）に比例したラプラス雑音を加えて実現する。背景には、スウィーニーによる1990年代のマサチューセッツ州知事医療記録の再識別や、ナラヤナン＆シュマトフによる2008年Netflix Prizeデータの再匿名化など、k匿名化のような従来の匿名化を破る連結攻撃があった。ドワーク＆ロス（2014）は（ε,δ）-緩和・合成定理・プライバシー予算を整理し、米国センサス局は2020年国勢調査に採用したが小地域精度を理由にアラバマ州が2021年提訴、Appleは2016年から、GoogleはRAPPOR（2014）で端末内のローカル差分プライバシーを採用する一方、バンバウアーらは実データで無意味な結果を生むと批判し、εの値は技術でなく政策判断である点も限界とされる。顧客統計を公開する中小事業者には、匿名化を装うのでなくノイズ量とεを明示して説明責任を果たす設計指標となる。

## 提唱者・初出
シンシア・ドワーク（2006『Calibrating Noise to Sensitivity in Private Data Analysis』TCC／2006『Differential Privacy』ICALP／2014『The Algorithmic Foundations of Differential Privacy』ロスと共著）／フランク・マクシェリー＆コビ・ニッシム＆アダム・スミス（Calibrating Noise 共著・2017年ゲーデル賞共同受賞）／アーロン・ロス（2014 共著者）／対比: ラタニヤ・スウィーニー（k匿名化・1997年再識別実験）／アルビンド・ナラヤナン＆ヴィタリー・シュマトフ（2008 Netflix Prize 再匿名化）

## 出典
- [Dwork, C., McSherry, F., Nissim, K., Smith, A. (2006). "Calibrating Noise to Sensitivity in Private Data Analysis." Theory of Cryptography Conference (TCC 2006), Springer LNCS 3876, pp. 265–284 — ε-差分プライバシーの定義とラプラス機構（大域的センシティビティに比例した雑音付加）の初出典拠。2017年ゲーデル賞受賞論文](https://doi.org/10.1007/11681878_14) `学術`
- [Dwork, C. (2006). "Differential Privacy." ICALP 2006 (33rd International Colloquium, Venice), Springer LNCS 4052, pp. 1–12 — 「差分プライバシー」の命名と一般定式化の初出典拠](https://doi.org/10.1007/11787006_1) `学術`
- [Dwork, C., Roth, A. (2014). "The Algorithmic Foundations of Differential Privacy." Foundations and Trends in Theoretical Computer Science (now Publishers), 9(3–4), pp. 211–407 — (ε,δ)-差分プライバシーの緩和・合成定理・プライバシー予算の体系的整理](https://doi.org/10.1561/0400000042) `学術`
- [Narayanan, A., Shmatikov, V. (2008). "Robust De-anonymization of Large Sparse Datasets." Proceedings of the 2008 IEEE Symposium on Security and Privacy, pp. 111–125 — Netflix Prize データセットの再匿名化事例。従来型匿名化（k匿名化等）の限界を示した動機付けとなった研究](https://dl.acm.org/doi/10.1109/SP.2008.33) `学術`
- [U.S. Census Bureau. "Why the Census Bureau Chose Differential Privacy." 2020 Census Brief C2020BR-03 — 2020年米国国勢調査の開示回避システム（TopDown アルゴリズム）への差分プライバシー採用を示す一次資料](https://www2.census.gov/library/publications/decennial/2020/census-briefs/c2020br-03.pdf) `公的`

## 関連概念
- [[econ-diamond-water-paradox|価値の逆説（ダイヤモンドと水のパラドックス）]] — 同じ思想家
- [[econ-division-of-labour|分業]] — 同じ思想家
- [[econ-invisible-hand|見えざる手]] — 同じ思想家
- [[econ-bootleggers-baptists|密造者と聖職者（ブートレガーとバプテスト）]] — 同じ思想家
- [[econ-comparative-advantage|比較優位（リカードの比較生産費説）]] — 同じ思想家
- [[econ-supply-demand-equilibrium|需要と供給の均衡（価格メカニズム）]] — 同じ思想家
- [[econ-compensating-differentials-smith|補償賃金格差——労働の非金銭的な性質の差を埋め合わせる賃金の違い]] — 同じ思想家
- [[infosoc-technoculture|テクノカルチャー（技術文化研究）：技術と文化の相互構成論]] — 同じ思想家
- [[econ-absolute-advantage-smith|絶対優位論（アダム・スミス）と国際分業の原理]] — 同じ思想家
- [[econ-broken-window-fallacy-bastiat|割れ窓の誤謬（バスティア）——「見えるもの」と「見えざるもの」]] — 同じ思想家

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
