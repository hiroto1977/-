import {
  ATLASSIAN_CREDS_MESSAGES,
  normalizeAtlassianSiteResult,
  readAtlassianCredentials,
  type AtlassianSiteFailure,
} from '../../shared/atlassianSite';
import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';
import { objectRows } from '../../shared/apiResponse';
import {
  JIRA_ISSUE_PATH,
  basicAuthorization,
  checkJiraIssue,
  jiraIssueInit,
  parseCreatedJiraIssue,
} from '../../shared/api/atlassian';
import type { ActionData } from '../../shared/actionData';

interface JiraProject {
  key: string;
  name: string;
  projectTypeKey: string;
  style: string;
}

interface JiraProjectsResponse {
  values: JiraProject[];
}

export interface AtlassianSnapshot {
  sites: { cloudId: string; name: string; url: string; scopes: string[] }[];
  jiraProjects: { key: string; name: string; projectTypeKey: string; style: string }[];
}

interface AtlassianCreds {
  email: string;
  token: string;
  site: string;
}


export function parseAtlassianToken(raw: string): AtlassianCreds {
  /*
   * 3 段の検査 (JSON → 3 欄と天井 → 制御文字) とその文面は
   * `shared/atlassianSite.ts` に 1 つだけ置く (パス 284)。それまでは同じ 3 段が
   * ブラウザ版 (`data/saasWriteWeb.ts`) にも在り、**文面が両方で違い**、
   * しかも**両方が JSON リテラルの `null` で素の TypeError を投げていた**
   * (`JSON.parse('null')` は成功して `null` を返すので、次の `typeof obj.email` が
   * 落ちる。書くつもりだった断りは 1 度も出ない)。共有側の docblock に実測が在る。
   */
  const creds = readAtlassianCredentials(raw);
  if (!creds.ok) throw new FetchError(ATLASSIAN_CREDS_MESSAGES[creds.reason], 0, 'atlassian');
  // https:// と *.atlassian.net への絞り込みも `shared/atlassianSite.ts` が 1 つ持つ。
  // plain http は Basic 認証ヘッダを平文で流し、`javascript:` や `file:` のような
  // 非 URL は後段で URL パーサを壊す。ホスト名を絞らないと、書き換えられた
  // secrets.json が email+token を任意の HTTPS 先へ向けられる。
  const site = normalizeAtlassianSiteResult(creds.site);
  if (!site.ok) throw new FetchError(ATLASSIAN_SITE_MESSAGES[site.reason], 0, 'atlassian');
  return { email: creds.email, token: creds.token, site: site.site };
}


/*
 * **site の文面は main 自身が持つ** (パス 284 で一度 shared へ寄せかけて戻した)。
 * `atlassianSiteParity.test.ts` が「拒否の文言は呼び出し側ごとの言い回しを保つ」
 * を留めており、その理由は**欄の呼び名が違う**こと —— main は保存 JSON の
 * `token の site`、`shared/api/atlassian.ts` は引数の `baseUrl` と呼ぶ。
 * 揃えるのは判定 (`normalizeAtlassianSiteResult`) であって文面ではない。
 * 上の資格情報の 3 文を共有したのは、あちらに同じ理由が無いため
 * (両ビルドとも同じ保存 JSON の同じ 3 欄を読み、呼び名も同じ)。
 */
const ATLASSIAN_SITE_MESSAGES: Record<AtlassianSiteFailure, string> = {
  'control-char': 'Atlassian token の site に制御文字が含まれています',
  'not-a-url': 'Atlassian token の site は URL として解釈可能な文字列にしてください',
  'not-https': 'Atlassian token の site は https:// で始まる必要があります',
  'not-atlassian': 'Atlassian token の site は *.atlassian.net である必要があります',
};

export async function fetchAtlassianSnapshot(ctx: FetchContext): Promise<AtlassianSnapshot> {
  const creds = parseAtlassianToken(ctx.token);
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'atlassian' };
  const headers = { Authorization: basicAuthorization(creds.email, creds.token), Accept: 'application/json' };

  const url = new URL(`${creds.site}/rest/api/3/project/search?maxResults=50`);
  const projects = await jsonFetch<JiraProjectsResponse>(url.toString(), { headers }, fetchCtx);

  // parseAtlassianToken enforces https:// prefix; the `^` anchor-dropped
  // mutant is equivalent. Marked inline below.
  // Stryker disable next-line Regex
  const host = creds.site.replace(/^https:\/\//, '');

  return {
    sites: [
      {
        cloudId: host,
        name: host.split('.')[0] ?? host,
        url: creds.site,
        scopes: ['basic-auth'],
      },
    ],
    jiraProjects: objectRows<JiraProject>(projects.values).map((p) => ({
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
      style: p.style,
    })),
  };
}

// --- write-side actions --------------------------------------------------

/*
 * 欄の判定・ADF・Basic 認証・要求・応答の読みは `shared/api/atlassian.ts` の 1 つで、
 * ブラウザ版も同じ関数を通る (パス 321)。資格情報の解析 (`parseAtlassianToken`) は
 * 上のとおり呼び手ごとに残す (断りの運び方と欄の呼び名が違う —— パス 284)。
 */

export interface CreateJiraIssuePayload {
  projectKey: string;
  summary: string;
  description?: string;
  issueType?: string; // default "Task"
}

async function createJiraIssue(
  ctx: ActionContext,
): Promise<ActionData<'atlassian/create-issue'>> {
  const creds = parseAtlassianToken(ctx.token);
  const issue = checkJiraIssue(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${creds.site}${JIRA_ISSUE_PATH}`,
    jiraIssueInit(issue, creds),
    { fetch: ctx.fetch, serviceId: 'atlassian' },
  );
  return parseCreatedJiraIssue(res, creds.site);
}

export const ACTIONS: ActionMap = {
  'create-issue': createJiraIssue,
};
