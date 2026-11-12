import type { FetchContext } from './types';

/**
 * Obsidian — ローカル知識ベース (Vault) の可視化 (snapshot 専用)。
 *
 * Obsidian の Vault はローカルの Markdown ファイル群であり、クラウド API を
 * 持たない。本サービスは「Vault を Git (GitHub) でバージョン管理し、
 * セキュリティ (暗号化・署名) と業務効率化 (テンプレート・デイリーノート)
 * を仕組み化する」という運用を 1 画面で可視化する。
 *
 * 実 Vault 統計 (ノート数 / タグ / git status) は Electron main プロセスで
 * `fs` API 経由で取得する Phase 6 で実装予定。本 fetcher はそれまで static
 * stub を返し、表示用の実データは renderer の SNAPSHOT.obsidian が保持する。
 * セットアップ手順は docs/OBSIDIAN_DOCKER_SETUP.md を参照。
 */

export interface ObsidianNote {
  readonly id: string;
  readonly title: string;
  readonly folder: string;
  readonly tags: ReadonlyArray<string>;
  readonly updatedIso: string;
  readonly words: number;
}

export interface ObsidianSecurityCheck {
  readonly id: string;
  readonly item: string;
  /** ok = 達成 / warn = 要注意 / action = 要対応 */
  readonly status: 'ok' | 'warn' | 'action';
  readonly detail: string;
}

export interface ObsidianWorkflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** スクリプト/プラグインで自動化済みか (業務効率化の仕組み化) */
  readonly automated: boolean;
}

export interface ObsidianSnapshot {
  readonly vault: {
    readonly name: string;
    readonly path: string;
    readonly noteCount: number;
    readonly totalWords: number;
    /** Vault をバックアップする GitHub リモート (空文字 = 未連携) */
    readonly gitRemote: string;
    readonly lastSyncIso: string;
    /** Vault が保存時に暗号化されているか */
    readonly encrypted: boolean;
  };
  readonly notes: ReadonlyArray<ObsidianNote>;
  readonly security: ReadonlyArray<ObsidianSecurityCheck>;
  readonly workflows: ReadonlyArray<ObsidianWorkflow>;
}

// Stryker disable next-line all
const STUB: ObsidianSnapshot = {
  vault: {
    name: '',
    path: '',
    noteCount: 0,
    totalWords: 0,
    gitRemote: '',
    lastSyncIso: '',
    encrypted: false,
  },
  notes: [],
  security: [],
  workflows: [],
};

export async function fetchObsidianSnapshotImpl(_ctx: FetchContext): Promise<ObsidianSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchObsidianSnapshot(ctx: FetchContext): Promise<ObsidianSnapshot> {
  return fetchObsidianSnapshotImpl(ctx);
}
