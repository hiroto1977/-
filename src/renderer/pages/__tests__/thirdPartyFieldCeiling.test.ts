/** @vitest-environment jsdom */
/**
 * **第三者の文字列は、画面の欄に入る前に天井を通る。** (2026-09-22 · パス 411)
 *
 * パス 408 は Ollama のモデル一覧についてこれを閉じ、`shared/ollama.ts` の私有の
 * `modelDetail` (64 字) で直した。**その形が他の画面にも在った。**
 * 実測 (2026-09-22 ・ 直す前・実物の client に 200,000 字を 1 行ぶん食わせて描く):
 *
 * | 画面 | 素通りした欄 | 画面の総文字数 |
 * | --- | --- | ---: |
 * | Cloudflare | `name` / `status` / `plan` / `accountName` / `nameServers` ×2 | **1,400,077** |
 * | GitHub | `title` / `state` / `head` / `base` / 利用者の `name` / `company` | **1,400,096** |
 *
 * `DataList` は**件数**の天井 (`MAX_LIST_ITEMS` 2000) を持つが、**1 件の長さ**の
 * 天井は持たない —— だから 1 行で画面が 1.4M 字になる。
 *
 * ★ **相手は「乗っ取られた proxy」でありうる** —— ブラウザ版の Cloudflare は
 *   利用者の BYO Worker を通る (`assistantLimits.ts` が名指ししている脅威)。
 *   GitHub の PR タイトルとブランチ名は、**フォークから PR を開ける誰でも**決められる。
 *
 * 背骨は**振る舞い**で、綴りの走査はその横の網である (法則 `mention-vs-declaration`:
 * 定数が在ることは門が在ることではない)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CloudflarePage } from '../CloudflarePage';
import { GithubPage } from '../GithubPage';
import { fetchCloudflareSnapshot } from '../../../main/clients/cloudflare';
import { fetchGithubSnapshot } from '../../../main/clients/github';
import { MAX_DISPLAY_FIELD_CHARS, displayField } from '../../../shared/apiResponse';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { waitForText } from '../../__tests__/jsdomWait';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const BIG = 'x'.repeat(200_000);

function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string, Page: ComponentType, data: unknown, waitFor: string): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([id]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

/** 1 行ぶんの欄をすべて長くしても、画面はこの範囲に収まる。 */
const SCREEN_BOUND = 20_000;

function cfBody(v: string): unknown {
  return {
    success: true,
    result: [
      {
        id: 'z1',
        name: v,
        status: v,
        plan: { name: v },
        account: { name: v },
        name_servers: [v, v],
        development_mode: 0,
      },
    ],
  };
}

function ghBodies(v: string): readonly unknown[] {
  const pr = {
    number: 1,
    title: v,
    state: v,
    draft: false,
    head: { ref: v },
    base: { ref: v },
    updated_at: '2026-05-11T09:09:04Z',
    html_url: 'https://github.com/a/b/pull/1',
  };
  return [
    {
      login: 'l',
      name: v,
      company: v,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/l',
      public_repos: 1,
      followers: 1,
    },
    { items: [{ ...pr, pull_request: { url: 'https://api.github.com/repos/a/b/pulls/1' } }] },
    pr,
  ];
}

describe('Cloudflare — 1 行の欄をすべて長くしても画面は膨らまない', () => {
  it('★ 直す前は 1,400,077 字だった (今は天井の範囲)', async () => {
    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: replying([cfBody(BIG)]) } as never);
    for (const field of ['name', 'status', 'plan', 'accountName'] as const) {
      expect(snap.zones[0]![field].length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    }
    for (const ns of snap.zones[0]!.nameServers) {
      expect(ns.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    }
    const t = await mount('cloudflare', CloudflarePage, snap, 'Zones');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
    // 切ったことは述べる (絞ることと述べることは対)。
    expect(t).toContain('…');
  });

  it('★ 読める値の答えは 1 つも変わらない', async () => {
    const snap = await fetchCloudflareSnapshot({
      token: 't',
      fetch: replying([cfBody('example.com')]),
    } as never);
    expect(snap.zones[0]!.name).toBe('example.com');
    expect(snap.zones[0]!.plan).toBe('example.com');
    expect(snap.zones[0]!.nameServers).toEqual(['example.com', 'example.com']);
    const t = await mount('cloudflare', CloudflarePage, snap, 'example.com');
    expect(t).toContain('example.com');
    expect(t).not.toContain('example.com…');
  });
});

describe('GitHub — 同じ形', () => {
  it('★ 直す前は 1,400,096 字だった (今は天井の範囲)', async () => {
    const snap = await fetchGithubSnapshot({ token: 't', fetch: replying(ghBodies(BIG)) } as never);
    for (const field of ['title', 'state', 'head', 'base'] as const) {
      expect(snap.pullRequests[0]![field].length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    }
    expect(snap.user.name.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(snap.user.company.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    const t = await mount('github', GithubPage, snap, 'Pull Requests');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
    expect(t).toContain('…');
  });

  it('★ 読める値の答えは 1 つも変わらない', async () => {
    const snap = await fetchGithubSnapshot({ token: 't', fetch: replying(ghBodies('main')) } as never);
    expect(snap.pullRequests[0]!.head).toBe('main');
    expect(snap.pullRequests[0]!.base).toBe('main');
    expect(snap.user.company).toBe('main');
    const t = await mount('github', GithubPage, snap, 'Pull Requests');
    expect(t).toContain('main → main');
  });
});

describe('displayField そのもの', () => {
  it('非文字列は空 (`?? \'\'` は型を見ないので素通りしていた)', () => {
    for (const v of [42, true, null, undefined, {}, ['a'], Symbol.iterator]) {
      expect(displayField(v as never)).toBe('');
    }
  });

  it('天井ちょうどは切らず、+1 で切って … を付ける', () => {
    const exact = 'a'.repeat(MAX_DISPLAY_FIELD_CHARS);
    expect(displayField(exact)).toBe(exact);
    expect(displayField(exact + 'a')).toBe(exact + '…');
  });

  it('★ サロゲート対を割らない (絵文字で数える)', () => {
    const emoji = '😀'.repeat(MAX_DISPLAY_FIELD_CHARS + 10);
    const out = displayField(emoji);
    expect(out).toBe('😀'.repeat(MAX_DISPLAY_FIELD_CHARS) + '…');
    expect(out).not.toContain('�');
  });
});

// --- 母集団の走査 (両方向) ------------------------------------------------

/**
 * 天井を通す欄と、その client。**振る舞いの検査が背骨で、ここはその横の網** ——
 * 新しい欄が足された日に「天井を通せ」と言うために在る。
 *
 * ★ **この台帳は「名前」しか見ない、という限界を測って書く** —— 対照 C
 * (github の PR の `title` / `state` を素へ戻す) を回すと、**落ちたのは
 * 振る舞いの 1 件だけ**で台帳は通った。同じ欄名が `fallback` の側にも在り、
 * そちらは天井を通したままだからである。**2 か所のうち 1 か所が外れる形は
 * 名前の台帳では映らない** —— 映すのは画面の大きさを見る側である。
 */
const CAPPED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'cloudflare.ts': ['name', 'status', 'plan', 'accountName', 'nameServers'],
  'github.ts': ['title', 'state', 'head', 'base', 'login', 'name', 'company'],
};

/**
 * `欄: …displayField(…)…,` の**欄の名前**を拾う。注記は先に落とす ——
 * この検査ファイル自身が説明の中で同じ綴りを書くので、注記を読んだままだと
 * 母集団が説明文で膨らむ (法則 `mention-vs-declaration`)。
 *
 * ★ **代入の式は 1 行とは限らない** —— 最初に書いた針は
 * `欄: displayField(` だけを見ており、`nameServers:
 * optionalStringArray(…).map((ns) => displayField(ns))` を**見落とした**
 * (自分の台帳がその場で捕まえた)。括弧の深さを数えて、その欄の式が
 * 終わるところまでを窓にする。
 */
export function cappedAssignments(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  for (const m of code.matchAll(/([A-Za-z0-9_]+)\s*:\s*/g)) {
    const name = m[1] as string;
    const start = m.index + m[0].length;
    let depth = 0;
    let end = code.length;
    for (let i = start; i < code.length; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) {
          end = i;
          break;
        }
        depth--;
      } else if ((c === ',' || c === ';') && depth === 0) {
        end = i;
        break;
      }
    }
    /*
     * ★ **内側の欄だけを数える** —— 2 度目の針は広すぎて、親の欄
     * (`zones: zones.map((z) => ({ name: displayField(…) }))` の `zones`) まで
     * 拾った (これも自分の台帳がその場で捕まえた)。値が**物のリテラルを開く**
     * なら、その中に在る `displayField(` は子の欄のものである。
     */
    const span = code.slice(start, end);
    const at = span.indexOf('displayField(');
    const brace = span.indexOf('{');
    if (at >= 0 && (brace < 0 || at < brace)) out.push(name);
  }
  return out;
}

describe('母集団: 天井を通す欄', () => {
  it('走査は実際にこの形を拾う (規則が死んでいないことの標本)', () => {
    const sample = [
      '/** 注記の中の `foo: displayField(` は数えない。 */',
      'const x = {',
      '  alpha: displayField(v.alpha),',
      '  beta: v.beta ?? "",',
      '  gamma:   displayField(v.gamma),',
      '  delta: rows(v).map(',
      '    (ns) => displayField(ns),',
      '  ),',
      '  epsilon: other(v).map((n) => n + 1),',
      '  zeta: rows(v).map((r) => ({ inner: displayField(r.inner) })),',
      '};',
    ].join('\n');
    // ★ 複数行の式 (delta) も拾い、通っていない欄 (beta / epsilon) は拾わず、
    //   親の欄 (zeta) ではなく**中の欄 (inner)** を拾う。
    expect(cappedAssignments(sample)).toEqual(['alpha', 'gamma', 'delta', 'inner']);
  });

  for (const [file, fields] of Object.entries(CAPPED_FIELDS)) {
    it(`${file}: 台帳の欄はすべて天井を通る`, () => {
      const found = cappedAssignments(
        readOriginalSource(path.join(__dirname, '..', '..', '..', 'main', 'clients', file)),
      );
      expect(fields.filter((f) => !found.includes(f))).toEqual([]);
    });

    it(`${file}: 天井を通る欄はすべて台帳に在る (逆向き)`, () => {
      const found = cappedAssignments(
        readOriginalSource(path.join(__dirname, '..', '..', '..', 'main', 'clients', file)),
      );
      expect([...new Set(found)].filter((f) => !fields.includes(f))).toEqual([]);
    });

    it(`${file}: 画面の欄を素の \`?? ''\` で受けない`, () => {
      const src = readOriginalSource(
        path.join(__dirname, '..', '..', '..', 'main', 'clients', file),
      );
      const code = stripComments(src);
      const bare = [...code.matchAll(/([A-Za-z0-9_]+)\s*:\s*[^,;\n]*\?\?\s*''/g)].map(
        (m) => m[1] as string,
      );
      expect(bare.filter((f) => fields.includes(f))).toEqual([]);
    });
  }
});
