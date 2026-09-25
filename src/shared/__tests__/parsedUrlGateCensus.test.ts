/**
 * **解析してから判定する場所は、判定した物を使う** (2026-09-19 · パス 325)。
 *
 * 法則 `checked-equals-used` (`ontology/laws.ts`) は パス 291 / 298 / 299 / 301 で 4 回学ばれているが、
 * 執行者は 4 つとも**既に壊れて直した個所**の検査で、**母集団を数える機械が無かった**。
 * 「次に同じ形が生えたら鳴る」物が無いということである。
 *
 * ここでは `new URL(` を呼ぶ場所を src 全体から数え (実測 27 か所 / 20 ファイル)、1 行ずつ
 * **種類**と理由の台帳に載せる (**両方向** —— 台帳に無い行が出れば落ち、台帳の行が母集団から
 * 消えても落ちる)。種類は 5 つ:
 *
 * | 種類 | 意味 | 要求 |
 * |---|---|---|
 * | `value-gate` | 解析して判定し、**文字列を返す**関門 | 返り値が解析後の値であることを**振る舞いで**確かめる (下の表) |
 * | `predicate` | 真偽 / 種別だけを返す | 呼ぶ側が同じ文字列を使うので、字面の同一性は問わない |
 * | `pin` | 解析して送り先を絞り、**その後に通信する** | 通信に渡すのは解析後の値 (`u.href` / `base.origin`) |
 * | `internal` | 分類のための再解析。値は外へ出ない | なし |
 * | `display` | ホストだけを取り出して文へ入れる | なし (値は送らない) |
 *
 * ## パス 325 で実測して直した 3 件
 *
 * - `shared/scanTarget.ts` の `validateScanUrl` は `parsed` で protocol を見て **生の文字列**を返し、
 *   その生が VirusTotal へ送られていた (8 形のうち 5 形が解析後と食い違う)。**同じ形の value-gate 7 つのうち
 *   ここだけ**が生を返していた。
 * - `main/clients/github.ts` は `api.github.com` に pin した後 **生の `item.pull_request.url`** を fetch し、
 *   `main/clients/shopify.ts` の Discord webhook は `discord.com` に pin した後 **生の `webhookUrl`** へ POST していた。
 *   今日の送り先は一致する (`fetch` が同じ URL parser で解く) が、一致が「両側が同じ parser を使う」という
 *   **別の前提**に依っていた。**同じファイルの隣**の salesforce 同期は最初から `base.origin` を使っている。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';
import { validateScanUrl } from '../scanTarget';
import { externalUrlOrNull } from '../externalUrlGate';
import { normalizeProxyEndpoint } from '../proxyEndpoint';
import { normalizeAtlassianSiteResult } from '../atlassianSite';

const REPO = join(__dirname, '..', '..', '..');
const PARSE_CALL = /new URL\(/;

type Kind = 'value-gate' | 'predicate' | 'pin' | 'internal' | 'display';

interface Row {
  readonly file: string;
  /** その行に必ず在る綴り (行番号は動くので持たない)。 */
  readonly needle: string;
  readonly kind: Kind;
  readonly why: string;
}

const LEDGER: readonly Row[] = [
  { file: 'src/main/clients/atlassian.ts', needle: '/rest/api/3/project/search', kind: 'pin',
    why: '検証済みの site から要求 URL を組み、解析後の URL オブジェクトを使う' },
  { file: 'src/main/clients/github.ts', needle: 'new URL(item.pull_request.url)', kind: 'pin',
    why: 'api.github.com に絞り、fetch へ渡すのは u.href (パス 325 で生から変えた)' },
  { file: 'src/main/clients/shopify.ts', needle: 'new URL(webhookUrl)', kind: 'pin',
    why: 'discord.com に絞り、POST 先は u.href (パス 325 で生から変えた)' },
  { file: 'src/main/clients/shopify.ts', needle: 'new URL(instanceUrl)', kind: 'pin',
    why: '*.salesforce.com に絞り、要求 URL は base.origin から組む' },
  { file: 'src/main/main.ts', needle: 'new URL(url).origin', kind: 'value-gate',
    why: '窓の遷移の判定に使う origin —— 解析後の値そのもの' },
  { file: 'src/main/oauth.ts', needle: 'parsed = new URL(url)', kind: 'value-gate',
    why: 'パス 291: 端点の関門。shell へ渡すのは解析後の値' },
  { file: 'src/main/oauth.ts', needle: "new URL(reqUrl, 'http://127.0.0.1')", kind: 'internal',
    why: 'loopback の要求行を解くための再解析 (基準は定数)' },
  { file: 'src/renderer/network/proxy.ts', needle: 'parsed = new URL(targetUrl)', kind: 'predicate',
    why: '送り先が private / reserved かを判定するだけ' },
  { file: 'src/renderer/oauth/callbackPaste.ts', needle: 'parsed = new URL(trimmed)', kind: 'predicate',
    why: '貼り付けられた URI の種別 (callback / no-callback) を返すだけ' },
  { file: 'src/renderer/oauth/pkce.ts', needle: 'new URL(trimmed).searchParams', kind: 'value-gate',
    why: '解析後の searchParams から code / state を取る (生の文字列は読まない)' },
  { file: 'src/renderer/web-shim.ts', needle: 'redirectRefusal(res, url, new URL(url).host)', kind: 'display',
    why: '転送を断る文に載せる相手の名前 (ホストだけ)' },
  { file: 'src/shared/ai/providers.ts', needle: 'const u = new URL(base)', kind: 'predicate',
    why: '平文で資格情報を送ってよい相手かを判定するだけ' },
  { file: 'src/shared/aiEndpoint.ts', needle: 'parsed = new URL(text)', kind: 'value-gate',
    why: '解析後の protocol / host / pathname から base を組み直して返す' },
  { file: 'src/shared/atlassianSite.ts', needle: 'parsed = new URL(raw)', kind: 'value-gate',
    why: '.atlassian.net を確かめ、返すのは解析後の hostname から組んだ site' },
  { file: 'src/shared/externalUrlGate.ts', needle: 'parsed = new URL(url)', kind: 'value-gate',
    why: '不変条件 #5。OS へ渡すのは解析後の href' },
  { file: 'src/shared/httpLimits.ts', needle: 'new URL(location, requestUrl).host', kind: 'display',
    why: '転送を断る文に載せる行き先のホストだけ' },
  { file: 'src/shared/imageUrlGate.ts', needle: 'parsed = new URL(normalized)', kind: 'value-gate',
    why: 'パス 299。<img src> へ渡すのは解析後の href' },
  { file: 'src/shared/imageUrlGate.ts', needle: 'isPrivateOrReservedTarget(new URL(src))', kind: 'predicate',
    why: 'パス 300。内側を向いた送り先かを判定するだけ' },
  { file: 'src/shared/ollama.ts', needle: 'u = new URL(base)', kind: 'predicate',
    why: '許してよい接続先かを判定するだけ' },
  { file: 'src/shared/ollama.ts', needle: 'u = new URL(withScheme)', kind: 'value-gate',
    why: '解析後の protocol / host から base を組み直して返す' },
  { file: 'src/shared/privateTarget.ts', needle: 'isPrivateOrReservedTarget(new URL(`http://${embeddedV4}/`))', kind: 'internal',
    why: 'IPv4 埋め込み IPv6 を分類するための再解析。通信にも画面にも出ない' },
  { file: 'src/shared/privateTarget.ts', needle: 'isPrivateOrReservedTarget(new URL(`http://${nat64Or6to4}/`))', kind: 'internal',
    why: 'NAT64 / 6to4 の埋め込みの再解析。同上' },
  { file: 'src/shared/proxyEndpoint.ts', needle: 'parsed = new URL(text)', kind: 'value-gate',
    why: '返すのは parsed.href' },
  { file: 'src/shared/scanTarget.ts', needle: 'parsed = new URL(url)', kind: 'value-gate',
    why: 'パス 325 で生の文字列から parsed.href へ変えた —— VirusTotal へ送るのは調べた物' },
  { file: 'src/shared/scanTarget.ts', needle: 'const parsed = new URL(checked.url)', kind: 'internal',
    why: '関門を通った URL の危険 (userinfo / 秘密の引数) を読むための再解析' },
  { file: 'src/shared/updateCheck.ts', needle: 'parsed = new URL(raw)', kind: 'predicate',
    why: 'GitHub の release URL かを判定するだけ' },
];

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

export function parseSites(files: readonly string[]): Site[] {
  const out: Site[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    stripComments(readOriginalSource(abs)).split('\n').forEach((line, i) => {
      if (PARSE_CALL.test(line)) out.push({ file, line: i + 1, text: line });
    });
  }
  return out;
}

const SITES = parseSites(shippedSources());

describe('URL を解析する場所の母集団 (パス 325)', () => {
  it('走査が生きている (床: 20 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(20);
  });

  it('★ 母集団と台帳は両方向に一致する', () => {
    const unlisted = SITES.filter((s) => !LEDGER.some((r) => r.file === s.file && s.text.includes(r.needle)));
    expect(unlisted.map((s) => `${s.file}:${s.line} ${s.text.trim()}`)).toEqual([]);
    const stale = LEDGER.filter((r) => !SITES.some((s) => s.file === r.file && s.text.includes(r.needle)));
    expect(stale.map((r) => `${r.file} ${r.needle}`)).toEqual([]);
  });

  it('台帳の理由は空でない', () => {
    for (const r of LEDGER) expect(r.why.length).toBeGreaterThan(10);
  });

  it('標本: 走査は `new URL(` の行に当たり、コメント行には当たらない', () => {
    expect(PARSE_CALL.test('    parsed = new URL(raw);')).toBe(true);
    expect(PARSE_CALL.test('  const u = new URL(`http://${raw}`);')).toBe(true);
    expect(PARSE_CALL.test('  const u = URL.createObjectURL(blob);')).toBe(false);
  });
});

/**
 * `value-gate` の**振る舞い**の表。`raw` は解析すると別の文字列になる形で、
 * 関門が通したときの返り値が**解析後**の側であることを確かめる。
 * 生を返していれば `raw` 側と一致してしまい、ここが落ちる。
 */
const VALUE_GATE_BEHAVIOR: readonly {
  readonly name: string;
  readonly raw: string;
  readonly expected: string;
  readonly run: (input: string) => string | null;
}[] = [
  {
    name: 'validateScanUrl',
    raw: 'HTTPS://Example.COM/X',
    expected: 'https://example.com/X',
    run: (i) => { const r = validateScanUrl(i); return r.ok ? r.url : null; },
  },
  {
    name: 'externalUrlOrNull',
    raw: 'HTTPS://Example.COM/X',
    expected: 'https://example.com/X',
    run: (i) => externalUrlOrNull(i),
  },
  {
    name: 'normalizeProxyEndpoint',
    raw: 'HTTPS://Example.COM/X',
    expected: 'https://example.com/X',
    run: (i) => { const r = normalizeProxyEndpoint(i); return r.ok ? r.url : null; },
  },
  {
    name: 'normalizeAtlassianSiteResult',
    raw: 'HTTPS://Acme.ATLASSIAN.net/wiki',
    expected: 'https://acme.atlassian.net',
    run: (i) => { const r = normalizeAtlassianSiteResult(i); return r.ok ? r.site : null; },
  },
];

describe('value-gate は解析後の値を返す (振る舞いで確かめる)', () => {
  it.each(VALUE_GATE_BEHAVIOR.map((b) => [b.name, b] as const))('★ %s', (_name, b) => {
    expect(b.run(b.raw)).toBe(b.expected);
    // 標本: この入力は生と解析後が食い違う (食い違わない入力では対照にならない)。
    expect(b.raw).not.toBe(b.expected);
  });

  /*
   * 種類ごとの実測値を留める。**数は機械が持つ** —— 散文に書くと必ず古びる
   * (このリポジトリが繰り返し直してきた形)。行が増減したらここが鳴り、
   * 書き換えるときに「どの種類が増えたのか」を読むことになる。
   */
  it('★ 種類ごとの行数は実測どおり (台帳 26 行が 27 か所を覆う)', () => {
    const byKind = (k: Row['kind']): number => LEDGER.filter((r) => r.kind === k).length;
    expect({
      'value-gate': byKind('value-gate'),
      predicate: byKind('predicate'),
      pin: byKind('pin'),
      internal: byKind('internal'),
      display: byKind('display'),
    }).toEqual({ 'value-gate': 10, predicate: 6, pin: 4, internal: 4, display: 2 });
    expect(LEDGER).toHaveLength(26);
    // web-shim の同じ綴りの 2 行が 1 行の台帳に対応するので、か所は台帳より 1 多い。
    expect(SITES).toHaveLength(27);
    expect(VALUE_GATE_BEHAVIOR.length).toBeGreaterThanOrEqual(4);
  });
});

describe('pin は解析後の値で通信する (原文)', () => {
  it('★ github の PR 詳細は u.href を取りに行く (生の item.pull_request.url ではない)', () => {
    const src = readOriginalSource(join(REPO, 'src/main/clients/github.ts'));
    expect(src).toContain('jsonFetch<PullDetail>(prUrl.href, init, fetchCtx)');
    // 裸のローカル変数にしない —— `lint:network-targets` の BARE_SEND は
    // プロパティ参照だけを拾うので、名前にすると台帳の視野から外れる (パス 325 で実測)。
    expect(src).not.toContain('jsonFetch<PullDetail>(target,');
    expect(src).not.toContain('jsonFetch<PullDetail>(item.pull_request.url');
    // 標本: 不在の主張の綴りは、直す前の行に当たる
    expect('const pr = await jsonFetch<PullDetail>(item.pull_request.url, init, fetchCtx);').toContain(
      'jsonFetch<PullDetail>(item.pull_request.url',
    );
  });

  it('★ shopify の Discord webhook は u.href へ POST する (生の webhookUrl ではない)', () => {
    const src = readOriginalSource(join(REPO, 'src/main/clients/shopify.ts'));
    expect(src).toContain('    u.href,');
    expect(src).not.toContain('    webhookUrl,\n');
    expect('  await postExpectOk(\n    webhookUrl,\n').toContain('    webhookUrl,\n');
  });
});
