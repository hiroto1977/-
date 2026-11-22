/**
 * 品質ダッシュボード (`quality`) の GitHub 読み取り (2026-11-21)。
 *
 * このリポジトリ自身 (`hiroto1977/-`) の品質状態を GitHub API から読む。
 * 以前は同梱の見本 (手書きのテスト件数・レビュー深刻度・成果物サイズ) を
 * そのまま返していた —— **裏付けのない数字を実測のように見せていた**ので、
 * 読めるものだけを読む形に置き換えた (調査メモ `quality-redesign-memo.md`)。
 *
 * ## 何をどこから読むか
 *
 * 即時値 (GitHub API):
 *   - 最新コミット: `GET /repos/{owner}/{repo}/commits/main`
 *   - CI / 変異検査の最新実行: `GET .../actions/workflows/{ci,mutation}.yml/runs?branch=main&per_page=1`
 *   - テストファイル数: `GET .../git/trees/main?recursive=1` の `*.test.ts(x)` を数える
 *   - PR 件数とレビュー状態: Search API の `total_count`
 *     (`is:pr is:open` / `review:approved` / `review:changes_requested`)
 *
 *   pulls 一覧や reviews 一覧は**使わない** —— あれらは配列の応答で、
 *   main 側の `jsonFetch` は封筒がオブジェクトでない応答を断る
 *   (手続きの実在を確かめられない形を成功にしないための規則)。
 *   件数だけなら Search の `total_count` で足りる。
 *
 * 生成時点つきの実測値 (`docs/QUALITY.md`):
 *   - mutation スコア・killed / survived、ユニットテスト passing 数、
 *     coverage は週次ジョブが生成する `docs/QUALITY.md` の Summary 表を読む。
 *     **ライブでは測れない** (変異検査は数時間掛かる) ので、生成時点
 *     (`最終更新`) を必ず一緒に持つ。即時値と混ぜて刷らない。
 *   - QUALITY.md が読めなければ `report: null` —— 即時値だけでも画面は立つ。
 *
 * ## 失敗の扱い
 *
 * 即時値の照会はどれか 1 つでも落ちたら全体を落とす。トークン違いや
 * ネットワーク断は全部に効くので、「一部だけ取れた空の成功」として
 * 通すほうが実態とずれる (他の `shared/api/*` と同じ倒し方)。
 * 個別に「履歴が無い」もの (ワークフロー未実行) は `null` で表す。
 *
 * 通信手段 (`jsonFetch`) は注入する: デスクトップ版は main の `jsonFetch`
 * (対象は `api.github.com` のみ)、ブラウザ版は利用者のプロキシ経由。
 */

import { displayField, requireObject, requireString, requireNumber, objectRows } from '../apiResponse';
import { displayDateOf } from '../isoDate';
import { bearer, withQuery } from './http';
import { GITHUB_API } from './github';

/** 品質の対象はこのリポジトリ自身。 */
export const QUALITY_REPO_OWNER = 'hiroto1977';
export const QUALITY_REPO_NAME = '-';

const API_LABEL = 'GitHub API (quality)';

/** 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。 */
export type QualityJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** GitHub への照会に共通のヘッダ (`shared/api/github.ts` と同じ組)。 */
export function qualityHeaders(token: string): Record<string, string> {
  return bearer(token, {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
}

/** ワークフローの最新実行 1 件。履歴が無ければ snapshot 側で `null`。 */
export interface QualityWorkflowRun {
  /** `completed` / `in_progress` など GitHub の原文。 */
  readonly status: string;
  /** `success` / `failure` など。実行中は `null`。 */
  readonly conclusion: string | null;
  /** 表示日 (YYYY-MM-DD)。読めなければ `null`。 */
  readonly updatedAt: string | null;
  /** 実行ページへの URL。 */
  readonly htmlUrl: string;
}

/**
 * `docs/QUALITY.md` の Summary 表から読んだ実測値。
 *
 * 値はすべて「`generatedAt` 時点」のもの。行が読めなかった項目は `null` ——
 * 0 や空で埋めて実測に見せない。
 */
export interface QualityReport {
  /** QUALITY.md 冒頭の「最終更新」(原文 `YYYY-MM-DD HH:mm:ss UTC`)。 */
  readonly generatedAt: string | null;
  readonly typecheckPass: boolean | null;
  readonly unitTestsPassing: number | null;
  readonly unitTestFiles: number | null;
  /** coverage は `src/main/**` のみが対象 (QUALITY.md の注記のとおり)。 */
  readonly coverageLines: number | null;
  readonly coverageStatements: number | null;
  readonly coverageBranches: number | null;
  readonly coverageFunctions: number | null;
  readonly mutationScoreTotal: number | null;
  readonly mutationScoreCovered: number | null;
  /** 変異検査が測ったファイル数と、その報告ファイルの日時 (原文)。 */
  readonly mutationFiles: number | null;
  readonly mutationReportAt: string | null;
  readonly mutantsKilled: number | null;
  readonly mutantsSurvived: number | null;
  readonly mutantsValid: number | null;
}

export interface QualitySnapshot {
  /** main の最新コミット。短縮 SHA と表示日。 */
  readonly latestCommit: { readonly sha: string; readonly date: string | null } | null;
  readonly ciRun: QualityWorkflowRun | null;
  readonly mutationRun: QualityWorkflowRun | null;
  /**
   * リポジトリ全体のテストファイル数 (静的に数えた `*.test.ts(x)`)。
   * trees 応答が途中で切れていた (`truncated`) ときは数えない ——
   * 下限を実数として刷らないため `null`。
   */
  readonly testFileCount: number | null;
  readonly openPullRequests: number | null;
  readonly approvedPullRequests: number | null;
  readonly changesRequestedPullRequests: number | null;
  /** `docs/QUALITY.md` の実測。読めなければ `null`。 */
  readonly report: QualityReport | null;
}

const REPO_PATH = `/repos/${QUALITY_REPO_OWNER}/${QUALITY_REPO_NAME}`;

export function qualityCommitPath(): string {
  return `${REPO_PATH}/commits/main`;
}

export function qualityWorkflowRunsPath(workflowFile: string): string {
  return withQuery(`${REPO_PATH}/actions/workflows/${workflowFile}/runs`, {
    branch: 'main',
    per_page: 1,
  });
}

export function qualityTreePath(): string {
  return withQuery(`${REPO_PATH}/git/trees/main`, { recursive: 1 });
}

export function qualityPullSearchPath(reviewState: string | null): string {
  const base = `repo:${QUALITY_REPO_OWNER}/${QUALITY_REPO_NAME} is:pr is:open`;
  return withQuery('/search/issues', {
    q: reviewState === null ? base : `${base} review:${reviewState}`,
    per_page: 1,
  });
}

export function qualityReportPath(): string {
  return `${REPO_PATH}/contents/docs/QUALITY.md`;
}

interface RawWorkflowRun {
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly updated_at?: unknown;
  readonly html_url?: unknown;
}

/**
 * ワークフローの状態・結論は GitHub の固定の語彙だけを通す。
 *
 * 画面は結論を (既知の語に訳した残りは) そのまま出すので、相手の文字列を
 * 生で通すと「1 欄に長い文字列」が画面へ届く道になる。語彙の外は
 * 「分からない」側へ倒す (status は空 = 未完了扱い、conclusion は null)。
 */
const WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'in_progress',
  'completed',
  'waiting',
  'requested',
  'pending',
  'action_required',
]);
const WORKFLOW_CONCLUSIONS: ReadonlySet<string> = new Set([
  'success',
  'failure',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'neutral',
  'stale',
]);

function readWorkflowRun(body: unknown): QualityWorkflowRun | null {
  const obj = requireObject(body, API_LABEL);
  const rows = objectRows<RawWorkflowRun>(obj.workflow_runs);
  const run = rows[0];
  if (run === undefined) return null;
  return {
    status: typeof run.status === 'string' && WORKFLOW_STATUSES.has(run.status) ? run.status : '',
    conclusion:
      typeof run.conclusion === 'string' && WORKFLOW_CONCLUSIONS.has(run.conclusion) ? run.conclusion : null,
    updatedAt: displayDateOf(run.updated_at),
    htmlUrl: typeof run.html_url === 'string' ? displayField(run.html_url) : '',
  };
}

function countTestFiles(body: unknown): number | null {
  const obj = requireObject(body, API_LABEL);
  if (obj.truncated === true) return null;
  const rows = objectRows<{ readonly path?: unknown; readonly type?: unknown }>(obj.tree);
  let count = 0;
  for (const row of rows) {
    if (row.type !== 'blob') continue;
    if (typeof row.path === 'string' && /\.test\.tsx?$/.test(row.path)) count += 1;
  }
  return count;
}

function readTotalCount(body: unknown): number {
  return requireNumber(requireObject(body, API_LABEL), 'total_count', API_LABEL);
}

/** contents API の base64 を UTF-8 の文字列に戻す。 */
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function intOf(m: RegExpMatchArray | null, group: number): number | null {
  const v = m?.[group];
  if (v === undefined) return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pctOf(m: RegExpMatchArray | null, group: number): number | null {
  const v = m?.[group];
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * `docs/QUALITY.md` の Summary 表を読む。
 *
 * 表の行が増減しても、読めた行だけを拾い、読めなかった行は `null` のまま
 * 返す (部分的に古い・壊れた表を「全部 0」の実測に化けさせない)。
 */
function typecheckPassOf(markdown: string): boolean | null {
  const cell = markdown.match(/\| TypeScript 型検査 \| ([^|]+) \|/)?.[1];
  if (cell === undefined) return null;
  if (cell.includes('pass')) return true;
  if (cell.includes('fail')) return false;
  return null;
}

export function parseQualityReport(markdown: string): QualityReport {
  const unitTests = markdown.match(/\| ユニットテスト \| (\d[\d,]*) passing \((\d[\d,]*) files\)/);
  const mutationScore = markdown.match(/Mutation score \(total \/ covered\) \| ([\d.]+)% \/ ([\d.]+)%/);
  return {
    generatedAt: markdown.match(/最終更新:\s*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]+ UTC)/)?.[1] ?? null,
    typecheckPass: typecheckPassOf(markdown),
    unitTestsPassing: intOf(unitTests, 1),
    unitTestFiles: intOf(unitTests, 2),
    coverageLines: pctOf(markdown.match(/lines \| ([\d.]+)%/), 1),
    coverageStatements: pctOf(markdown.match(/statements \| ([\d.]+)%/), 1),
    coverageBranches: pctOf(markdown.match(/branches \| ([\d.]+)%/), 1),
    coverageFunctions: pctOf(markdown.match(/functions \| ([\d.]+)%/), 1),
    mutationScoreTotal: pctOf(mutationScore, 1),
    mutationScoreCovered: pctOf(mutationScore, 2),
    mutationFiles: intOf(markdown.match(/Mutation の表の行 \(報告が測った本\) \| (\d[\d,]*) 本/), 1),
    mutationReportAt:
      markdown.match(/報告ファイルの日時 ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]+ UTC)\)/)?.[1] ?? null,
    mutantsKilled: intOf(markdown.match(/\| Mutants killed \| (\d[\d,]*) \|/), 1),
    mutantsSurvived: intOf(markdown.match(/\| Mutants survived \| (\d[\d,]*) \|/), 1),
    mutantsValid: intOf(markdown.match(/\| Mutants 有効 \(分母\) \| (\d[\d,]*) \|/), 1),
  };
}

/** QUALITY.md の読み取り。失敗は握って `null` (即時値の表示を止めない)。 */
async function readQualityReport(
  jsonFetch: QualityJsonFetch,
  init: RequestInit,
): Promise<QualityReport | null> {
  try {
    const body = await jsonFetch(`${GITHUB_API}${qualityReportPath()}`, init);
    const obj = requireObject(body, API_LABEL);
    const content = requireString(obj, 'content', API_LABEL);
    return parseQualityReport(decodeBase64Utf8(content));
  } catch {
    return null;
  }
}

/**
 * 品質スナップショットを GitHub から読む。
 *
 * 即時値の照会は並行に投げ、どれか落ちたら例外のまま上げる
 * (呼び出し側が「取得できませんでした」と述べる経路に乗る)。
 */
export async function fetchQualitySnapshotWith(
  jsonFetch: QualityJsonFetch,
  token: string,
): Promise<QualitySnapshot> {
  const init: RequestInit = { headers: qualityHeaders(token) };
  const [commitBody, ciBody, mutationBody, treeBody, openBody, approvedBody, changesBody, report] =
    await Promise.all([
      jsonFetch(`${GITHUB_API}${qualityCommitPath()}`, init),
      jsonFetch(`${GITHUB_API}${qualityWorkflowRunsPath('ci.yml')}`, init),
      jsonFetch(`${GITHUB_API}${qualityWorkflowRunsPath('mutation.yml')}`, init),
      jsonFetch(`${GITHUB_API}${qualityTreePath()}`, init),
      jsonFetch(`${GITHUB_API}${qualityPullSearchPath(null)}`, init),
      jsonFetch(`${GITHUB_API}${qualityPullSearchPath('approved')}`, init),
      jsonFetch(`${GITHUB_API}${qualityPullSearchPath('changes_requested')}`, init),
      readQualityReport(jsonFetch, init),
    ]);

  const commit = requireObject(commitBody, API_LABEL);
  const sha = requireString(commit, 'sha', API_LABEL);
  const committer =
    typeof commit.commit === 'object' && commit.commit !== null
      ? (commit.commit as Record<string, unknown>).committer
      : undefined;
  const commitDate =
    typeof committer === 'object' && committer !== null
      ? displayDateOf((committer as Record<string, unknown>).date)
      : null;

  return {
    latestCommit: { sha: sha.slice(0, 7), date: commitDate },
    ciRun: readWorkflowRun(ciBody),
    mutationRun: readWorkflowRun(mutationBody),
    testFileCount: countTestFiles(treeBody),
    openPullRequests: readTotalCount(openBody),
    approvedPullRequests: readTotalCount(approvedBody),
    changesRequestedPullRequests: readTotalCount(changesBody),
    report,
  };
}
