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
- e-Gov 法令検索は正準形 `https://laws.e-gov.go.jp/law/<LAWID>` を用いる（API 形式・旧 elaws 形式は使わない）。
- 補助金・制度は `.go.jp` / 公式実施機関を優先。低品質なアグリゲータは採用しない。

## 出典タイプの正規化
- 自由記述ラベルを `academic | reference | government | municipality | operator | media | other` のいずれかへ写像する。

## 自己修正の尊重
- エージェントの自己修正（年・条番号・版の訂正）はそのまま反映する（捏造しない）。
- 異常な URL・撤回された主張は落とす／注記する。

## 関連
- [[Home]]
- [[research-discipline|確証ディシプリン]]
