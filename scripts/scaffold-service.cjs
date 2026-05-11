#!/usr/bin/env node
/*
 * Scaffold a new service: creates fetcher + test + page + registers
 * it in all the right places.
 *
 *   npm run scaffold -- <id> "<Label>" <ICON> [auth-kind]
 *
 * auth-kind:
 *   bearer (default) — single Bearer token
 *   oauth            — OAuth access token (same wire format, different UX hint)
 *   json             — JSON-encoded multi-field credentials (Atlassian style)
 *
 * Example:
 *   npm run scaffold -- linear "Linear" LN bearer
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function fail(msg) {
  console.error(`scaffold: ${msg}`);
  process.exit(1);
}

const [id, label, icon, authKindRaw = 'bearer'] = process.argv.slice(2);
if (!id || !label || !icon) {
  fail('usage: npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]');
}
if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`bad id "${id}" — lowercase letters/digits/hyphens, must start with a letter`);
if (icon.length > 4) fail(`icon "${icon}" too long (max 4 chars)`);
const authKind = String(authKindRaw).toLowerCase();
if (!['bearer', 'oauth', 'json'].includes(authKind)) fail(`unknown auth kind "${authKindRaw}"`);

const pascal = id.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase());
const camel = pascal[0].toLowerCase() + pascal.slice(1);

// --- file paths ----------------------------------------------------------
const FETCHER = path.join(ROOT, `src/main/clients/${id}.ts`);
const FETCHER_TEST = path.join(ROOT, `src/main/clients/__tests__/${id}.test.ts`);
const PAGE = path.join(ROOT, `src/renderer/pages/${pascal}Page.tsx`);
const SERVICE_IDS = path.join(ROOT, 'src/shared/serviceId.ts');
const CLIENTS_INDEX = path.join(ROOT, 'src/main/clients/index.ts');
const RENDERER_SERVICES = path.join(ROOT, 'src/renderer/services.ts');
const SNAPSHOT = path.join(ROOT, 'src/renderer/data/snapshot.ts');

// --- guards --------------------------------------------------------------
if (fs.existsSync(FETCHER)) fail(`${FETCHER} already exists; choose a different id`);
const serviceIdsSrc = fs.readFileSync(SERVICE_IDS, 'utf8');
if (serviceIdsSrc.includes(`'${id}'`)) fail(`'${id}' already in SERVICE_IDS`);

// --- templates ----------------------------------------------------------
const authBlocks = {
  bearer: {
    label: 'API トークン',
    placeholder: 'Bearer token',
    headerExpr: '`Bearer ${ctx.token}`',
    parseStep: '',
    testBody: `
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'x1', name: 'Hello' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const snap = await fetch${pascal}Snapshot({ token: 'token-123', fetch: fetchMock });

    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ id: 'x1', name: 'Hello' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');`,
  },
  oauth: {
    label: 'OAuth アクセストークン',
    placeholder: 'OAuth access token',
    headerExpr: '`Bearer ${ctx.token}`',
    parseStep: '',
    testBody: `
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'x1', name: 'Hello' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const snap = await fetch${pascal}Snapshot({ token: 'ya29.x', fetch: fetchMock });

    expect(snap.items).toHaveLength(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ya29.x');`,
  },
  json: {
    label: '認証情報 (JSON)',
    placeholder: '{"email":"...","token":"...","site":"https://..."}',
    headerExpr: 'basicAuth(creds.email, creds.token)',
    parseStep: `  const creds = parse${pascal}Token(ctx.token);
`,
    testBody: `
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'x1', name: 'Hello' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const token = JSON.stringify({
      email: 'a@b.com',
      token: 'apitoken',
      site: 'https://x.example.com',
    });
    const snap = await fetch${pascal}Snapshot({ token, fetch: fetchMock });

    expect(snap.items).toHaveLength(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);`,
  },
};
const auth = authBlocks[authKind];

const fetcherJsonHelpers = authKind === 'json'
  ? `
interface ${pascal}Creds {
  email: string;
  token: string;
  site: string;
}

export function parse${pascal}Token(raw: string): ${pascal}Creds {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FetchError(
      \`${id} token must be JSON: { email, token, site }\`,
      0,
      '${id}',
    );
  }
  const obj = parsed as Partial<${pascal}Creds>;
  if (!obj.email || !obj.token || !obj.site) {
    throw new FetchError('${id} token: email / token / site required', 0, '${id}');
  }
  return { email: obj.email, token: obj.token, site: obj.site.replace(/\\/$/, '') };
}

function basicAuth(email: string, token: string): string {
  return 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
}
`
  : '';

const fetcherTpl = `import {
  jsonFetch,
${authKind === 'json' ? "  FetchError,\n" : ''}  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
${fetcherJsonHelpers}
interface ${pascal}Item {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface ${pascal}ListResponse {
  items: ${pascal}Item[];
}

export interface ${pascal}Snapshot {
  items: { id: string; name: string }[];
}

export async function fetch${pascal}Snapshot(ctx: FetchContext): Promise<${pascal}Snapshot> {
${auth.parseStep}  const fetchCtx = { fetch: ctx.fetch, serviceId: '${id}' };
  const headers = { Authorization: ${auth.headerExpr} };

  // TODO: replace with the real endpoint
  const url = ${authKind === 'json' ? '`${creds.site}/api/items`' : `'https://api.example.com/${id}/items'`};
  const data = await jsonFetch<${pascal}ListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

// --- write-side actions ------------------------------------------------
// Wire up via serviceHub.invoke('${id}', '<name>', payload) from the
// renderer. Delete this block (and the ACTIONS export below) if you don't
// need any actions for this service.

async function exampleAction(_ctx: ActionContext): Promise<unknown> {
  // TODO: implement. Read ctx.payload and POST/PUT against the real API.
  throw new Error('${id}.example-action: not implemented');
}

export const ACTIONS: ActionMap = {
  'example-action': exampleAction,
};
`;

const fetcherTestTpl = `import { describe, expect, it, vi } from 'vitest';
import { fetch${pascal}Snapshot } from '../${id}';

describe('fetch${pascal}Snapshot', () => {
  it('normalizes the list response', async () => {${auth.testBody}
  });
});
`;

const pageTpl = `import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function ${pascal}Page() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    '${id}',
    SNAPSHOT.${camel},
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="${id}"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>${label} · {items.length} 件</>}
        tokenSetup={{ label: '${auth.label}', placeholder: '${auth.placeholder}' }}
      />

      <Section title="Items" count={items.length}>
        <DataList
          items={items.map((it) => ({
            key: it.id,
            title: it.name,
          }))}
        />
      </Section>
    </div>
  );
}
`;

// --- writes -------------------------------------------------------------
function writeNew(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log(`  create ${path.relative(ROOT, p)}`);
}

function insertBefore(filePath, marker, snippet) {
  const src = fs.readFileSync(filePath, 'utf8');
  if (!src.includes(marker)) fail(`marker not found in ${filePath}: ${marker}`);
  const updated = src.replace(marker, `${snippet}${marker}`);
  fs.writeFileSync(filePath, updated);
  console.log(`  patch  ${path.relative(ROOT, filePath)}`);
}

console.log(`scaffold: ${id} (${label})`);

writeNew(FETCHER, fetcherTpl);
writeNew(FETCHER_TEST, fetcherTestTpl);
writeNew(PAGE, pageTpl);

insertBefore(
  SERVICE_IDS,
  '  // SCAFFOLD:ADD_SERVICE_ID_ABOVE',
  `  '${id}',\n`,
);

insertBefore(
  CLIENTS_INDEX,
  '// SCAFFOLD:ADD_FETCHER_IMPORT_ABOVE',
  `import { fetch${pascal}Snapshot, ACTIONS as ${pascal.toUpperCase()}_ACTIONS } from './${id}';\n`,
);
insertBefore(
  CLIENTS_INDEX,
  '  // SCAFFOLD:ADD_FETCHER_ENTRY_ABOVE',
  `  ${camel}: fetch${pascal}Snapshot,\n`,
);
insertBefore(
  CLIENTS_INDEX,
  '  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE',
  `  ${camel}: ${pascal.toUpperCase()}_ACTIONS,\n`,
);

insertBefore(
  RENDERER_SERVICES,
  '// SCAFFOLD:ADD_PAGE_IMPORT_ABOVE',
  `import { ${pascal}Page } from './pages/${pascal}Page';\n`,
);
insertBefore(
  RENDERER_SERVICES,
  '  // SCAFFOLD:ADD_SERVICE_ENTRY_ABOVE',
  `  {
    id: '${id}',
    label: '${label}',
    icon: '${icon}',
    description: 'TODO: fill in a one-line description',
    page: ${pascal}Page,
  },\n`,
);

insertBefore(
  SNAPSHOT,
  '  // SCAFFOLD:ADD_SNAPSHOT_SLICE_BELOW',
  `  ${camel}: {
    items: [] as { id: string; name: string }[],
  },\n\n`,
);

console.log('');
console.log(`scaffold: done. next steps:`);
console.log(`  - replace TODO placeholders in src/main/clients/${id}.ts (URL, response shape)`);
console.log(`  - replace TODO description in src/renderer/services.ts`);
console.log(`  - run: npm run typecheck && npm test`);
console.log(`  - run: npm run dev  (and click into ${label} tab)`);
