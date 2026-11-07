---
collection: academic
id: human-fitts-law
category: "human-science"
category_ja: "人間科学"
title: "フィッツの法則——速さと正確さのトレードオフ"
as_of: "2026-06-27"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/human-science
  - knowledge/verified
aliases:
  - "フィッツの法則——速さと正確さのトレードオフ"
---

# フィッツの法則——速さと正確さのトレードオフ

> [!info] コレクション: [[学術概念]] ・ 区分: 人間科学 ・ asOf: 2026-06-27 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
フィッツの法則（Fitts's law）は、心理学者ポール・フィッツが1954年の論文「運動の振幅を制御する人間の運動系の情報容量」（Journal of Experimental Psychology）で定式化した、認知心理学・人間工学の基本法則で、ある目標に向けて素早く手を動かして到達するのにかかる時間（運動時間）が、目標までの距離と目標の大きさによってどう決まるかを定量的に表す。目標までの距離を D、目標の幅（許される誤差）を W とすると、運動時間 MT は「a＋b×log2（2D／W）」という式で表される。この log2（2D／W）は「困難度指数（index of difficulty）」と呼ばれ、ビットを単位とする。目標が遠いほど、また小さいほど、課題は難しく、到達に時間がかかる。法則の核心は、速さと正確さのあいだの根本的なトレードオフを表す点にある。速く動かせば正確さは落ち、正確に狙えば遅くなる。フィッツは、シャノンの情報理論にならい、人間の運動系を、毎秒あたり一定の情報量しか伝えられない「情報チャネル」として捉えた。式が対数の形をとることは重要で、距離を二倍にしても、また目標を半分の大きさにしても、運動時間は二倍になるのではなく、一定量だけ増える。この関係は、腕でも指でも、また水中でも、幅広い条件で頑健に成り立つ。フィッツの法則は、人間工学に始まり、とりわけヒューマン・コンピュータ・インタラクション（HCI）の設計で中心的な役割を果たす。マウスやタッチ操作で対象に到達する時間を予測し、ボタンは大きく近くに置くほど速い（画面の端や隅は一方向に「無限に大きい」標的なので素早く狙える）こと、メニュー設計の最適化などに応用される。スコット・マッケンジーはこれをシャノンの形式に整え、UI設計の実用的な指標とした。選択肢の数と反応時間を結ぶヒックの法則と並ぶ、人間行動の定量的法則である。

## 提唱者・初出
ポール・フィッツ ／ クロード・シャノン ／ スコット・マッケンジー ／ スチュアート・カード

## 出典
- [Fitts, P. M. (1954) The Information Capacity of the Human Motor System in Controlling the Amplitude of Movement — Journal of Experimental Psychology, 47(6), 381–391](https://doi.org/10.1037/h0055392) `学術`
- [Wikipedia: Fitts's law — MT = a + b·log2(2D/W), index of difficulty (bits), speed–accuracy tradeoff, HCI target acquisition](https://en.wikipedia.org/wiki/Fitts%27s_law) `リファレンス`

## 関連概念
- [[human-hick-law|ヒックの法則——選択肢が増えるほど決定に時間がかかる]] — 語彙が近い
- [[infosoc-information-theory|情報理論（シャノン）]] — 同じ思想家
- [[infosoc-information-foraging|情報採餌理論（インフォメーション・フォージング）]] — 同じ思想家
- [[econ-theil-index-inequality|タイル指数——情報理論にもとづく分解可能な不平等尺度]] — 同じ思想家
- [[human-simon-effect|サイモン効果——刺激の位置が無関係でも反応に影響する]] — 同じ思想家
- [[mgmt-organizational-citizenship-organ|組織市民行動——報酬制度に明示されない自発的貢献が組織を機能させる]] — 同じ思想家
- [[human-above-average-effect|平均以上効果（優越の錯覚）]] — 同分野の近傍

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
