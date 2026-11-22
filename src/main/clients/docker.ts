import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { FetchContext } from './types';

/**
 * Docker — ローカル Docker Engine の可視化 (Phase 6 で live 化)。
 *
 * 読み取りは Docker Engine API を unix socket 経由の HTTP で行う。
 * **docker CLI 等のサブプロセスは起動しない** — リポジトリの不変条件
 * (`src/main/clients/devEnv.ts`: 「ランタイムコードからのサブプロセス実行は
 * 禁止。devEnv の検査も exec ではなくファイル読取で組み立てる」) に従う。
 * 当初計画の「docker CLI」はこの不変条件と衝突するため socket 方式に読み替えた。
 *
 * - 接続先: `DOCKER_HOST` (unix:// / tcp://) → `/var/run/docker.sock` →
 *   `$XDG_RUNTIME_DIR/docker.sock` → `~/.docker/run/docker.sock` の順に探す。
 *   どれも無ければ Engine「未検出」として正直に返す (試した場所も明示)。
 * - 取得: `/version` `/info` `/containers/json?all=1` `/images/json` と、
 *   稼働中コンテナの `/containers/{id}/stats?stream=false` (上限あり)。
 * - 脆弱性件数は Engine API では取得できないため `null` (未スキャン) とし、
 *   ページ側は「—」と表示する。0 件と偽らない (storage の「測れない値は
 *   null」と同じ規律)。スキャン自体は docker scout / trivy の領分。
 *
 * 生 JSON の解釈 ({@link buildDockerSnapshot} と各 parse 関数) は純関数として
 * 分離し、socket 通信 ({@link readDockerEngine}) は薄く保つ。ブラウザ単体
 * ビルドには本クライアントはバンドルされず、web-shim が `not_implemented` を
 * 返す。セットアップ手順は docs/OBSIDIAN_DOCKER_SETUP.md を参照。
 */

export interface DockerContainer {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly status: 'running' | 'exited' | 'paused';
  readonly cpuPct: number;
  readonly memMb: number;
  /** 公開ポートの要約 (例: "8080:80, 5432:5432" / 無ければ "-") */
  readonly ports: string;
  readonly uptime: string;
}

export interface DockerImage {
  readonly id: string;
  readonly repo: string;
  readonly tag: string;
  readonly sizeMb: number;
  /**
   * 脆弱性件数。Engine API では取得できないため live では常に null
   * (未スキャン)。スキャン結果を取り込む経路ができたサービスだけが数を持つ。
   */
  readonly critical: number | null;
  readonly high: number | null;
  readonly medium: number | null;
  readonly low: number | null;
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
  /** スクリプト/プラグインで自動化済みか (業務効率化の仕組み化) */
  readonly automated: boolean;
}

export interface DockerSnapshot {
  readonly engine: {
    readonly version: string;
    readonly containersRunning: number;
    readonly containersTotal: number;
    readonly images: number;
    readonly rootless: boolean;
    /** GitHub Container Registry と連携しているか (GHCR イメージを保持) */
    readonly ghcrLinked: boolean;
  };
  readonly containers: ReadonlyArray<DockerContainer>;
  readonly images: ReadonlyArray<DockerImage>;
  readonly security: ReadonlyArray<DockerSecurityCheck>;
  readonly workflows: ReadonlyArray<DockerWorkflow>;
}

/** コンテナ 1 件分の stats 集計結果。 */
export interface ContainerStats {
  readonly cpuPct: number;
  readonly memMb: number;
}

/** buildDockerSnapshot への入力 (Engine API の生 JSON と集計済み stats)。 */
export interface RawDockerReadings {
  readonly found: boolean;
  /** 接続を試した socket / URL (未検出時の理由表示用)。 */
  readonly triedEndpoints: readonly string[];
  readonly versionJson: unknown;
  readonly infoJson: unknown;
  readonly containersJson: unknown;
  readonly imagesJson: unknown;
  /** コンテナ id → stats。稼働中なのに取得できなかった物は null。 */
  readonly statsById: Readonly<Record<string, ContainerStats | null>>;
}

/** stats を取りに行く稼働中コンテナの上限。 */
export const MAX_STATS_CONTAINERS = 20;

type JsonRecord = Record<string, unknown>;

function asRecord(v: unknown): JsonRecord | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Engine の State 文字列を表示用の3状態へ寄せる (純粋)。 */
export function containerStatus(state: string): DockerContainer['status'] {
  if (state === 'running') return 'running';
  if (state === 'paused') return 'paused';
  return 'exited';
}

/** Ports 配列を "公開:内部" の要約文字列にする (純粋)。 */
export function formatPorts(ports: unknown): string {
  const parts: string[] = [];
  for (const p of asArray(ports)) {
    const rec = asRecord(p);
    if (rec === null) continue;
    const priv = asNumber(rec.PrivatePort);
    if (priv === 0) continue;
    const pub = asNumber(rec.PublicPort);
    const type = asString(rec.Type) || 'tcp';
    parts.push(pub > 0 ? `${pub}:${priv}` : `${priv}/${type}`);
  }
  return parts.length > 0 ? parts.join(', ') : '-';
}

/** 0.0.0.0 / :: バインドで公開されているポートがあるか (純粋)。 */
export function hasExposedPort(ports: unknown): boolean {
  return asArray(ports).some((p) => {
    const rec = asRecord(p);
    if (rec === null) return false;
    const ip = asString(rec.IP);
    return asNumber(rec.PublicPort) > 0 && (ip === '0.0.0.0' || ip === '::' || ip === '');
  });
}

/**
 * stats 1 回分から CPU 使用率 (%) を算出する (純粋)。docker stats と同じ
 * cpu_stats / precpu_stats の差分方式。前回値が無い (初回) 場合は 0。
 */
export function computeCpuPct(stats: unknown): number {
  const root = asRecord(stats);
  const cpu = asRecord(root?.cpu_stats);
  const pre = asRecord(root?.precpu_stats);
  if (cpu === null || pre === null) return 0;
  const usage = asRecord(cpu.cpu_usage);
  const preUsage = asRecord(pre.cpu_usage);
  const total = asNumber(usage?.total_usage);
  const preTotal = asNumber(preUsage?.total_usage);
  const system = asNumber(cpu.system_cpu_usage ?? cpu.system_usage);
  const preSystem = asNumber(pre.system_cpu_usage ?? pre.system_usage);
  // 前回値が両方 0 = 前回サンプルが無い (起動直後)。差分が取れないので 0
  // (初回だけ跳ねる偽の値を出さない)。
  if (preTotal === 0 && preSystem === 0) return 0;
  const cpuDelta = total - preTotal;
  const systemDelta = system - preSystem;
  if (cpuDelta <= 0 || systemDelta <= 0) return 0;
  const online = asNumber(cpu.online_cpus) || asArray(usage?.percpu_usage).length || 1;
  return Math.round((cpuDelta / systemDelta) * online * 100 * 10) / 10;
}

/** stats 1 回分からメモリ使用量 (MB) を算出する (純粋)。キャッシュ分は差し引く。 */
export function computeMemMb(stats: unknown): number {
  const mem = asRecord(asRecord(stats)?.memory_stats);
  if (mem === null) return 0;
  const inner = asRecord(mem.stats);
  const cache = asNumber(inner?.inactive_file ?? inner?.cache);
  const used = Math.max(0, asNumber(mem.usage) - cache);
  return Math.round(used / (1024 * 1024));
}

/** イメージ名から取得元ラベルを導く (純粋)。 */
export function imageSource(repo: string): string {
  if (repo.startsWith('ghcr.io/')) return 'GHCR';
  if (repo.startsWith('quay.io/')) return 'Quay';
  if (repo.includes('.amazonaws.com/')) return 'ECR';
  if (repo.startsWith('gcr.io/') || repo.includes('.gcr.io/') || repo.includes('-docker.pkg.dev/')) {
    return 'GCR / Artifact Registry';
  }
  const first = repo.split('/')[0] ?? '';
  if (first.includes('.') || first.includes(':')) return first;
  return 'Docker Hub';
}

/** "repo:tag" を分解する (純粋)。タグが無ければ 'latest' ではなく '<none>'。 */
export function splitRepoTag(repoTag: string): { repo: string; tag: string } {
  const lastSlash = repoTag.lastIndexOf('/');
  const lastColon = repoTag.lastIndexOf(':');
  if (lastColon > lastSlash) {
    return { repo: repoTag.slice(0, lastColon), tag: repoTag.slice(lastColon + 1) };
  }
  return { repo: repoTag, tag: '<none>' };
}

/** 生の読み取り値から表示用スナップショットを組み立てる (純粋・決定論的)。 */
export function buildDockerSnapshot(r: RawDockerReadings): DockerSnapshot {
  if (!r.found) {
    return {
      engine: {
        version: '未検出',
        containersRunning: 0,
        containersTotal: 0,
        images: 0,
        rootless: false,
        ghcrLinked: false,
      },
      containers: [],
      images: [],
      security: [
        {
          id: 'engine-missing',
          item: 'Docker Engine が見つかりません',
          status: 'action',
          detail: `接続を試した場所: ${r.triedEndpoints.join(', ') || '(なし)'}。Docker をインストールして起動すると検出できます`,
        },
      ],
      workflows: [],
    };
  }

  const version = asRecord(r.versionJson);
  const info = asRecord(r.infoJson);
  const engineVersion = asString(version?.Version) || '不明';
  const securityOptions = asArray(info?.SecurityOptions).map((x) => asString(x));
  const rootless = securityOptions.some((x) => x.includes('rootless'));

  const rawContainers = asArray(r.containersJson)
    .map((c) => asRecord(c))
    .filter((c): c is JsonRecord => c !== null);
  const containers: DockerContainer[] = rawContainers.map((c) => {
    const id = asString(c.Id);
    const state = containerStatus(asString(c.State));
    const stats = r.statsById[id];
    return {
      id: id.slice(0, 12),
      name: (asString(asArray(c.Names)[0]) || '').replace(/^\//, '') || id.slice(0, 12),
      image: asString(c.Image),
      status: state,
      cpuPct: stats != null ? stats.cpuPct : 0,
      memMb: stats != null ? stats.memMb : 0,
      ports: formatPorts(c.Ports),
      uptime: asString(c.Status),
    };
  });
  const runningCount = containers.filter((c) => c.status === 'running').length;
  const statsMissingNames = rawContainers
    .filter(
      (c) => containerStatus(asString(c.State)) === 'running' && r.statsById[asString(c.Id)] == null,
    )
    .map(
      (c) => (asString(asArray(c.Names)[0]) || '').replace(/^\//, '') || asString(c.Id).slice(0, 12),
    );

  const images: DockerImage[] = asArray(r.imagesJson)
    .map((i) => asRecord(i))
    .filter((i): i is JsonRecord => i !== null)
    .map((img) => {
      const repoTags = asArray(img.RepoTags).map((t) => asString(t)).filter((t) => t !== '');
      const firstTag = repoTags[0];
      const { repo, tag } =
        firstTag !== undefined ? splitRepoTag(firstTag) : { repo: '<none>', tag: '<none>' };
      return {
        id: asString(img.Id).replace(/^sha256:/, '').slice(0, 12),
        repo,
        tag,
        sizeMb: Math.round(asNumber(img.Size) / (1024 * 1024)),
        critical: null,
        high: null,
        medium: null,
        low: null,
        source: imageSource(repo),
      };
    });

  const ghcrLinked =
    images.some((i) => i.repo.startsWith('ghcr.io/')) ||
    containers.some((c) => c.image.startsWith('ghcr.io/'));

  const composeProjects = [
    ...new Set(
      rawContainers
        .map((c) => asString(asRecord(c.Labels)?.['com.docker.compose.project']))
        .filter((p) => p !== ''),
    ),
  ].sort();

  const exposedNames = rawContainers
    .filter((c) => hasExposedPort(c.Ports))
    .map((c) => (asString(asArray(c.Names)[0]) || '').replace(/^\//, '') || asString(c.Id).slice(0, 12));

  const security: DockerSecurityCheck[] = [
    rootless
      ? {
          id: 'rootless',
          item: 'rootless モードで実行',
          status: 'ok' as const,
          detail: 'デーモンを非 root で稼働させ、権限昇格リスクを低減しています',
        }
      : {
          id: 'rootless',
          item: 'rootless モードで実行',
          status: 'warn' as const,
          detail: 'デーモンが root で稼働しています (rootless 化を検討してください)',
        },
    {
      id: 'vuln-scan',
      item: 'イメージ脆弱性スキャン',
      status: 'warn',
      detail:
        '脆弱性件数は Docker Engine API では取得できないため未スキャンです。docker scout / trivy 等で別途スキャンしてください',
    },
    exposedNames.length > 0
      ? {
          id: 'exposed-ports',
          item: '公開ポート (全インターフェース)',
          status: 'warn' as const,
          detail: `${exposedNames.join(', ')} が 0.0.0.0 バインドでポートを公開しています。意図した公開か確認してください`,
        }
      : {
          id: 'exposed-ports',
          item: '公開ポート (全インターフェース)',
          status: 'ok' as const,
          detail: '全インターフェース向けに公開されたポートはありません',
        },
    ghcrLinked
      ? {
          id: 'ghcr',
          item: 'GHCR 連携',
          status: 'ok' as const,
          detail: 'GHCR (ghcr.io) のイメージ/コンテナを検出しました',
        }
      : {
          id: 'ghcr',
          item: 'GHCR 連携',
          status: 'warn' as const,
          detail: 'GHCR のイメージ/コンテナは検出されませんでした',
        },
  ];
  if (statsMissingNames.length > 0) {
    security.push({
      id: 'stats-missing',
      item: 'コンテナのリソース使用量',
      status: 'warn',
      detail: `${statsMissingNames.join(', ')} の stats を取得できなかったため、CPU/メモリは 0 と表示しています (実測値ではありません)`,
    });
  }

  const workflows: DockerWorkflow[] = [
    {
      id: 'compose',
      name: 'Compose プロジェクト',
      description:
        composeProjects.length > 0
          ? `検出: ${composeProjects.join(', ')}`
          : 'Compose で管理されているコンテナは検出されませんでした',
      automated: composeProjects.length > 0,
    },
    {
      id: 'ghcr-build',
      name: 'GHCR ビルド連携',
      description: ghcrLinked
        ? 'GHCR のイメージを使用しています (GitHub Actions のビルド成果物の想定)'
        : 'GHCR のイメージは使用していません',
      automated: ghcrLinked,
    },
  ];

  return {
    engine: {
      version: engineVersion,
      containersRunning: runningCount,
      containersTotal: containers.length,
      images: images.length,
      rootless,
      ghcrLinked,
    },
    containers,
    images,
    security,
    workflows,
  };
}

/**
 * Docker Engine API を socket / TCP 経由で読む (薄いアダプタ)。整形・解釈は
 * 純関数側 ({@link buildDockerSnapshot}) に寄せてある。
 */
// Stryker disable all
const REQUEST_TIMEOUT_MS = 2_000;

interface EngineEndpoint {
  readonly label: string;
  readonly socketPath?: string;
  readonly host?: string;
  readonly port?: number;
}

function candidateEndpoints(): EngineEndpoint[] {
  const out: EngineEndpoint[] = [];
  const dockerHost = process.env.DOCKER_HOST ?? '';
  if (dockerHost.startsWith('unix://')) {
    out.push({ label: dockerHost, socketPath: dockerHost.slice('unix://'.length) });
  } else if (dockerHost.startsWith('tcp://')) {
    try {
      const url = new URL(dockerHost.replace(/^tcp:\/\//, 'http://'));
      out.push({
        label: dockerHost,
        host: url.hostname,
        port: Number(url.port) || 2375,
      });
    } catch {
      /* 解釈できない DOCKER_HOST は候補にしない */
    }
  }
  out.push({ label: '/var/run/docker.sock', socketPath: '/var/run/docker.sock' });
  const xdg = process.env.XDG_RUNTIME_DIR;
  if (xdg !== undefined && xdg !== '') {
    out.push({ label: `${xdg}/docker.sock`, socketPath: path.join(xdg, 'docker.sock') });
  }
  out.push({
    label: '~/.docker/run/docker.sock',
    socketPath: path.join(os.homedir(), '.docker', 'run', 'docker.sock'),
  });
  return out;
}

function engineGet(ep: EngineEndpoint, requestPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        ...(ep.socketPath !== undefined ? { socketPath: ep.socketPath } : {}),
        ...(ep.host !== undefined ? { host: ep.host, port: ep.port } : {}),
        path: requestPath,
        method: 'GET',
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode === undefined || res.statusCode >= 400) {
            reject(new Error(`Engine API ${requestPath}: HTTP ${res.statusCode ?? '?'}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Engine API ${requestPath}: timeout`)));
    req.on('error', reject);
    req.end();
  });
}

export async function readDockerEngine(): Promise<RawDockerReadings> {
  const endpoints = candidateEndpoints();
  const tried = endpoints.map((e) => e.label);
  const empty: RawDockerReadings = {
    found: false,
    triedEndpoints: tried,
    versionJson: null,
    infoJson: null,
    containersJson: null,
    imagesJson: null,
    statsById: {},
  };
  for (const ep of endpoints) {
    if (ep.socketPath !== undefined && !fs.existsSync(ep.socketPath)) continue;
    let versionJson: unknown;
    try {
      versionJson = await engineGet(ep, '/version');
    } catch {
      continue; // 応答しない候補は次へ (未検出の確定は全候補を試してから)
    }
    const [infoJson, containersJson, imagesJson] = await Promise.all([
      engineGet(ep, '/info').catch(() => null),
      engineGet(ep, '/containers/json?all=1').catch(() => null),
      engineGet(ep, '/images/json').catch(() => null),
    ]);
    const statsById: Record<string, ContainerStats | null> = {};
    const running = asArray(containersJson)
      .map((c) => asRecord(c))
      .filter((c): c is JsonRecord => c !== null)
      .filter((c) => containerStatus(asString(c.State)) === 'running')
      .slice(0, MAX_STATS_CONTAINERS);
    for (const c of running) {
      const id = asString(c.Id);
      try {
        const stats = await engineGet(ep, `/containers/${id}/stats?stream=false`);
        statsById[id] = { cpuPct: computeCpuPct(stats), memMb: computeMemMb(stats) };
      } catch {
        statsById[id] = null;
      }
    }
    return {
      found: true,
      triedEndpoints: tried,
      versionJson,
      infoJson,
      containersJson,
      imagesJson,
      statsById,
    };
  }
  return empty;
}
// Stryker restore all

export async function fetchDockerSnapshot(_ctx: FetchContext): Promise<DockerSnapshot> {
  return buildDockerSnapshot(await readDockerEngine());
}
