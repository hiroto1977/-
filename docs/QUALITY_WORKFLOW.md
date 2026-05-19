# テスト精度を継続的に高める仕組み

このリポジトリには「テストが本当にバグを検出できるか」を 4 つの角度から
測定する仕組みが組み込まれています。新機能を追加するたびに、または週次の
タイミングで以下を回すことで、テストの劣化を早期に検知できます。

## 4 つの測定軸

| 軸 | 何を測る | ツール | 頻度 |
|---|---|---|---|
| **1. 合格テスト数** | 仕様への形式適合 | Vitest | 毎 PR + 毎 push |
| **2. カバレッジ** | テストが触れた行・分岐 | `@vitest/coverage-v8` | 毎 PR |
| **3. Property-based fuzz** | 任意入力でクラッシュしないこと、不変条件保持 | `fast-check` | 通常テストに混在 |
| **4. Mutation score** | テストが**実際にバグを検出できる**か | Stryker | 週次 + 手動 |

カバレッジが高くても mutation score が低ければ「テストはコードを通って
いるが assertion が弱い」という意味。両方測ることで真の精度が分かる。

## コマンド一覧

| コマンド | 用途 | 所要 |
|---|---|---|
| `npm test` | 全テスト実行 | ~2s |
| `npm run test:watch` | 監視モード（開発中）| - |
| `npm run test:cov` | カバレッジ計測 | ~3s |
| `npm run test:property` | property test のみ実行 | ~1s |
| `npm run mutate` | mutation testing | ~2 分 |
| `npm run mutate:triage` | 直近の mutation report から殺すべき mutant を Markdown 出力 | < 1s |
| `npm run mutate:triage -- --file=src/main/clients/security.ts` | 特定ファイルだけ triage | - |
| `npm run mutate:triage -- --top=50` | 上位 50 件 | - |
| `npm run mutate:triage -- --include-string-literals` | 設定値の文字列 mutation も含む（通常は除外）| - |
| `npm run quality` | typecheck + test + coverage を一気通貫 | ~5s |
| `npm run quality:report` | `docs/QUALITY.md` を最新化（mutation report があれば含む）| 数秒 |

## いつどれを回すか（推奨運用）

### 機能追加 / バグ修正の PR を出すとき

```bash
npm run quality        # typecheck + test + coverage が緑か
npm run quality:report # docs/QUALITY.md を更新してコミットに含める
```

CI (`.github/workflows/ci.yml`) も上記のうち typecheck + test + coverage を
毎 PR で実行する。 PR が成立する条件として用いる。

### サービス追加 / fetcher を書き換えたとき

通常の `npm run quality` に加えて、影響範囲の mutation testing:

```bash
npm run mutate
npm run mutate:triage           # トップ 20 個の高優先度 survivor を確認
# 必要に応じてテストを追加して再実行
```

Stryker は `incremental: true` に設定済みなので、変更箇所だけ
mutation を再実行する。

### 定期的に（週次）

`.github/workflows/mutation.yml` が **毎週月曜 03:00 JST** に mutation
testing を自動実行。Stryker の incremental cache はブランチ別にキャッシュ
されるので 2 回目以降は速い。

PR から手動でも `Actions → mutation → Run workflow` でトリガ可能。

## しきい値ポリシー

`stryker.config.json` で定義:

```json
"thresholds": { "high": 90, "low": 60, "break": 50 }
```

- `break: 50` — mutation score が 50% を切ったら CI が **失敗する**
- `low: 60` — 60% 未満は警告
- `high: 90` — 90% 以上が理想

OAuth など設定データを含むファイルは構造上 100% は達成しづらいので、
全体目標は **60-75%** が現実的な落とし所。

カバレッジについては明示しきい値は設定していない（プロジェクトの段階で
適切な値が変わるため）。目安: `src/main/clients/*` で **80% 以上**。

## triage の読み方

`npm run mutate:triage` の出力例:

```
| score | file       | line | mutator              | replacement     |
|------:|------------|-----:|----------------------|-----------------|
|    10 | gmail.ts   |   95 | LogicalOperator      | `!to && !subject` |
|    10 | atlassian  |   37 | ConditionalExpression| `false`         |
|     9 | security   |   91 | NullishCoalescing    | `[]`           |
```

各列の意味:

- **score**: 殺す優先度。10 = 条件分岐 / 論理演算子（実 logic）、2 =
  StringLiteral（設定データ）
- **mutator**: Stryker が適用した変異の種類
- **replacement**: 元のコードがこの値に置き換わったが、テストはそれを検出
  できなかった

殺し方の典型パターン:

| mutator | 殺し方 |
|---|---|
| LogicalOperator (`\|\|` → `&&`) | 「片方だけ falsy のケース」を別テストにする |
| ConditionalExpression (`true` / `false` 化) | 元の分岐の **両方の枝** をアサート |
| OptionalChaining (`?.` 削除) | チェーン途中が undefined のケースを追加 |
| NullishCoalescing (`??` 削除) | デフォルト値が**実際に返ること**を `.toBe(default)` |
| StringLiteral (URL 変更) | 完全一致 `expect(url).toBe('...')` — 通常スルー |

## アーキテクチャ詳細

```
[npm run quality:report]
        │
        ├── npm run typecheck       ←  CI と同じ
        ├── npm test                ←  CI と同じ
        ├── npm run test:cov        ←  coverage/coverage-summary.json
        └── reports/mutation/mutation.json (あれば)
                          │
                          ▼
                docs/QUALITY.md (上書き)
                          │
                          ▼
                     git diff で
                     精度のトレンドが可視化される
```

`docs/QUALITY.md` を毎回コミットすれば、リポジトリ履歴自体が品質メトリクス
ログになる。改善が悪化したコミットを git blame で特定可能。

## 既知の制約

- **Stryker は OAuth の loopback サーバ / shell.openExternal をテストでき
  ない**。ピュア関数（`buildAuthorizeUrl`, `generatePkce` 等）は property
  test と例ベーステストの両方で網羅済み。
- **main.ts / secrets.ts は Electron 依存**。 `electron` を mock しても本物の
  振る舞いと乖離するので mutation 対象から外している。
- mutation testing は **CPU 時間がそれなりにかかる**（このプロジェクトで ~2 分、
  小さい変更なら incremental で ~30s）。 PR 毎には回さず、週次 + 手動で。
