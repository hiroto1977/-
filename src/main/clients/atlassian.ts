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
  if (!obj.email || !obj.token || !obj.site) {
    throw new FetchError('Atlassian token に email / token / site のいずれかが欠けています', 0, 'atlassian');
  }
  return { email: obj.email, token: obj.token, site: obj.site.replace(/\/$/, '') };
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

  const host = creds.site.replace(/^https?:\/\//, '');

  return {
    sites: [
      {
        cloudId: host,
        name: host.split('.')[0],
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
