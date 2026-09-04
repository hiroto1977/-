import type { FetchContext } from './types';

/**
 * Docker — ローカルコンテナ基盤の可視化 (snapshot 専用)。
 *
 * Docker Engine の状態 (コンテナ / イメージ)、イメージ脆弱性スキャン結果、
 * GitHub 連携 (GHCR レジストリ / GitHub Actions でのビルド)、開発環境の
 * 業務効率化 (compose スタック) を 1 画面で可視化する。
 *
 * 実 Engine 統計は Electron main プロセスで Docker Engine API
 * (`/var/run/docker.sock`) 経由で取得する Phase 6 で実装予定。本 fetcher
 * はそれまで static stub を返し、表示用の実データは renderer の
 * SNAPSHOT.docker が保持する。セットアップ・セキュリティ強化手順は
 * docs/OBSIDIAN_DOCKER_SETUP.md を参照。
 */

export interface DockerContainer {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly status: 'running' | 'exited' | 'paused';
  readonly cpuPct: number;
  readonly memMb: number;
  readonly ports: string;
}

export interface DockerImage {
  readonly id: string;
  readonly repo: string;
  readonly tag: string;
  readonly sizeMb: number;
  /** Trivy 等によるイメージ脆弱性スキャン結果 (深刻度別件数) */
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  /** 取得元 (例: GHCR / Docker Hub / local build) */
  readonly source: string;
}

export interface DockerSecurityCheck {
  readonly id: string;
  readonly item: string;
  /** ok = 達成 / warn = 要注意 / action = 要対応 */
  readonly status: 'ok' | 'warn' | 'action';
  readonly detail: string;
}

export interface DockerWorkflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** compose / スクリプトで自動化済みか (業務効率化の仕組み化) */
  readonly automated: boolean;
}

export interface DockerSnapshot {
  readonly engine: {
    readonly version: string;
    readonly containersRunning: number;
    readonly containersTotal: number;
    readonly images: number;
    /** rootless モードで稼働しているか (権限分離) */
    readonly rootless: boolean;
    /** GHCR (GitHub Container Registry) と連携済みか */
    readonly ghcrLinked: boolean;
  };
  readonly containers: ReadonlyArray<DockerContainer>;
  readonly images: ReadonlyArray<DockerImage>;
  readonly security: ReadonlyArray<DockerSecurityCheck>;
  readonly workflows: ReadonlyArray<DockerWorkflow>;
}

// Stryker disable next-line all
const STUB: DockerSnapshot = {
  engine: {
    version: '',
    containersRunning: 0,
    containersTotal: 0,
    images: 0,
    rootless: false,
    ghcrLinked: false,
  },
  containers: [],
  images: [],
  security: [],
  workflows: [],
};

export async function fetchDockerSnapshotImpl(_ctx: FetchContext): Promise<DockerSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchDockerSnapshot(ctx: FetchContext): Promise<DockerSnapshot> {
  return fetchDockerSnapshotImpl(ctx);
}
