import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, withQuery, type FetchFn } from './http';
import { displayField, requireNumber, requireObject, requireString } from '../apiResponse';
import {
  GITHUB_ISSUE_FIELDS,
  GITHUB_LABELS,
  checkWriteFields,
  checkWriteLabels,
  describeWriteFieldFailure,
} from '../writeFieldLimits';

/** 送り先は 1 つ。読み (下の class) も書き (課題の作成) も同じ定数を通る。 */
export const GITHUB_API = 'https://api.github.com';
const API = GITHUB_API;

/** REST の生の形のうち、この層が約束する分だけ。 */
export interface GithubRepo {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly htmlUrl: string;
  readonly updatedAt: string;
}

export interface GithubIssueLike {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly htmlUrl: string;
  readonly updatedAt: string;
  readonly isPullRequest: boolean;
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  updated_at: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
}

interface RawSearch {
  items?: RawIssue[];
}

function toRepo(r: RawRepo): GithubRepo {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
  };
}

function toIssue(i: RawIssue): GithubIssueLike {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    htmlUrl: i.html_url,
    updatedAt: i.updated_at,
    // REST の issue には PR も混ざる。`pull_request` の有無だけが両者の違い。
    isPullRequest: i.pull_request !== undefined,
  };
}

export class GithubClient implements ServiceClient {
  readonly id = 'github';
  constructor(
    private readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  private ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  private headers(): Record<string, string> {
    return bearer(String(this.creds.token), {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  }

  /** 認証ユーザーのリポジトリ。更新の新しい順。 */
  async listRepos(perPage = 30): Promise<GithubRepo[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawRepo[]>(
      withQuery(`${API}/user/repos`, { per_page: perPage, sort: 'updated' }),
      { headers: this.headers() },
      this.ctx(),
    );
    return raw.map(toRepo);
  }

  /** 自分が author の open な PR。 */
  async listPullRequests(perPage = 30): Promise<GithubIssueLike[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawSearch>(
      withQuery(`${API}/search/issues`, {
        q: 'is:pr author:@me is:open',
        per_page: perPage,
        sort: 'updated',
      }),
      { headers: this.headers() },
      this.ctx(),
    );
    return (raw.items ?? []).map(toIssue);
  }

  /** 認証ユーザーに割り当てられた issue。 */
  async listIssues(perPage = 30): Promise<GithubIssueLike[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawIssue[]>(
      withQuery(`${API}/issues`, { per_page: perPage, filter: 'assigned', state: 'open' }),
      { headers: this.headers() },
      this.ctx(),
    );
    return raw.map(toIssue);
  }
}

// --- 課題の作成 (POST /repos/{owner}/{repo}/issues) ----------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し)。
 *
 * それまで課題の作成は main (`clients/github.ts`) とブラウザ版 (`saasWriteWeb.ts`)
 * が**別々に**組んでいた —— 欄の判定は同じ台帳を読むのに、URL・ヘッダ・本文の
 * 組み立てと応答の読み方が 2 つ在り、ブラウザ版だけが owner / repo / title を
 * trim していた。そしてこの `shared/api/github.ts` は読みの class を持ちながら
 * **どちらのビルドからも読まれていなかった** (実測: 本番の import 0 件)。
 *
 * `shared/api/microsoft365.ts` (パス 274) と同じ形に寄せる: 欄の判定 (`checkIssue`)・
 * URL (`githubIssuesPath`)・要求 (`githubIssueInit`)・応答の読み (`parseCreatedIssue`)
 * を 1 つずつここに置き、main は `jsonFetch` (打ち切り・上限・封筒)、ブラウザ版は
 * `transport` (プロキシ / 直接 + 打ち切り) という**自分の流儀**だけを持つ。
 *
 * `GITHUB_API` は送信の呼び出しと同じ行に置く —— `verify:arch` の egress の照合は
 * shared を「送信の文脈」でしか数えず、ALL_CAPS の定数はその行に現れて初めて
 * 宛先として映る (`microsoft365.ts` の注記と同じ理由)。
 */

/** `(url, init) → Response`。ブラウザ版の `timedFetch` / プロキシ経由の口がこの形。 */
export type GithubTransport = (url: string, init: RequestInit) => Promise<Response>;

/** `checkIssue` が受ける欄 (main の payload とブラウザ版の input の両方が構造で合う)。 */
export interface GithubIssueFields {
  readonly owner?: unknown;
  readonly repo?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
  readonly labels?: unknown;
}

/** 台帳を通った後の、外へ出す欄。 */
export interface CheckedIssue {
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly body: string | undefined;
  readonly labels: readonly string[] | undefined;
}

/**
 * 欄の型・長さ・件数を共有台帳 (`GITHUB_ISSUE_FIELDS` / `GITHUB_LABELS`) で断る (パス 110)。
 * 通った値は owner / repo / title を trim する (ブラウザ版が持っていた振る舞いを 1 つに)。
 */
export function checkIssue(input: GithubIssueFields): CheckedIssue {
  const bad = checkWriteFields(input, GITHUB_ISSUE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  const badLabels = checkWriteLabels(input.labels);
  if (badLabels !== null) {
    throw new Error(describeWriteFieldFailure({ field: 'labels', problem: badLabels, rule: GITHUB_LABELS }));
  }
  const owner = typeof input.owner === 'string' ? input.owner.trim() : '';
  const repo = typeof input.repo === 'string' ? input.repo.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body : undefined;
  const labels = Array.isArray(input.labels)
    ? input.labels.filter((l): l is string => typeof l === 'string')
    : undefined;
  return { owner, repo, title, body, labels };
}

/** パスの動的部分は encodeURIComponent (不変条件 #6)。 */
export function githubIssuesPath(issue: CheckedIssue): string {
  return `/repos/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repo)}/issues`;
}

/**
 * 要求の組み立て。`extraHeaders` は main だけが渡す `User-Agent`
 * (ブラウザは禁止ヘッダとして自分で付けるので、渡すと黙って捨てられる)。
 */
export function githubIssueInit(
  issue: CheckedIssue,
  token: string,
  extraHeaders: Record<string, string> = {},
): RequestInit {
  return {
    method: 'POST',
    headers: {
      ...bearer(token, {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      }),
      ...extraHeaders,
    },
    body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。ok の判定と本文の読みは呼ぶ側の流儀。 */
export async function createGithubIssueRequest(
  issue: CheckedIssue,
  token: string,
  transport: GithubTransport,
): Promise<Response> {
  return transport(`${GITHUB_API}${githubIssuesPath(issue)}`, githubIssueInit(issue, token));
}

export interface CreatedIssue {
  readonly number: number;
  readonly url: string;
  readonly title: string;
}

/** `github/create-issue` の 201 の本文から、画面が使う 3 欄を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedIssue(body: unknown): CreatedIssue {
  const o = requireObject(body, 'GitHub API');
  return {
    number: requireNumber(o, 'number', 'GitHub API'),
    url: requireString(o, 'html_url', 'GitHub API'),
    title: displayField(requireString(o, 'title', 'GitHub API')),
  };
}
