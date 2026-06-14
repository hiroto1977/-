---
title: 並列オーケストレーション・ループ
type: methodology
tags:
  - methodology
  - orchestration
---

# 並列オーケストレーション・ループ

知識ベースを拡張する際に確立した、並列調査 → 検証 → 反映の運用ループ。

## バッチ手順（1バッチ＝6概念）
1. 既存タイトルを grep し、重複しない概念を 5 ディシプリン横断で選定（dedup）。
2. **6 並列の調査エージェント**を起動（各概念1体）。各エージェントは独立に出典を突合し、確認できた事実のみを返す。
3. 全6件の確認が揃うまで保留（partial で書かない）。
4. `VERIFIED_CONCEPTS` へ追記（出典タイプを4値へ正規化、URL を正規形へ）。docs の一覧表も更新。
5. 全ゲート（typecheck / verify:all / lint / build:web / vault:check）green を確認。
6. コミット → push → ドラフト PR を作成。
7. CI green を確認後マージ → main 同期 → 次バッチへ。

## 役割分担（registry.json の組織）
- CEO（人間）→ COO（Claude 本体・オーケストレーター）→ 役員（CFO/CHRO/CSO/CIO/CQO）→ 秘書室 → 管理職 → 一般職（並列 Agent）。
- 調査・設計は **read-only の並列 Agent**、実装は COO が直列で、品質ゲートは CQO 配下が担う（役割分離）。

## 関連
- [[Home]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[research-discipline|研究ディシプリン]]
