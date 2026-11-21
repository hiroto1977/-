import type { FetchContext } from './types';

/**
 * 品質ダッシュボード — Service Hub の品質指標サービス (snapshot 専用)。
 *
 * 通常の業務サービスではなく、メタ情報 (ユニットテスト件数 / Mutation
 * スコア / レビューラウンド履歴 / CI 状況 / standalone HTML サイズ等)
 * を 1 画面で可視化する。
 *
 * データソースは現状ハードコード snapshot。将来は `npm run quality:report`
 * (scripts/quality-report.cjs) の JSON を読み込んで動的更新する想定。
 * その時点で fetcher を実装に切り替える — 現在は LOCAL_SERVICES 扱いで
 * トークン不要、SNAPSHOT を直接描画。
 */

export interface ReviewRound {
  readonly pr: number;
  readonly round: number;
  readonly verdict: '要修正' | 'マージ可' | 'マージ推奨';
  readonly blocking: number;
  readonly shouldFix: number;
  readonly nit: number;
}

export interface QualitySnapshot {
  readonly unitTests: {
    readonly staticCount: number;
    readonly runtimeCount: number;
  };
  readonly mutation: {
    readonly score: number;
    readonly mutateModules: number;
    readonly killed: number;
    readonly threshold: number;
  };
  readonly verifications: ReadonlyArray<{ readonly name: string; readonly status: 'pass' | 'fail' }>;
  readonly reviewHistory: ReadonlyArray<ReviewRound>;
  readonly artifactSizes: {
    readonly standaloneHtmlKb: number;
    readonly electronMainKb: number;
  };
  readonly latestCommit: string;
}

// Stryker disable all
const STUB: QualitySnapshot = {
  unitTests: { staticCount: 0, runtimeCount: 0 },
  mutation: { score: 0, mutateModules: 0, killed: 0, threshold: 99.8 },
  verifications: [],
  reviewHistory: [],
  artifactSizes: { standaloneHtmlKb: 0, electronMainKb: 0 },
  latestCommit: '',
};
// Stryker restore all

export async function fetchQualitySnapshotImpl(_ctx: FetchContext): Promise<QualitySnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchQualitySnapshot(ctx: FetchContext): Promise<QualitySnapshot> {
  return fetchQualitySnapshotImpl(ctx);
}
