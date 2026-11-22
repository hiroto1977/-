import { jsonFetch, type FetchContext } from './types';
import { fetchQualitySnapshotWith, type QualitySnapshot } from '../../shared/api/quality';

/**
 * 品質ダッシュボード — デスクトップ版の入口。**読み取りだけ** (2026-11-21)。
 *
 * このリポジトリ自身 (`hiroto1977/-`) の品質状態を GitHub API から読む:
 * 最新コミット、CI / 変異検査の最新実行、テストファイル数、PR 件数と
 * レビュー状態。それに `docs/QUALITY.md` の実測値 (mutation スコア・
 * passing 数・coverage、生成時点つき) を重ねる。
 * **判定と正規化は `src/shared/api/quality.ts` に置いてある** —— ブラウザ版は
 * 利用者のプロキシ経由で同じモジュールを呼ぶ。ここに残しているのは
 * 「main の `jsonFetch` を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に
 * 追随しない・失敗文の伏字)。使う照会はどれも封筒がオブジェクトの応答だけ
 * —— 一覧が配列で返る pulls / reviews は使わず、件数は Search API の
 * `total_count` で取る (理由は `shared/api/quality.ts` の冒頭)。
 *
 * 2026-11-20 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.quality === 'sample'`)。見本には手書きのテスト
 * 件数・レビュー深刻度内訳・成果物サイズなど、裏付けのない数字が
 * 実測のように並んでいたので、読めるものだけを読む形に置き換えた。
 * トークンは GitHub の PAT (このリポジトリの読み取り) で、利用者が
 * Vault に登録する (`github` サービスのスロットとは別)。
 */

export type { QualitySnapshot, QualityReport, QualityWorkflowRun } from '../../shared/api/quality';

export async function fetchQualitySnapshot(ctx: FetchContext): Promise<QualitySnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'quality' };
  return fetchQualitySnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
