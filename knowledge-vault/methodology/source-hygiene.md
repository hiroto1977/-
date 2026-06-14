---
title: 出典衛生（正規化ルール）
type: methodology
tags:
  - methodology
  - sources
---

# 出典衛生（正規化ルール）

出典の品質と再現性を保つために適用している正規化ルール。

## URL 正規化
- e-Gov 法令検索は正準形 `https://laws.e-gov.go.jp/law/<LAWID>` を用いる（API 形式・旧 elaws 形式・hourei.net 等は使わない）。
  - 例: 民法 `129AC0000000089`／会社法 `417AC0000000086`／不正競争防止法 `405AC0000000047`／著作権法 `345AC0000000048`／特定商取引法 `351AC0000000057`／意匠法 `334AC0000000125`。
- 低品質なアグリゲータ（例: 引用転載のみのサイト）は採用しない。原典・一次資料・権威ある二次資料を優先。

## 出典タイプの正規化（4値へ）
調査エージェントの自由記述ラベルを `academic | reference | government | media` のいずれかへ写像する。
- 査読・大学・学会 → `academic`／百科事典・Wikipedia・Britannica・EBSCO → `reference`／公的機関・一次法令・NobelPrize.org・EUR-Lex → `government`／HBR・法律事務所・解説記事 → `media`。

## 自己修正の尊重
- エージェントの自己修正（年・条番号・版の訂正）はそのまま反映する（捏造しない）。
- 異常な URL・撤回された主張は落とす／注記する。

## 関連
- [[Home]]
- [[research-discipline|研究ディシプリン]]
