# プロジェクト計画書 — Service Hub

| 項目 | 内容 |
|---|---|
| ドキュメント | プロジェクト計画書 (Project Plan) |
| 対象 | 開発フェーズ・WBS・スケジュール・体制・リスク・品質計画 |
| 関連 | [要件定義書](./01_REQUIREMENTS.md) / [基本設計書](./02_BASIC_DESIGN.md) / [詳細設計書](./03_DETAILED_DESIGN.md) |

> 本書は現行ブランチ `claude/claude-md-docs-qqUAT` 時点の到達状況を起点に、確定済みフェーズと
> 今後 (Phase 6+) を計画として記述する。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|---|---|
| 目的 | 62 サービスを統合する業務ダッシュボードを 2 ターゲット (Electron / ブラウザ単体) で提供 |
| 成果物 | デスクトップアプリ / `dist/standalone.html` (約 550 KB) / 設計文書群 |
| 開発手法 | トランクベース + 短命フィーチャーブランチ。CI ゲート green を merge 条件とする |
| 技術 | TypeScript / React 18 / Electron 33 / Vite / Vitest / Stryker / Node 22 |

---

## 2. フェーズと到達状況

| Phase | 内容 | 状態 |
|---|---|---|
| 0 基盤 | 3 プロセスモデル / SoT / preload bridge / CI 3 ジョブ | ✅ 完了 |
| 1 サービス拡充 | scaffold で 62 サービス、snapshot/live、stub 集約 | ✅ 完了 |
| 2 セキュリティ | safeStorage / WebCrypto Vault / OAuth PKCE / 自動ロック | ✅ 完了 |
| 3 業務支援 | KPI / 経営サマリー / テンプレート / チームレーダー | ✅ 完了 |
| 4 品質強化 | verify:all / lint 群 / Stryker mutation / property test | ✅ 完了 |
| 5 税務エンジン | 所得税/住民税/消費税/控除/税額控除/退職所得 + 制度カタログ | ✅ 完了 |
| 6 拡張 | 一時所得・譲渡所得、live fetcher の実装拡大、UI/UX 改善 | ⬜ 計画 |

---

## 3. WBS (Work Breakdown Structure)

```
1. サービス基盤
   1.1 SoT (serviceId) と派生マップの不変条件
   1.2 useServiceData (snapshot↔live)
   1.3 scaffold ツール
2. 認証・秘密情報
   2.1 Electron safeStorage / 2.2 WebCrypto Vault / 2.3 OAuth PKCE / 2.4 自動ロック
3. 業務支援
   3.1 KPI / 3.2 経営サマリー / 3.3 テンプレート・ライブラリ
4. 税務 (Phase 5)
   4.1 所得税・住民税・消費税 (taxCalc)
   4.2 所得控除 10 種 (taxDeductions)
   4.3 税額控除 (taxCredits)
   4.4 退職所得 (taxRetirement)
   4.5 税務ページ UI + 免責 + 公式導線
5. 品質
   5.1 typecheck / 5.2 vitest / 5.3 ESLint / 5.4 verify:all / 5.5 Stryker
6. ドキュメント
   6.1 ARCHITECTURE / 6.2 設計文書群 (本 specs/) / 6.3 SESSION_HANDOFF
```

---

## 4. マイルストーン

| MS | 内容 | 判定基準 |
|---|---|---|
| M1 | 基盤確立 | CI 3 ジョブ green / 62 サービス表示 |
| M2 | セキュリティ完成 | Vault/OAuth テスト pass、`lint:forbidden` green |
| M3 | 税務エンジン完成 | 速算表・控除の境界値テスト pass、mutation 100% |
| M4 | 文書整備 | 要件/基本/詳細/計画 4 文書、`lint:docs`/`verify:arch` green |
| M5 (Phase 6) | 拡張機能 | 追加要件の受け入れ基準を満たす |

---

## 5. 体制 (Claude Code セッション運用)

| 役割 | 担当 | 責務 |
|---|---|---|
| 実装 | Claude Code セッション | フィーチャーブランチで開発・テスト |
| 品質ゲート | CI (GitHub Actions) | quality / test / build を自動判定 |
| レビュー | Copilot / 人手 | PR レビュー、設計判断の確認 |
| 引継ぎ | `SESSION_HANDOFF.md` | セッション間の状態・罠・残作業の共有 |

> セッション運用の鉄則: **コミット前に必ず全ゲート (typecheck / test / lint / verify:all / build:web) の
> green を確認**してからコミットする (過去に未確認コミットで CI 赤を量産した教訓)。

---

## 6. 開発プロセスと品質計画

### 6.1 ブランチ・PR
- 開発は `claude/**` フィーチャーブランチ。既定ブランチは `main`。
- push 後はドラフト PR を作成。CI 3 ジョブが success で merge 可。

### 6.2 品質ゲート (merge 条件)
| ゲート | コマンド | 内容 |
|---|---|---|
| 型 | `npm run typecheck` | tsc project references |
| テスト | `npm test` | vitest 全 pass + カバレッジ |
| Lint | `npm run lint` | ESLint 9 flat config |
| アーキ整合 | `npm run verify:arch` | file:line + メトリクス照合 |
| 禁止/境界/文書/網羅 | `npm run lint:forbidden/imports/docs/test-coverage` | カスタムゲート |
| 変異 | `npm run mutate` | Stryker ≥ 99.8% |
| ビルド | `npm run build:web` | standalone.html 生成確認 |

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 税制改正で計算が陳腐化 | 試算値の誤り | 年度パラメータを定数化し改正時に更新。免責で「概算」を明示 |
| 税理士法・法令抵触 | 法的リスク | 自動申告/個別助言/「否認されない」保証を**しない** (Non-Goal を厳守) |
| 未確認コミットで CI 赤 | 手戻り | コミット前に全ゲート確認を必須化 (体制の鉄則) |
| ファイル分割で mutation 帰属が外れる | スコア低下 | business.ts 分割は撤退済み。分割時は mutation 再計測 |
| 外部 API 仕様変更 | live fetch 失敗 | snapshot フォールバック + `errorKind` 分類で耐性確保 |
| ブラウザ版の CORS | API 取得不可 | BYO Cloudflare Worker プロキシで回避 |
| 秘密情報漏洩 | 重大 | renderer に渡さない / AES-GCM-256 / extractable:false / 自動ロック |

---

## 8. 今後の計画 (Phase 6+)

| 項目 | 概要 |
|---|---|
| 税務拡張 | 一時所得・譲渡所得 (申告分離) の計算 (要方針確認, FR-TAX-09) |
| live fetcher 拡大 | snapshot stub のサービスを実 API 読み取りへ段階移行 |
| mutation 対象拡大 | 税務モジュールを Stryker mutate 配列へ再追加 (clean CI 時) |
| UI/UX | アクセシビリティ・キーボード操作・多言語化の検討 |

---

## 9. 完了の定義 (Definition of Done)

1. 対象機能のユニットテスト + 境界値テストが pass。
2. `npm run verify:all` / `npm test` / `npm run build:web` が green。
3. 関連ドキュメント (ARCHITECTURE / 本 specs) を更新し `lint:docs`/`verify:arch` green。
4. 税務・投資系画面に免責が表示される。
5. ドラフト PR を作成し CI 3 ジョブが success。
