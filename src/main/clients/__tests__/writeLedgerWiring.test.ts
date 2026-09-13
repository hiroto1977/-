/**
 * **台帳が handler に本当に効いているか —— 12 家系を台帳から導いて総当たりする。**
 * (2026-09-09 · パス 111)
 *
 * `shared/__tests__/writeFieldLimits.test.ts` は「handler が `checkWriteFields(ctx.payload, 台帳)`
 * を**書いている**か」を字面で見る。ここは**動かして**見る —— 台帳の欄ごとに壊れた値を
 * 1 つ入れ、handler が**送らずに**欄の名前を添えて断ること、そして正しい payload なら
 * 送信に届くこと (対照) を、12 家系すべてで確かめる。壊れた値の形は規則の種類から
 * 導くので、欄が増えても検査は増えない。
 */
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS as slack } from '../slack';
import { ACTIONS as github } from '../github';
import { ACTIONS as calendar } from '../calendar';
import { ACTIONS as gmail } from '../gmail';
import { ACTIONS as drive } from '../drive';
import { ACTIONS as canva } from '../canva';
import { ACTIONS as notion } from '../notion';
import { ACTIONS as atlassian } from '../atlassian';
import { ACTIONS as wordpress } from '../wordpress';
import { ACTIONS as ms365 } from '../microsoft-365';
import { ACTIONS as cloudflare } from '../cloudflare';
import type { ActionMap } from '../types';
import {
  ATLASSIAN_ISSUE_FIELDS,
  CALENDAR_EVENT_FIELDS,
  CANVA_FOLDER_FIELDS,
  CLOUDFLARE_DNS_FIELDS,
  CLOUDFLARE_PURGE_FIELDS,
  DRIVE_FOLDER_FIELDS,
  GITHUB_ISSUE_FIELDS,
  GMAIL_DRAFT_FIELDS,
  MS365_EVENT_FIELDS,
  MS365_MAIL_FIELDS,
  NOTION_PAGE_FIELDS,
  SLACK_MESSAGE_FIELDS,
  WORDPRESS_POST_FIELDS,
  type WriteRule,
} from '../../../shared/writeFieldLimits';

const ATLASSIAN_TOKEN = JSON.stringify({ email: 'a@b.example', token: 't', site: 'https://x.atlassian.net' });

interface Family {
  readonly key: string;
  readonly actions: ActionMap;
  readonly action: string;
  readonly fields: Readonly<Record<string, WriteRule>>;
  /** 台帳を通る最小の payload (対照: これは送信に届く)。 */
  readonly valid: Record<string, unknown>;
  readonly token?: string;
}

const FAMILIES: readonly Family[] = [
  { key: 'slack/send-message', actions: slack, action: 'send-message', fields: SLACK_MESSAGE_FIELDS, valid: { channel: 'C1', text: 'やあ' } },
  { key: 'github/create-issue', actions: github, action: 'create-issue', fields: GITHUB_ISSUE_FIELDS, valid: { owner: 'o', repo: 'r', title: 't' } },
  { key: 'calendar/create-event', actions: calendar, action: 'create-event', fields: CALENDAR_EVENT_FIELDS, valid: { summary: 'S', start: '2026-07-01T10:00:00', end: '2026-07-01T11:00:00' } },
  { key: 'gmail/create-draft', actions: gmail, action: 'create-draft', fields: GMAIL_DRAFT_FIELDS, valid: { to: 'a@b.example', subject: 'S' } },
  { key: 'drive/create-folder', actions: drive, action: 'create-folder', fields: DRIVE_FOLDER_FIELDS, valid: { name: 'N' } },
  { key: 'canva/create-folder', actions: canva, action: 'create-folder', fields: CANVA_FOLDER_FIELDS, valid: { name: 'N' } },
  { key: 'notion/create-page', actions: notion, action: 'create-page', fields: NOTION_PAGE_FIELDS, valid: { parentPageId: 'p', title: 'T' } },
  { key: 'atlassian/create-issue', actions: atlassian, action: 'create-issue', fields: ATLASSIAN_ISSUE_FIELDS, valid: { projectKey: 'P', summary: 'S' }, token: ATLASSIAN_TOKEN },
  { key: 'wordpress/create-post-draft', actions: wordpress, action: 'create-post-draft', fields: WORDPRESS_POST_FIELDS, valid: { siteId: 's', title: 'T' } },
  { key: 'microsoft-365/send-mail', actions: ms365, action: 'send-mail', fields: MS365_MAIL_FIELDS, valid: { to: 'a@b.example', subject: 'S' } },
  { key: 'microsoft-365/create-event', actions: ms365, action: 'create-event', fields: MS365_EVENT_FIELDS, valid: { subject: 'S', start: '2026-07-01T10:00:00', end: '2026-07-01T11:00:00' } },
  { key: 'cloudflare/create-dns-record', actions: cloudflare, action: 'create-dns-record', fields: CLOUDFLARE_DNS_FIELDS, valid: { zoneId: 'z', type: 'A', name: 'n', content: '203.0.113.1' } },
  { key: 'cloudflare/purge-cache', actions: cloudflare, action: 'purge-cache', fields: CLOUDFLARE_PURGE_FIELDS, valid: { zoneId: 'z', purgeEverything: true } },
];

/** 規則の種類から「壊れた値」と、断りに出るべき言葉を導く。 */
function brokenValues(rule: WriteRule): readonly [unknown, RegExp][] {
  if ('kind' in rule) {
    if (rule.kind === 'integer') return [['x', /以上の整数で/], [0.5, /以上の整数で/]];
    if (rule.kind === 'flag') return [[1, /true \/ false で/], ['true', /true \/ false で/]];
    return [
      [5, /文字列で/],
      [[5], /文字列で/],
      [Array.from({ length: rule.maxItems + 1 }, () => 'a'), /件以内で/],
      [['a'.repeat(rule.item.max + 1)], /文字以内で/],
    ];
  }
  const out: [unknown, RegExp][] = [
    [99, /文字列で/],
    ['a'.repeat(rule.max + 1), /文字以内で/],
    ['a' + String.fromCharCode(0) + 'b', /制御文字/],
  ];
  if (!rule.multiline) out.push(['a\nb', /制御文字/]);
  if (rule.choices !== undefined) out.push(['bogus', /のいずれかで/]);
  return out;
}

async function run(f: Family, payload: Record<string, unknown>): Promise<{ fetchMock: ReturnType<typeof vi.fn>; error: unknown }> {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
  const error = await f.actions[f.action]!({ token: f.token ?? 't', fetch: fetchMock, payload }).then(
    () => null,
    (e: unknown) => e,
  );
  return { fetchMock, error };
}

describe('台帳の欄ごとに壊れた値を入れると、handler は送らずに欄の名前を添えて断る', () => {
  for (const f of FAMILIES) {
    it(`★ ${f.key}: 正しい payload は送信に届く (対照)`, async () => {
      const { fetchMock } = await run(f, f.valid);
      expect(fetchMock, `${f.key}: 正しい payload が送信に届かない (この検査の土台が崩れている)`).toHaveBeenCalled();
    });

    for (const [field, rule] of Object.entries(f.fields)) {
      it(`★ ${f.key}: ${field} が壊れていれば送らない`, async () => {
        for (const [value, words] of brokenValues(rule)) {
          const { fetchMock, error } = await run(f, { ...f.valid, [field]: value });
          expect(error, `${field}=${JSON.stringify(value)} を通した`).toBeInstanceOf(Error);
          expect((error as Error).message, `${field}=${JSON.stringify(value)} の断りが欄の名前を言わない`).toContain(field);
          expect((error as Error).message, `${field}=${JSON.stringify(value)} の断りの理由`).toMatch(words);
          expect(fetchMock, `${field}=${JSON.stringify(value)} を送ってしまった`).not.toHaveBeenCalled();
        }
        if (rule.required) {
          const { [field]: _dropped, ...without } = f.valid;
          const { fetchMock, error } = await run(f, without);
          expect((error as Error).message).toBe(`${field} は必須です`);
          expect(fetchMock).not.toHaveBeenCalled();
        }
      });
    }
  }
});
