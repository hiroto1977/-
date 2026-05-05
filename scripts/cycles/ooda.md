# OODA サイクル定義 (異常事態 / インシデント)

## 0. 起動条件 (どれか 1 つ)
- `bash scripts/preflight.sh` が exit ≥ 1 (要対処項目)
- `bash scripts/audit-verify.sh` が exit 1 (改竄疑い)
- pre-commit hook が PII または gitleaks で commit 阻止
- `storage-health.sh --json` の `overall_issues` ≥ 4
- ブラウザの `chat.error` が連続発生 (audit log)
- ユーザーからの緊急 通報

**目標**: 検出から最初の Act まで **60 秒以内**。

## 1. Observe (≤ 15 秒)

### アクション
1. 検出元と症状を audit log に記録
   ```bash
   bash scripts/orchestrate.sh --emit incident.detected "trigger=<src> symptom=<short>"
   ```
2. 直近の audit.jsonl を 50 行 表示 (横断的な兆候を見る)
   ```bash
   bash scripts/orchestrate.sh --board --tail 50
   ```

### 出口条件
- `incident.detected` イベントが板にある
- 何が起きているかを 1 文で言える

## 2. Orient (≤ 15 秒)

### アクション (α1 + δ1 共同)
- **08_ATTACK_CATALOG** の どのシナリオか (該当なし も明示)
- **02_DATA_CLASSIFICATION** の どのクラスが影響を受けるか
- 既存 **INV-1〜INV-10** のどれを破った可能性があるか
- 影響範囲: ローカルのみ / GitHub / 他端末

### 出口条件
- 板に `incident.oriented` (`scenario=`, `class=`, `inv=`)

## 3. Decide (≤ 15 秒)

### アクション
- **09_INCIDENT_PLAYBOOK** の該当 シナリオを引く
- なければ「最も近いシナリオ + 差分」を即興で組む
- 60 秒対応 ステップを 3 つ以下に削る (やる事を減らす方が速い)

### 出口条件
- 板に `incident.decided` (`playbook=`, `steps=N`)

## 4. Act (≤ 15 秒で着手)

### アクション (チーム並列)
- **β3 (実装)**: 緊急修正コード (例: hook を強化、ステージから秘密値を除去)
- **γ3 (品質)**: 再発防止テストを並走で書く
- **δ3 (運用)**: IR 報告書 ドラフト (templates/crisis/* を活用)
- **α3 (アーキ)**: 失敗モードに追加 (`governance/12 §5`)

### 出口条件
- 急性対応 (緊急修正) が走り始めている
- 板に `incident.contained` または `incident.escalated`

## 5. ループ (Observe に戻る)

### 戻る条件
- 拡大被害の兆候 (新たな chat.error、storage 急減 等)
- Act 後 5 分間で再評価

### 抜ける条件
- 板に `incident.resolved`
- 5 分間 新症状なし
- preflight が再度 通る

## 6. OODA → PDCA 遷移

急性対応が落ち着いたら **次の PDCA Plan** に以下を必ず積む:

1. **根本原因の修正** (急性対応はパッチ、根本原因は別 issue)
2. **検出の改善** (なぜ気づくのが遅れたか)
3. **再発テスト** (同じ攻撃を blunt するテスト)

α1 が次のサイクルの Plan に「P0 (最高優先)」として登録。

## 7. 想定 シナリオ (代表例)

| 検出 | Orient | Decide | Act |
|---|---|---|---|
| pre-commit が PII 阻止 | INV-6 が機能、ファイル直前で発覚 | `pii-scan` 出力を確認、人間に「修正 or --no-verify か」 | 開発者が判断、修正なら commit を中断 |
| audit-verify exit 1 | INV-2/INV-10 違反、改竄疑い | `09 §IR-3` 改竄ログ調査 | 影響範囲を 60 秒で出し、別端末から audit-export.sh のバックアップで verify |
| storage-health overall_issues=5 | 単体ハード故障 vs ランサム vs 単純な使い過ぎ | `09 §IR-4` ランサム チェック (read-only マウント, 拡張子) | ランサム なら即ネットワーク切断、`storage-cleanup --restore` 経路は使わない (汚染懸念) |
| chat.error が 5 連続 | クラウド AI 障害 vs CORS / OLLAMA_ORIGINS 失効 | dashboard.js の preflight 結果と突合 | ローカル Ollama にフォールバック (settings.localOnly=true) |

## 8. 60 秒対応の心得 (CLAUDE.md ルールとも整合)

- **短期間に多すぎる選択肢は持たない** (3 ステップで切る)
- **--no-verify などの破壊的回避は人間承認** (CLAUDE.md ルール)
- **不明点は audit に残してから動く** (後追い可能性を担保)
- **冪等な操作を優先** (再実行で副作用が増えない)
