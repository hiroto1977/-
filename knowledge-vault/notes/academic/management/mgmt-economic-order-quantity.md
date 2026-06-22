---
collection: academic
id: mgmt-economic-order-quantity
category: "management"
category_ja: "経営学"
title: "経済的発注量モデル（Economic Order Quantity / EOQ）"
as_of: "2026-06"
source_count: 3
authoritative: true
tags:
  - collection/academic
  - academic/management
  - knowledge/verified
aliases:
  - "経済的発注量モデル（Economic Order Quantity / EOQ）"
---

# 経済的発注量モデル（Economic Order Quantity / EOQ）

> [!info] コレクション: [[学術概念]] ・ 区分: 経営学 ・ asOf: 2026-06 ・ 出典: 3件（うち権威ある出典 ✓）

## 概要
経済的発注量（Economic Order Quantity, EOQ）モデルとは、在庫管理において発注コストと在庫保管コストの合計を最小化する最適な1回当たりの発注量を求める数理モデルである。フォード・ウィットマン・ハリス（Ford Whitman Harris）が1913年の論文「一度にいくつの部品を作るべきか」（Factory, The Magazine of Management, Vol.10, No.2, pp.135-136, 152）で初めて定式化した。最適発注量の公式は Q* = √(2DS/H) であり、D=年間需要量、S=1回当たりの発注（段取）費用、H=単位当たり年間保管費用である。R.H.ウィルソン（R.H. Wilson）が1934年にHarvard Business Reviewで実務的適用法を発表し普及させたため「ウィルソン公式」とも呼ばれるが、原著者はハリスである（Erlenkotter 1990による再発見）。EOQモデルの前提条件は：需要率が一定かつ既知、発注費用が一定、保管費用が一定、即時補充（リードタイムゼロ）、数量割引なし、品切れ不許容の6つである。総費用曲線は最適点近傍で平坦であるため、最適値から20-30%の乖離でも総費用増加は数%に留まるという頑健性を持つ。拡張モデルには数量割引付きEOQ、経済的生産量（EPQ）、確率的需要モデル等がある。本モデルはオペレーションズ・リサーチおよびサプライチェーン管理の基礎的概念である。

## 提唱者・初出
フォード・W・ハリス（1913 Factory誌 — EOQ公式の初出）／R.H.ウィルソン（1934 HBR — 実務的普及）／ドナルド・アーレンコッター（1990 Operations Research — ハリスの優先権再発見）

## 出典
- [Wikipedia — Economic Order Quantity](https://en.wikipedia.org/wiki/Economic_order_quantity) `リファレンス`
- [Erlenkotter (1990) Ford Whitman Harris and the EOQ Model — Operations Research 38(6)](https://pubsonline.informs.org/doi/10.1287/opre.38.6.937) `学術`
- [Harris (1913/1990 reprint) How Many Parts to Make at Once — Operations Research 38(6)](https://pubsonline.informs.org/doi/10.1287/opre.38.6.947) `学術`

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
