---
title: 並列オーケストレーション・ループ
type: methodology
tags:
  - methodology
  - orchestration
---

# 並列オーケストレーション・ループ

知識ベースを拡張する際に確立した、並列調査 → 検証 → 反映の運用ループ。

## バッチ手順
1. 既存 id／タイトルを照合し、重複しない項目を選定（dedup）。
2. **並列の調査エージェント**を起動し、各項目を独立に出典突合。確認できた事実のみ返す。
3. 全件の確認が揃うまで保留（partial で書かない）。
4. データへ追記（出典タイプを正規化、URL を正準形へ）。
5. 全ゲート（typecheck / verify:all / lint / build:web / vault:check）green を確認。
6. コミット → push → ドラフト PR → CI green 後マージ → 次バッチ。

## 役割分担（registry.json の組織）
- CEO（人間）→ COO（Claude本体・オーケストレーター）→ 役員（CFO/CHRO/CSO/CIO/CQO）→ 秘書室 → 管理職 → 一般職（並列Agent）。
- 調査・設計は read-only の並列 Agent、実装は COO が直列、品質ゲートは CQO 配下（役割分離）。
- 各役職には [[AI_ORCHESTRATION_CONTEXT]] の知識ブリーフが注入される。

## 関連
- [[Home]]
- [[research-discipline|確証ディシプリン]]
