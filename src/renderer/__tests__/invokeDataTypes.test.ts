/**
 * **`invoke<T>()` の T は台帳 (`shared/actionData.ts`) から読み、手で写さない。** (2026-09-09 · パス 116)
 *
 * `invoke<T>()` は T を検査しない。画面が戻り値の形を手で写すと、写しがずれても `tsc` は黙る ——
 * 同じ形をパス 62 / 80 / 105 / 113 / 114 で 5 度直した。直す前は画面の `invoke<{ … }>` が
 * 22 か所、画面の中の `interface …Result` が 6 つ在った。
 *
 * ここは 4 つを留める:
 *   1. renderer に `invoke<{` (手写しの形) が無い。
 *   2. `invoke<ActionData<'a/b'>>('a', 'b', …)` の組が引数と一致する (型を隣の action に付けない)。
 *      名前つきの型は台帳 (`NAMED_ALLOWED`) に理由つきで載る。
 *   3. 台帳の鍵はすべて main の `ACTIONS` に登録された組で、その handler は台帳の型を宣言する。
 *   4. ブラウザ版の双子 (`WEB_TWINS`) も台帳の型を宣言する。双子が無い鍵は理由つき。
 * 母集団 (呼び出し・登録された action) は走査で導く。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENTS, RENDERER, balanced, code, pageFiles } from '../pages/__tests__/aiEgressPairs.helpers';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** 台帳に載らない名前つきの型と、その理由 (残りは台帳へ移す)。 */
const NAMED_ALLOWED: Readonly<Record<string, string>> = {
  OllamaChatResult: 'shared/ollama.ts の型 (パス 113)。両ビルドの handler と画面が同じ物を読んでいる',
  ServiceAdvisorResponse: 'shared/advisorTypes.ts の型 (5 重の写しを 1 つにした物)',
  StrategyComparisonResult: 'ブラウザ版の双子 (stocksAnalysisWeb) の型をそのまま読む (パス 92)',
  RegisterResult: 'ブラウザ版の双子 (stocksWatchlistWeb) の型をそのまま読む',
  AdvisorResponse: 'StocksPage の手写し —— 株式アドバイザーの構造化応答は台帳の残り',
  BusinessAdvisorResponse: 'BusinessPage の手写し —— 台帳の残り',
  Analysis: 'EmotionsPage の手写し —— 台帳の残り',
  RecordEntryResponse: 'ServiceActionPanel の手写し —— 台帳の残り',
};

/** 引数が文字列リテラルでない呼び出し (組の一致を字面で確かめられない)。理由つき。 */
const NON_LITERAL_ALLOWED: Readonly<Record<string, string>> = {
  'pages/BusinessPage.tsx': 'action は html / md の変数。どちらも ExportFileResult (同じ形)',
};

/** 鍵 → ブラウザ版の双子 (ファイルと関数名)。 */
const WEB_TWINS: Readonly<Record<string, { file: string; fn: string }>> = {
  'atlassian/create-issue': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createAtlassianIssue' },
  'calendar/create-event': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCalendarEvent' },
  'canva/create-folder': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCanvaFolder' },
  'cloudflare/create-dns-record': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCloudflareDnsRecord' },
  'cloudflare/purge-cache': { file: 'renderer/data/saasWriteWeb.ts', fn: 'purgeCloudflareCache' },
  'drive/create-folder': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createDriveFolder' },
  'emotions/clear-history': { file: 'renderer/data/emotionsWeb.ts', fn: 'clearHistory' },
  'emotions/log-mood': { file: 'renderer/data/emotionsWeb.ts', fn: 'logMood' },
  'github/create-issue': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createGithubIssue' },
  'gmail/create-draft': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createGmailDraft' },
  'notion/create-page': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createNotionPage' },
  'security/check-email-breach': { file: 'renderer/data/saasWriteWeb.ts', fn: 'checkEmailBreach' },
  'security/scan-url': { file: 'renderer/data/saasWriteWeb.ts', fn: 'scanUrlVirusTotal' },
  'slack/send-message': { file: 'renderer/data/saasWriteWeb.ts', fn: 'sendSlackMessage' },
  'wordpress/create-post-draft': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createWordPressPostDraft' },
};

/** 双子が台帳の型を宣言していない鍵と、その理由。 */
const WEB_TWIN_NONE: Readonly<Record<string, string>> = {
  'assistant/chat': 'web-shim.ts の関数が ok({ text, model, provider }) を組む —— 注釈は残り',
  'assistant/chatAll': '同上 (ok({ answers }))',
  'assistant/providers': '同上 (ok({ providers }))',
  'business/export-dashboard': 'web-shim.ts は downloaded / 保管庫の sinks を足した上位集合を返す',
  'business/export-dashboard-md': '同上',
  'microsoft-365/create-event': 'ブラウザ版に双子が無い (Electron 版のみ)',
  'microsoft-365/send-mail': '同上',
  'skills/run-skill': 'ブラウザ版に双子が無い (Electron 版のみ)',
  'stocks/export-dashboard': 'web-shim.ts は downloaded / sinks を足した上位集合を返す',
  'stocks/export-dashboard-md': '同上',
  'teamradar/export-svg': '同上',
  'templates/export-template': '同上',
};

/** 台帳の鍵 ('service/action')。 */
function ledgerKeys(): string[] {
  const src = code(read('shared/actionData.ts'));
  const at = src.indexOf('export interface ActionDataMap {');
  const block = balanced(src, src.indexOf('{', at), '{', '}');
  return [...block.matchAll(/'([a-z0-9-]+\/[a-zA-Z0-9-]+)'\s*:/g)].map((m) => m[1]!);
}

/** main の ACTIONS に登録された組 → { file, handler }。 */
function registered(): Map<string, { file: string; handler: string }> {
  const out = new Map<string, { file: string; handler: string }>();
  for (const f of fs.readdirSync(CLIENTS).filter((n) => n.endsWith('.ts'))) {
    const src = code(fs.readFileSync(path.join(CLIENTS, f), 'utf8'));
    const at = src.search(/export\s+const\s+ACTIONS\s*:\s*ActionMap\s*=\s*\{/);
    if (at < 0) continue;
    const block = balanced(src, src.indexOf('{', at), '{', '}');
    for (const e of block.matchAll(
      /(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_]+))\s*(?::\s*([A-Za-z0-9_]+))?\s*,/g,
    )) {
      const action = e[1] ?? e[2] ?? e[3]!;
      out.set(`${f.replace(/\.ts$/, '')}/${action}`, { file: f, handler: e[4] ?? action });
    }
  }
  return out;
}

/** `function NAME(` から本体の `{` までの字面 (戻り値の型を含む)。無ければ ''。 */
function signature(src: string, fn: string): string {
  const m = new RegExp(`function\\s+${fn}\\s*\\(`).exec(src);
  if (!m) return '';
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '(' || ch === '<') depth += 1;
    else if (ch === ')' || ch === '>') depth -= 1;
    else if (ch === '{' && depth === 0) return src.slice(m.index, i);
  }
  return '';
}

interface Call {
  readonly file: string;
  readonly generic: string;
  readonly service: string | null;
  readonly action: string | null;
}

/** `invoke<…>(a, b, …)` の型引数と先頭 2 引数 (リテラルでなければ null)。 */
function invokeCalls(src: string, file: string): Call[] {
  const out: Call[] = [];
  const body = code(src);
  let from = 0;
  for (;;) {
    const at = body.indexOf('invoke<', from);
    if (at < 0) break;
    let depth = 0;
    let end = -1;
    for (let i = at + 'invoke'.length; i < body.length; i += 1) {
      const ch = body[i];
      if (ch === '<' || ch === '{' || ch === '(') depth += 1;
      else if (ch === '>' || ch === '}' || ch === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    const generic = body.slice(at + 'invoke<'.length, end).trim();
    const rest = body.slice(end + 1, end + 200);
    const args = /^\(\s*(?:'([^']+)'|[A-Za-z_][\w.]*)\s*,\s*(?:'([^']+)'|[A-Za-z_][\w.]*)/.exec(rest);
    out.push({ file, generic, service: args?.[1] ?? null, action: args?.[2] ?? null });
    from = end + 1;
  }
  return out;
}

const CALLS = pageFiles()
  .concat(
    fs
      .readdirSync(path.join(RENDERER, 'data'))
      .filter((n) => n.endsWith('.ts'))
      .map((n) => path.join(RENDERER, 'data', n)),
  )
  .flatMap((f) => invokeCalls(fs.readFileSync(f, 'utf8'), path.relative(RENDERER, f).split(path.sep).join('/')));

const KEYS = ledgerKeys();
const REGISTERED = registered();

describe('画面の invoke<T> は台帳の型を読む (母集団は走査で数える)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(27);
    expect(KEYS).toContain('slack/send-message');
    expect(REGISTERED.size).toBeGreaterThanOrEqual(40);
    expect(REGISTERED.get('slack/send-message')).toEqual({ file: 'slack.ts', handler: 'sendMessage' });
    expect(CALLS.length).toBeGreaterThanOrEqual(30);
    expect(CALLS.some((c) => c.file === 'pages/SlackPage.tsx' && c.service === 'slack' && c.action === 'send-message')).toBe(true);
  });

  it('★ 手写しの形 invoke<{ … }> が renderer に無い', () => {
    const bare = CALLS.filter((c) => c.generic.startsWith('{')).map((c) => `${c.file}: invoke<${c.generic.slice(0, 40)}…>`);
    expect(bare, '戻り値の形を手で写している呼び出し (台帳 shared/actionData.ts を読むこと)').toEqual([]);
  });

  it('★ ActionData の鍵は引数の組と一致し、名前つきの型は台帳に理由つきで在る', () => {
    for (const c of CALLS) {
      const m = /^ActionData<'([^']+)'>$/.exec(c.generic);
      if (m) {
        expect(KEYS, `${c.file}: ${m[1]} は台帳に無い`).toContain(m[1]);
        if (c.service !== null && c.action !== null) {
          expect(`${c.service}/${c.action}`, `${c.file}: 型と引数の組がずれている`).toBe(m[1]);
        } else {
          expect(NON_LITERAL_ALLOWED[c.file], `${c.file}: 引数がリテラルでない (台帳に理由を書く)`).toBeTruthy();
        }
      } else {
        expect(NAMED_ALLOWED[c.generic], `${c.file}: invoke<${c.generic}> は台帳の型でも理由つきの名前でもない`).toBeTruthy();
      }
    }
  });

  it('★ 台帳の名前つきの型は実際に使われている (古い行が残っていない)', () => {
    const used = new Set(CALLS.map((c) => c.generic));
    for (const name of Object.keys(NAMED_ALLOWED)) expect(used, `${name}: もう使われていない (台帳が古い)`).toContain(name);
    for (const file of Object.keys(NON_LITERAL_ALLOWED)) {
      expect(CALLS.some((c) => c.file === file && (c.service === null || c.action === null)), `${file}: リテラルでない呼び出しが無い (台帳が古い)`).toBe(true);
    }
  });

  it('★ 台帳の鍵はすべて登録済みの action で、main の handler が台帳の型を宣言している', () => {
    for (const key of KEYS) {
      const reg = REGISTERED.get(key);
      expect(reg, `${key}: main の ACTIONS に無い`).toBeDefined();
      const src = code(fs.readFileSync(path.join(CLIENTS, reg!.file), 'utf8'));
      expect(signature(src, reg!.handler), `${key}: handler ${reg!.handler} が ActionData<'${key}'> を宣言していない`).toContain(
        `ActionData<'${key}'>`,
      );
    }
  });

  it('★ ブラウザ版の双子も台帳の型を宣言している (無い鍵は理由つき)', () => {
    for (const key of KEYS) {
      const twin = WEB_TWINS[key];
      if (twin === undefined) {
        expect(WEB_TWIN_NONE[key], `${key}: 双子の宣言も理由も無い`).toBeTruthy();
        continue;
      }
      expect(WEB_TWIN_NONE[key], `${key}: 双子が在るのに「無い」の台帳にも載っている`).toBeUndefined();
      const src = code(read(twin.file));
      expect(signature(src, twin.fn), `${key}: ${twin.file} の ${twin.fn} が ActionData<'${key}'> を宣言していない`).toContain(
        `ActionData<'${key}'>`,
      );
    }
    // 台帳が古くなっていない: 「無い」に載る鍵は台帳の鍵。
    for (const key of Object.keys(WEB_TWIN_NONE)) expect(KEYS, `${key}: 台帳に無い鍵が「無い」に載っている`).toContain(key);
  });

  it('★ 対照: 走査は手写し・組のずれ・多行の型引数に当たる', () => {
    const sample = [
      "await hub.invoke<{ id: string; url: string }>('notion', 'create-page', {});",
      "await window.serviceHub.invoke<ActionData<'slack/send-message'>>(\n  'slack',\n  'send-message',\n  {},\n);",
      "await window.serviceHub.invoke<ActionData<'stocks/export-dashboard'>>('business', action, payload);",
      "await hub.invoke<OllamaChatResult>('ollama', 'chat', { model, prompt });",
    ].join('\n');
    const calls = invokeCalls(sample, 'x');
    expect(calls.map((c) => c.generic)).toEqual([
      '{ id: string; url: string }',
      "ActionData<'slack/send-message'>",
      "ActionData<'stocks/export-dashboard'>",
      'OllamaChatResult',
    ]);
    expect(calls[1]).toMatchObject({ service: 'slack', action: 'send-message' });
    expect(calls[2]).toMatchObject({ service: 'business', action: null });
    // 署名の切り出し: 戻り値の型まで含み、本体は含まない。
    const sig = signature("export async function f(\n  ctx: ActionContext,\n): Promise<ActionData<'a/b'>> {\n  return {};\n}", 'f');
    expect(sig).toContain("ActionData<'a/b'>");
    expect(sig).not.toContain('return');
  });
});
