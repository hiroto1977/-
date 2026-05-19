import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';

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

/** Per-field hard caps. Atlassian's own limits are well below these
 *  (email ≤ 254 per RFC 5321; PAT ~192 chars; site host ≤ 253). The
 *  caps defend against local-FS tampering that swaps secrets.json
 *  for a payload with multi-MB strings → main process OOM on the
 *  basicAuth Buffer allocation. */
const MAX_EMAIL = 254;
const MAX_TOKEN = 1024;
const MAX_SITE = 256;

export function parseAtlassianToken(raw: string): AtlassianCreds {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FetchError(
      'Atlassian token は { "email": "...", "token": "...", "site": "https://x.atlassian.net" } 形式の JSON で保存してください',
      0,
      'atlassian',
    );
  }
  const obj = parsed as Partial<AtlassianCreds>;
  // Strict per-field validation. typeof checks reject objects /
  // numbers / null / arrays smuggled into the JSON via local-disk
  // tampering. Length caps prevent multi-MB strings from OOMing the
  // basicAuth Buffer allocation.
  if (
    typeof obj.email !== 'string' || obj.email.length === 0 || obj.email.length > MAX_EMAIL ||
    typeof obj.token !== 'string' || obj.token.length === 0 || obj.token.length > MAX_TOKEN ||
    typeof obj.site !== 'string' || obj.site.length === 0 || obj.site.length > MAX_SITE
  ) {
    throw new FetchError(
      'Atlassian token の email / token / site が欠けているか、形式が不正です',
      0,
      'atlassian',
    );
  }
  // Defense in depth: header-injection chars in email would land in
  // Basic-auth base64 input (where they're safe), but if email is ever
  // surfaced in error messages or log lines a CRLF could break log
  // parsers / inject lines.
  if (/[\r\n\0]/.test(obj.email) || /[\r\n\0]/.test(obj.token)) {
    throw new FetchError('Atlassian token に制御文字が含まれています', 0, 'atlassian');
  }
  // Hard-reject anything that isn't https://. Plain http would put the
  // Basic auth header on the wire in cleartext; non-URL strings (e.g.
  // `javascript:`, `file:`) would crash the URL parser later and could
  // exfiltrate the token via a maliciously-crafted "site" field.
  let parsedSite: URL;
  try {
    parsedSite = new URL(obj.site);
  } catch {
    throw new FetchError('Atlassian token の site は URL として解釈可能な文字列にしてください', 0, 'atlassian');
  }
  if (parsedSite.protocol !== 'https:') {
    throw new FetchError('Atlassian token の site は https:// で始まる必要があります', 0, 'atlassian');
  }
  // Hostname allowlist: Atlassian Cloud always lives on *.atlassian.net.
  // Without this check, a tampered secrets.json could redirect the
  // user's email+token to any HTTPS endpoint (= credential exfiltration).
  if (!parsedSite.hostname.endsWith('.atlassian.net')) {
    throw new FetchError(
      'Atlassian token の site は *.atlassian.net である必要があります',
      0,
      'atlassian',
    );
  }
  // Strip *all* trailing slashes — handy for tokens whose `site`
  // accidentally got "https://x.atlassian.net//" from a copy/paste.
  return { email: obj.email, token: obj.token, site: obj.site.replace(/\/+$/, '') };
}

function basicAuth(email: string, token: string): string {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

export async function fetchAtlassianSnapshot(ctx: FetchContext): Promise<AtlassianSnapshot> {
  const creds = parseAtlassianToken(ctx.token);
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'atlassian' };
  const headers = { Authorization: basicAuth(creds.email, creds.token), Accept: 'application/json' };

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
    jiraProjects: (projects.values ?? []).map((p) => ({
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
      style: p.style,
    })),
  };
}

// --- write-side actions --------------------------------------------------

interface CreateJiraIssuePayload {
  projectKey: string;
  summary: string;
  description?: string;
  issueType?: string; // default "Task"
}

interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

async function createJiraIssue(
  ctx: ActionContext,
): Promise<{ key: string; url: string }> {
  const creds = parseAtlassianToken(ctx.token);
  const { projectKey, summary, description, issueType } =
    ctx.payload as unknown as CreateJiraIssuePayload;
  if (!projectKey || !summary) throw new Error('projectKey and summary are required');

  // Jira Cloud REST v3 wants Atlassian Document Format for description.
  const descBody = description
    ? {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      }
    : undefined;

  const res = await jsonFetch<JiraCreateIssueResponse>(
    `${creds.site}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(creds.email, creds.token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType ?? 'Task' },
          ...(descBody ? { description: descBody } : {}),
        },
      }),
    },
    { fetch: ctx.fetch, serviceId: 'atlassian' },
  );

  return { key: res.key, url: `${creds.site}/browse/${res.key}` };
}

export const ACTIONS: ActionMap = {
  'create-issue': createJiraIssue,
};
