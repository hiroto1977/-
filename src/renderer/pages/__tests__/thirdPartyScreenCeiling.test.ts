/** @vitest-environment jsdom */
/**
 * **第三者の応答が画面を膨らませない。** (2026-09-22 · パス 415)
 *
 * パス 408 / 411 / 413 / 414 は**人が 1 画面ずつ**見つけた (ollama · cloudflare +
 * github · ms365 + youtube · 書き込みの結果)。4 回続けて同じ家系から出たので、
 * **面の側から一斉に測る**形にした (パス 389 が空欄の理由について採ったのと同じ手)。
 *
 * 不変条件は 1 つ —— **相手が 1 欄に 200,000 字を返しても、画面はこの範囲に収まる。**
 * 天井は client の境界に在る (`shared/apiResponse.ts` の `displayField`) ので、
 * ここが見るのは**実物の client を通した振る舞い**である。
 *
 * 実測 (2026-09-22 ・ 直す前 → 直した後・実物の client に 200,000 字を食わせて描く):
 *
 * | 画面 | 直す前 | 直した後 |
 * | --- | ---: | ---: |
 * | **atlassian** | **800,279** | 1,307 |
 * | **gmail** | **401,170** | 1,647 |
 * | **calendar** | **400,946** | 1,451 |
 * | **drive** | **400,909** | 1,423 |
 * | **slack** | **400,313** | 790 |
 * | **freee** | **200,315** | 572 |
 * | **wordpress** | **200,291** | 548 |
 * | **canva** | **200,181** | 438 |
 * | **notion** | **200,089** | 346 |
 * | **base** | **200,050** | 307 |
 *
 * ★ **atlassian はパス 409 / 413 / 414 が 3 度続けて「振る舞いで確かめていない」と
 *   残していた所**で、理由はどれも「資格情報の関門に先に当たる」だった。実際に要るのは
 *   `{email, token, site}` の JSON と **`https://` で始まる site** だけで、私の見本が
 *   スキームを落としていただけである —— **測れなかったのではなく、当てていなかった**。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readOriginalDir, readOriginalSource } from '../../../shared/__tests__/originalSource';

const BIG = 'x'.repeat(200_000);

/** 1 欄に 200,000 字が来ても、画面はこの範囲に収まる。 */
const SCREEN_BOUND = 20_000;

function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => { r.unmount(); });
  }
  container.remove();
  vi.restoreAllMocks();
});

async function drawWith(id: string, Page: ComponentType, data: unknown): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    // **繋がっている**と言わないと画面は同梱の見本を描き、相手の応答が届かない。
    listConfigured: () => Promise.resolve([id]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => { root!.render(createElement(Page)); });
  for (let i = 0; i < 8; i += 1) await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
  return container.textContent ?? '';
}

/** 実物の client に長い応答を食わせて、その戻りで画面を描く 1 件。 */
interface Sweep {
  readonly id: string;
  readonly token: string;
  readonly bodies: readonly unknown[];
  readonly load: (ctx: { token: string; fetch: typeof fetch }) => Promise<unknown>;
  readonly page: () => Promise<ComponentType>;
  /** 相手の行が本当に届いたことを示す印 (見本が的を外していたら鳴る)。 */
  readonly landed: string;
}

const SWEEPS: readonly Sweep[] = [
  {
    id: 'atlassian',
    token: JSON.stringify({ email: 'a@b.c', token: 't', site: 'https://ex.atlassian.net' }),
    bodies: [{ values: [{ key: BIG, name: BIG, projectTypeKey: BIG, style: BIG }] }],
    load: async (c) => (await import('../../../main/clients/atlassian')).fetchAtlassianSnapshot(c as never),
    page: async () => (await import('../AtlassianPage')).AtlassianPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'base',
    token: 't',
    bodies: [{ items: [{ item_id: 1, title: BIG, price: 100, stock: 2, visible: 1 }] }],
    load: async (c) => (await import('../../../main/clients/base')).fetchBaseSnapshot(c as never),
    page: async () => (await import('../BasePage')).BasePage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'calendar',
    token: 't',
    bodies: [
      { items: [{ id: 'c1', summary: BIG, primary: true, timeZone: BIG }] },
      { items: [{ id: 'e1', summary: BIG, start: { dateTime: '2026-01-01T10:00:00Z' }, end: { dateTime: '2026-01-01T11:00:00Z' } }] },
    ],
    load: async (c) => (await import('../../../main/clients/calendar')).fetchCalendarSnapshot(c as never),
    page: async () => (await import('../CalendarPage')).CalendarPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'canva',
    token: 't',
    bodies: [
      { items: [{ design: { id: 'd1', title: BIG, page_count: 1, updated_at: 1767225600, urls: { view_url: 'https://x.example' } } }] },
      { items: [{ id: BIG }] },
    ],
    load: async (c) => (await import('../../../main/clients/canva')).fetchCanvaSnapshot(c as never),
    page: async () => (await import('../CanvaPage')).CanvaPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'cursor',
    token: 't',
    bodies: [
      { teamMembers: [{ name: BIG, email: BIG, role: BIG }] },
      { data: [{ date: 1767225600000, isActive: true, mostUsedModel: BIG }] },
      { teamMemberSpend: [{ name: BIG, email: BIG, role: BIG, spendCents: 100 }] },
    ],
    load: async (c) => (await import('../../../main/clients/cursor')).fetchCursorSnapshot(c as never),
    page: async () => (await import('../CursorPage')).CursorPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'drive',
    token: 't',
    bodies: [{ files: [{ id: 'f1', name: BIG, mimeType: BIG, modifiedTime: '2026-01-01T00:00:00Z' }] }],
    load: async (c) => (await import('../../../main/clients/drive')).fetchDriveSnapshot(c as never),
    page: async () => (await import('../DrivePage')).DrivePage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'freee',
    token: 't',
    bodies: [
      { companies: [{ id: 1, display_name: BIG, name: BIG }] },
      { deals: [{ id: 1, issue_date: '2026-01-01', amount: 100, type: 'income' }] },
    ],
    load: async (c) => (await import('../../../main/clients/freee')).fetchFreeeSnapshot(c as never),
    page: async () => (await import('../FreeePage')).FreeePage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'gmail',
    token: 't',
    bodies: [
      { messages: [{ id: 'm1', threadId: 't1' }] },
      { id: 'm1', threadId: 't1', labelIds: ['UNREAD'], payload: { headers: [{ name: 'Subject', value: BIG }, { name: 'From', value: BIG }] } },
    ],
    load: async (c) => (await import('../../../main/clients/gmail')).fetchGmailSnapshot(c as never),
    page: async () => (await import('../GmailPage')).GmailPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'notion',
    token: 't',
    bodies: [{ results: [{ id: 'p1', object: BIG, url: 'https://x.example', last_edited_time: '2026-01-01T00:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: BIG }] } } }] }],
    load: async (c) => (await import('../../../main/clients/notion')).fetchNotionSnapshot(c as never),
    page: async () => (await import('../NotionPage')).NotionPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'slack',
    token: 't',
    bodies: [
      { ok: true, channels: [{ id: 'C1', name: BIG, num_members: 3, is_private: false, topic: { value: BIG }, purpose: { value: BIG } }] },
      { ok: true, team: { name: BIG, domain: 'ex' } },
    ],
    load: async (c) => (await import('../../../main/clients/slack')).fetchSlackSnapshot(c as never),
    page: async () => (await import('../SlackPage')).SlackPage,
    landed: 'xxxxxxxxxx',
  },
  {
    id: 'wordpress',
    token: 't',
    bodies: [{ sites: [{ ID: 1, name: BIG, description: BIG, URL: 'https://x.example', plan: { product_slug: 'free' }, is_private: false, last_updated: '2026-01-01T00:00:00Z' }] }],
    load: async (c) => (await import('../../../main/clients/wordpress')).fetchWordPressSnapshot(c as never),
    page: async () => (await import('../WordPressPage')).WordPressPage,
    landed: 'xxxxxxxxxx',
  },
];

describe('第三者の応答が画面を膨らませない (パス 415)', () => {
  for (const s of SWEEPS) {
    it(`★ ${s.id}: 1 欄に 200,000 字でも画面は ${SCREEN_BOUND} 字未満`, async () => {
      const data = await s.load({ token: s.token, fetch: replying(s.bodies) });
      const text = await drawWith(s.id, await s.page(), data);
      // **見本が的に当たったことを先に確かめる** —— 行が届いていなければ
      // 「短い画面」は天井のおかげではない (パス 415 の atlassian がその形だった)。
      expect(text, `${s.id}: 相手の行が画面に届いていない (見本が的を外している)`).toContain(s.landed);
      expect(text.length, `${s.id} の画面が膨らんだ`).toBeLessThan(SCREEN_BOUND);
    });
  }
});

// --- 母集団 (両方向) -------------------------------------------------------

const CLIENTS_DIR = path.resolve(__dirname, '../../../main/clients');

/**
 * 網の口を持つ client。**針は広く採る** —— `jsonFetch` だけを数えると
 * `ollama.ts` (自前の `fetchFn`) と `business.ts` / `kpi.ts` (注入された
 * `fetch()` メソッド) が母集団から落ちる。パス 412 で同じ家系を踏んだので、
 * 広い針 + 理由つきの分類にした (落ちるより多く拾って、人が理由を書く)。
 */
function networkClients(): string[] {
  const out: string[] = [];
  for (const f of readOriginalDir(CLIENTS_DIR).filter((n) => n.endsWith('.ts')).sort()) {
    const src = readOriginalSource(path.join(CLIENTS_DIR, f));
    if (/\b(?:jsonFetch|jsonFetchAny|apiFetch|fetchViaProxy|readBodyWithCap)\b|\bfetch\(/.test(src)) out.push(f);
  }
  return out;
}

/** 1 本ずつの扱いと理由。**両方向**で、母集団に入れば「どれか書け」と鳴る。 */
const ROLE: Readonly<Record<string, string>> = {
  'atlassian.ts': 'swept-here',
  'base.ts': 'swept-here',
  'calendar.ts': 'swept-here',
  'canva.ts': 'swept-here',
  'cursor.ts': 'swept-here',
  'drive.ts': 'swept-here',
  'freee.ts': 'swept-here',
  'gmail.ts': 'swept-here',
  'notion.ts': 'swept-here',
  'slack.ts': 'swept-here',
  'wordpress.ts': 'swept-here',
  'cloudflare.ts': 'swept-elsewhere: thirdPartyFieldCeiling.test.ts → clients/cloudflare (パス 411)',
  'github.ts': 'swept-elsewhere: thirdPartyFieldCeiling.test.ts → clients/github (パス 411)',
  'microsoft-365.ts': 'swept-elsewhere: ms365AndYoutubeFields.test.ts → clients/microsoft-365 (パス 413)',
  'youtube.ts': 'swept-elsewhere: ms365AndYoutubeFields.test.ts → clients/youtube (パス 413)',
  // ★ 名指しするのは**漏斗**である —— main の ollama はパス 407 で
  //   `shared/ollama` の `normalizeModels` を通るようになったので、
  //   掃いている検査が読むのはその共有側である (client を直接は読まない)。
  'ollama.ts': 'swept-elsewhere: ollamaModelMetaOnScreen.test.ts → shared/ollama (パス 407 / 408)',
  'security.ts': '画面へ出る第三者の文字列を持たない (VirusTotal / HIBP の答えは件数と判定で、文言は shared/api/security.ts の定数)',
  'shopify.ts': 'fetchShopifySnapshot は STUB を返し網を読まない (書き込みの応答はパス 414 の createdResponseFields が見る)',
  'business.ts': '網の口は助言 1 本で、応答は capAssistantReply と advisorResponseLimits が切る (一覧は注入された局所の source)',
  'kpi.ts': 'source.fetch() は注入された局所の読み (網の口ではない)',
  'emotions.ts': '保管した記録の読み (第三者ではない)。AI の返事は capAssistantReply が切る',
  'skills.ts': 'ローカルの skill ファイルの読み。AI の返事は capAssistantReply が切る',
  'types.ts': 'client ではなく、網の口そのもの (jsonFetch / readBodyWithCap の実装)',
};

describe('母集団 (パス 415)', () => {
  it('★ 走査が生きている (網の口を持つ client が床を満たす)', () => {
    expect(networkClients().length).toBeGreaterThanOrEqual(20);
  });

  it('★ 網の口を持つ client は全部、扱いが書かれている (両方向)', () => {
    expect(networkClients()).toEqual(Object.keys(ROLE).sort());
  });

  it('★ swept-here の行は、この検査が実際に掃いている (両方向)', () => {
    const declared = Object.entries(ROLE).filter(([, v]) => v === 'swept-here').map(([k]) => k.replace(/\.ts$/, '')).sort();
    expect(SWEEPS.map((s) => s.id).sort()).toEqual(declared);
  });

  it('★ swept-elsewhere の行は、名指しした検査が実在して名指しの漏斗を読む', () => {
    let checked = 0;
    for (const [file, role] of Object.entries(ROLE)) {
      const m = /^swept-elsewhere: (\S+\.test\.ts) → (\S+)/.exec(role);
      if (m === null) continue;
      checked += 1;
      const src = readOriginalSource(path.resolve(__dirname, m[1]!));
      expect(src, `${m[1]} が ${m[2]} を読んでいない (${file} の掃除を名乗っている)`).toContain(m[2]!);
    }
    // 走査が空虚でない床 (`→` の形を壊すと 0 件になり、この it が黙る)。
    expect(checked).toBe(5);
  });

  it('★ 理由は空でない', () => {
    for (const [k, v] of Object.entries(ROLE)) expect(v.trim(), k).not.toBe('');
  });
});
