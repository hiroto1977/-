# PDCA サイクル定義

## 0. 起動条件
- 週次 (月曜 09:00 推奨)
- 「次の課題に着手したい」と人間が指示
- 前回サイクルが完了して 1 サイクル分の余裕あり

## 1. Plan (15 分)

### 入力
- `governance/12_SYSTEM_DESIGN.md` §10 の Open Issues
- `tests/smoke-test.sh` の最新結果
- 直近 audit.jsonl のエラー イベント

### アクション
1. **α1** が §10 の最高優先度 「未着手」課題を 1 つ選ぶ
   ```bash
   bash scripts/orchestrate.sh --emit team.alpha.1.scoped "issue=<N> priority=<H/M/L>"
   ```
2. **α1 → α2** に handoff
   ```bash
   bash scripts/orchestrate.sh --handoff alpha.1 alpha.2 "issue=<N>"
   ```
3. α2 が設計案 → α3 が `governance/12` を更新
4. **担当 ドメイン** を決定 (β=実装、γ=テスト、δ=文書) → 該当チームの 1 へ handoff

### 出口条件
- 設計案が `governance/12` に書かれた
- 担当チームが決まった
- 板に `handoff.alpha.*` が記録された

## 2. Do (1〜3 日)

### 入力
- α からの引き継ぎ
- 関連する INV と保証/制約

### アクション
1. 担当チームの 1 → 2 → 3 を順に実行
2. 実装 (β) なら必ずテストも追加 (γ と並列可)
3. 文書 (δ) なら必ず読み手の経路を確認

### 出口条件
- 該当ファイルが変更され、smoke-test が通る
- audit-verify が通る
- 板に `team.<X>.3.implemented` が記録された

## 3. Check (15 分)

### アクション
1. **γ4** が セキュリティ レビュー
   ```bash
   bash scripts/pii-scan.sh --staged
   bash scripts/audit-verify.sh
   bash tests/smoke-test.sh
   ```
2. **α4** が 設計レビュー (新 INV 整合)
3. **β4** が コード レビュー (スタイル / 危険コード)
4. 全員 通過なら次へ

### 出口条件
- 3 査読役 全部 `team.<X>.4.passed`

### 失敗時
- ブロック理由を板に書き、該当 役 (β3 や δ3) に差し戻し
- 修正後に再 Check

## 4. Act (5 分)

### アクション
1. **β4** が commit + push (PR が無ければ作成)
2. **α3** が `governance/12 §10` の該当課題を「実装済」へ更新
3. **δ3** が README / 関連文書を同期
4. 「次の Plan で何を選ぶか」を α1 が次サイクルに引き継ぎ

### 出口条件
- リモートに push 済
- §10 の状態が更新済
- 板に `pdca.cycle.complete` が記録された

## 5. 完遂の定義 (DoD)

| 項目 | 確認 |
|---|---|
| smoke-test 通過 | `bash tests/smoke-test.sh` exit 0 |
| audit-verify 通過 | `bash scripts/audit-verify.sh` exit 0 |
| INV 違反なし | 該当 INV のテスト pass |
| 設計図 更新 | `governance/12` の §10 が反映 |
| Snapshot 保存 | `design-iterations/v{N+1}.md` 存在 |
| commit + push | リモートで `gh pr view` で見える |

## 6. 想定 サイクル時間

通常: 1 課題 / 週
緊急: 1 課題 / 日 (OODA への切替を検討)
重課題: 2 週 (中間で `pdca.checkpoint` イベントを板に出す)
