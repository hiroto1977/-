/**
 * **`invoke<T>()` の T は台帳 (`shared/actionData.ts`) から読み、手で写さない。** (2026-09-09 · パス 116 / 117)
 *
 * `invoke<T>()` は T を検査しない。画面が戻り値の形を手で写すと、写しがずれても `tsc` は黙る ——
 * 同じ形をパス 62 / 80 / 105 / 113 / 114 で 5 度直した。直す前は画面の `invoke<{ … }>` が
 * 22 か所、画面の中の `interface …Result` が 6 つ在った。
 *
 * ## 台帳は全域 (パス 117)
 *
 * パス 116 の台帳は 27 鍵で、main に登録された action は **54** だった。この走査は
 * 「台帳の鍵が登録済みか」しか見ておらず (片方向)、台帳に無い 27 の action は誰も数えていなかった。
 * しかも `registered()` は `ACTIONS = { … }` の字面だけを読み、`shopify.ts` の
 * `ACTIONS = Object.fromEntries(CONNECTORS…)` (7 action) を**黙って飛ばしていた** —— 走査が
 * 読めない形を 0 件と数えると、その 0 は「無い」ではなく「読めなかった」である (パス 85 / 95 / 107 と同じ形)。
 * 台帳の外に残っていた形には実際のずれが在った: `StocksPage` は解除 (`removed` を返す) にも登録の型
 * (`added`) を付け、`BusinessPage` と `web-shim.ts` は `categoryId` を `string` に広げ、`web-shim.ts` は
 * カテゴリ id の一覧と record-entry の 4 サービスを別の写しで持ち、`TalentPage` は `res.data as { … }` と
 * 手で写し、`ServiceActionPanel` は `serviceId` を落とした写しを持っていた。
 *
 * ここは 5 つを留める:
 *   1. renderer に `invoke<{` (手写しの形) が無い。
 *   2. `invoke<ActionData<'a/b'>>('a', 'b', …)` の組が引数と一致する (型を隣の action に付けない)。
 *      引数が変数の呼び出しは `ActionData<`${…}`>` の型で書き、理由つきの台帳 (`NON_LITERAL_ALLOWED`) に
 *      載る —— 変数の合併型がそのまま鍵になるので、台帳に無い鍵が入れば `tsc` が落ちる。
 *      台帳の外の名前つきの型は `NAMED_ALLOWED` に理由つきで載る (パス 117 で 0 になった)。
 *   3. **登録済みの action はすべて台帳の鍵で、台帳の鍵はすべて登録済み** (両方向)。handler は台帳の型を宣言する。
 *   4. ブラウザ版の双子 (`WEB_TWINS`) も台帳の型を宣言する —— 関数の戻り値、または dispatch の中の
 *      `ok<ActionData<'…'>>(…)` (`ok<T>` は引数を T で検査する)。双子が無い鍵は理由つき。
 *   5. 走査が計算された `ACTIONS` (shopify の CONNECTORS) を読み、読めない形は鳴る。
 * 母集団 (呼び出し・登録された action) は走査で導く。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import path from 'node:path';
import { CLIENTS, RENDERER, actionEntries, balanced, code, pageFiles } from '../pages/__tests__/aiEgressPairs.helpers';
import { RECORD_ENTRY_SERVICE_IDS } from '../../shared/recordEntryLimits';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(SRC, rel));

/** 台帳に載らない名前つきの型と、その理由 (パス 117 で 0 —— 増えたら理由を書く)。 */
const NAMED_ALLOWED: Readonly<Record<string, string>> = {};

/**
 * 引数が文字列リテラルでない呼び出し (組の一致を字面で確かめられない)。理由と、許す型の形:
 * - `literal`: 鍵をリテラルで書く (変数がどの値でも同じ形のとき)。
 * - `template`: 鍵を `${…}` で組む (変数の値ごとに形が違うとき —— リテラルの鍵は嘘になる)。
 */
const NON_LITERAL_ALLOWED: Readonly<Record<string, { readonly form: 'literal' | 'template'; readonly reason: string }>> = {
  'pages/BusinessPage.tsx': { form: 'literal', reason: 'action は html / md の変数。どちらも ExportFileResult (同じ形)' },
  'pages/StocksPage.tsx': {
    form: 'template',
    reason: 'action は register-ticker / unregister-ticker の変数で、答えの形が違う (added / removed)。鍵は `stocks/${typeof action}`',
  },
  'components/ServiceActionPanel.tsx': {
    form: 'template',
    reason: 'serviceId は record-entry を持つ 4 サービスの変数。鍵は `${RecordEntryServiceId}/record-entry` (4 鍵の和)',
  },
};

/** 型引数の `${Alias}` を実物の一覧へ展開する (走査が鍵を 1 つずつ確かめられるように)。 */
const TEMPLATE_UNIONS: Readonly<Record<string, readonly string[]>> = {
  RecordEntryServiceId: RECORD_ENTRY_SERVICE_IDS,
};

const WEB_SHIM = 'renderer/web-shim.ts';

type Twin = { readonly file: string; readonly fn: string } | { readonly file: string; readonly inline: true };

/** 鍵 → ブラウザ版の双子 (関数の戻り値で宣言する物と、dispatch の中で `ok<ActionData<'…'>>` と宣言する物)。 */
const WEB_TWINS: Readonly<Record<string, Twin>> = {
  'assistant/chat': { file: WEB_SHIM, fn: 'callAssistantChat' },
  'assistant/chatAll': { file: WEB_SHIM, fn: 'callAssistantChatAll' },
  'assistant/providers': { file: WEB_SHIM, fn: 'callAssistantProviders' },
  'atlassian/create-issue': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createAtlassianIssue' },
  'business/advise': { file: WEB_SHIM, fn: 'callAnthropicAdvisor' },
  'calendar/create-event': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCalendarEvent' },
  'canva/create-folder': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCanvaFolder' },
  'cloudflare/create-dns-record': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createCloudflareDnsRecord' },
  'cloudflare/purge-cache': { file: 'renderer/data/saasWriteWeb.ts', fn: 'purgeCloudflareCache' },
  'demae-can/advise': { file: WEB_SHIM, inline: true },
  'demae-can/record-entry': { file: WEB_SHIM, inline: true },
  'drive/create-folder': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createDriveFolder' },
  'emotions/analyze-text': { file: WEB_SHIM, fn: 'callEmotionsAnalyze' },
  'emotions/clear-history': { file: 'renderer/data/emotionsWeb.ts', fn: 'clearHistory' },
  'emotions/log-mood': { file: 'renderer/data/emotionsWeb.ts', fn: 'logMood' },
  'github/create-issue': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createGithubIssue' },
  'gmail/create-draft': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createGmailDraft' },
  'mutual-funds/advise': { file: WEB_SHIM, inline: true },
  'mutual-funds/record-entry': { file: WEB_SHIM, inline: true },
  'notion/create-page': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createNotionPage' },
  'ollama/chat': { file: WEB_SHIM, inline: true },
  'real-estate/advise': { file: WEB_SHIM, inline: true },
  'real-estate/record-entry': { file: WEB_SHIM, inline: true },
  'security/check-email-breach': { file: 'renderer/data/saasWriteWeb.ts', fn: 'checkEmailBreach' },
  'security/scan-url': { file: 'renderer/data/saasWriteWeb.ts', fn: 'scanUrlVirusTotal' },
  'slack/send-message': { file: 'renderer/data/saasWriteWeb.ts', fn: 'sendSlackMessage' },
  'stocks/advise': { file: WEB_SHIM, fn: 'callStocksAdvisor' },
  'stocks/compare-strategies': { file: WEB_SHIM, inline: true },
  'stocks/register-ticker': { file: WEB_SHIM, inline: true },
  'stocks/unregister-ticker': { file: WEB_SHIM, inline: true },
  'talent/judge-leader': { file: WEB_SHIM, inline: true },
  'talent/save-state': { file: WEB_SHIM, inline: true },
  'teamradar/save-state': { file: WEB_SHIM, inline: true },
  'uber-eats/advise': { file: WEB_SHIM, inline: true },
  'uber-eats/record-entry': { file: WEB_SHIM, inline: true },
  'wordpress/create-post-draft': { file: 'renderer/data/saasWriteWeb.ts', fn: 'createWordPressPostDraft' },
};

/** 双子が台帳の型を宣言していない鍵と、その理由。 */
const WEB_TWIN_NONE: Readonly<Record<string, string>> = {
  'business/export-dashboard': 'web-shim.ts は downloaded / 保管庫の sinks を足した上位集合を返す',
  'business/export-dashboard-md': '同上',
  'docstudio/list-collections': 'ブラウザ版に双子が無い (画面はスナップショットの collections を読む)',
  'microsoft-365/create-event': 'ブラウザ版に双子が無い (Electron 版のみ)',
  'microsoft-365/send-mail': '同上',
  'shopify/sync-to-discord': 'ブラウザ版に双子が無い (Electron 版のみ)',
  'shopify/sync-to-gmail': '同上',
  'shopify/sync-to-line': '同上',
  'shopify/sync-to-notion': '同上',
  'shopify/sync-to-salesforce': '同上',
  'shopify/sync-to-slack': '同上',
  'shopify/sync-to-stripe': '同上',
  'skills/run-skill': 'ブラウザ版に双子が無い (Electron 版のみ)',
  'stocks/backtest': 'ブラウザ版に双子が無い (web-shim は backtest を実装していない)',
  'stocks/export-dashboard': 'web-shim.ts は downloaded / sinks を足した上位集合を返す',
  'stocks/export-dashboard-md': '同上',
  'teamradar/export-svg': '同上',
  'templates/export-template': 'web-shim.ts は downloaded / sinks を足した上位集合を返す',
};

/** 台帳の鍵 ('service/action')。 */
function ledgerKeys(): string[] {
  const src = code(read('shared/actionData.ts'));
  const at = src.indexOf('export interface ActionDataMap {');
  const block = balanced(src, src.indexOf('{', at), '{', '}');
  return [...block.matchAll(/'([a-z0-9-]+\/[a-zA-Z0-9-]+)'\s*:/g)].map((m) => m[1]!);
}

/** main の ACTIONS に登録された組 → { file, handler }。読めない形のファイルは `unreadable` に積む。 */
function registered(): { map: Map<string, { file: string; handler: string }>; unreadable: string[] } {
  const map = new Map<string, { file: string; handler: string }>();
  const unreadable: string[] = [];
  for (const f of readOriginalDir(CLIENTS).filter((n) => n.endsWith('.ts'))) {
    const src = code(readOriginalSource(path.join(CLIENTS, f)));
    const entries = actionEntries(src);
    if (entries === null) {
      unreadable.push(f);
      continue;
    }
    for (const { action, handler } of entries) map.set(`${f.replace(/\.ts$/, '')}/${action}`, { file: f, handler });
  }
  return { map, unreadable };
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

/** `ok<…>(` の型引数に現れる台帳の鍵 (`${Alias}` は展開する)。 */
function inlineDeclared(src: string): Set<string> {
  const out = new Set<string>();
  const re = /\bok</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const generic = balanced(src, m.index + 2, '<', '>');
    for (const k of generic.matchAll(/ActionData<'([^']+)'>/g)) out.add(k[1]!);
    for (const t of generic.matchAll(/ActionData<`\$\{(\w+)\}\/([a-zA-Z0-9-]+)`>/g)) {
      for (const s of TEMPLATE_UNIONS[t[1]!] ?? []) out.add(`${s}/${t[2]}`);
    }
  }
  return out;
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
    readOriginalDir(path.join(RENDERER, 'data'))
      .filter((n) => n.endsWith('.ts'))
      .map((n) => path.join(RENDERER, 'data', n)),
  )
  .flatMap((f) => invokeCalls(readOriginalSource(f), path.relative(RENDERER, f).split(path.sep).join('/')));

const KEYS = ledgerKeys();
const REG = registered();
const REGISTERED = REG.map;

describe('画面の invoke<T> は台帳の型を読む (母集団は走査で数える)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    // 読めない形を先に見る —— 読めなければ後の数はどれも「無い」ではなく「読めなかった」。
    expect(REG.unreadable, 'ACTIONS が読めない形の client (走査が黙って飛ばす)').toEqual([]);
    expect(KEYS.length).toBeGreaterThanOrEqual(54);
    expect(KEYS).toContain('slack/send-message');
    expect(REGISTERED.size).toBeGreaterThanOrEqual(54);
    expect(REGISTERED.get('slack/send-message')).toEqual({ file: 'slack.ts', handler: 'sendMessage' });
    // 計算された ACTIONS (shopify の CONNECTORS) も読めている (パス 117 まで黙って飛ばしていた)。
    expect(REGISTERED.get('shopify/sync-to-slack')).toEqual({ file: 'shopify.ts', handler: 'syncToSlack' });
    expect(CALLS.length).toBeGreaterThanOrEqual(35);
    expect(CALLS.some((c) => c.file === 'pages/SlackPage.tsx' && c.service === 'slack' && c.action === 'send-message')).toBe(true);
  });

  it('★ 手写しの形 invoke<{ … }> が renderer に無い', () => {
    const bare = CALLS.filter((c) => c.generic.startsWith('{')).map((c) => `${c.file}: invoke<${c.generic.slice(0, 40)}…>`);
    expect(bare, '戻り値の形を手で写している呼び出し (台帳 shared/actionData.ts を読むこと)').toEqual([]);
  });

  it('★ ActionData の鍵は引数の組と一致し、変数の引数は理由つきで型の形が合い、名前つきの型は台帳に理由つきで在る', () => {
    for (const c of CALLS) {
      const lit = /^ActionData<'([^']+)'>$/.exec(c.generic);
      const tpl = /^ActionData<`([^`]+)`>$/.exec(c.generic);
      if (lit) {
        expect(KEYS, `${c.file}: ${lit[1]} は台帳に無い`).toContain(lit[1]);
        if (c.service !== null && c.action !== null) {
          expect(`${c.service}/${c.action}`, `${c.file}: 型と引数の組がずれている`).toBe(lit[1]);
        } else {
          const allow = NON_LITERAL_ALLOWED[c.file];
          expect(allow, `${c.file}: 引数がリテラルでない (台帳に理由を書く)`).toBeTruthy();
          // 変数の値ごとに形が違うと決めたファイルで、リテラルの鍵を変数に付けたら嘘 (登録の型を解除にも付けた形)。
          expect(allow?.form, `${c.file}: 変数の引数にリテラルの鍵 ${lit[1]} を付けている (鍵を \${…} で組むこと)`).toBe('literal');
        }
      } else if (tpl) {
        const allow = NON_LITERAL_ALLOWED[c.file];
        expect(allow, `${c.file}: 引数がリテラルでない (台帳に理由を書く)`).toBeTruthy();
        expect(allow?.form, `${c.file}: 台帳は literal の形と言っている`).toBe('template');
        const byService = /^\$\{(\w+)\}\/([a-zA-Z0-9-]+)$/.exec(tpl[1]!);
        const byAction = /^([a-z0-9-]+)\/\$\{typeof\s+(\w+)\}$/.exec(tpl[1]!);
        expect(byService !== null || byAction !== null, `${c.file}: 読めない型引数 ${c.generic}`).toBe(true);
        if (byService) {
          const ids = TEMPLATE_UNIONS[byService[1]!];
          expect(ids, `${c.file}: \${${byService[1]}} は展開表 (TEMPLATE_UNIONS) に無い`).toBeDefined();
          for (const s of ids ?? []) expect(KEYS, `${c.file}: ${s}/${byService[2]} は台帳に無い`).toContain(`${s}/${byService[2]}`);
          if (c.action !== null) expect(c.action, `${c.file}: 型と引数の action がずれている`).toBe(byService[2]);
        }
        if (byAction) {
          expect(c.service, `${c.file}: 型と引数の service がずれている`).toBe(byAction[1]);
          expect(c.action, `${c.file}: action がリテラルなら型もリテラルで書く`).toBeNull();
          expect(KEYS.some((k) => k.startsWith(`${byAction[1]}/`)), `${c.file}: ${byAction[1]} の鍵が台帳に無い`).toBe(true);
        }
      } else {
        expect(NAMED_ALLOWED[c.generic], `${c.file}: invoke<${c.generic}> は台帳の型でも理由つきの名前でもない`).toBeTruthy();
      }
    }
  });

  it('★ 台帳の名前つきの型・変数の引数の理由は実際に使われている (古い行が残っていない)', () => {
    const used = new Set(CALLS.map((c) => c.generic));
    for (const name of Object.keys(NAMED_ALLOWED)) expect(used, `${name}: もう使われていない (台帳が古い)`).toContain(name);
    for (const [file, allow] of Object.entries(NON_LITERAL_ALLOWED)) {
      const calls = CALLS.filter((c) => c.file === file && (c.service === null || c.action === null));
      expect(calls.length, `${file}: リテラルでない呼び出しが無い (台帳が古い)`).toBeGreaterThan(0);
      const forms = new Set(calls.map((c) => (c.generic.startsWith('ActionData<`') ? 'template' : 'literal')));
      expect([...forms], `${file}: 台帳の形 (${allow.form}) と実物がずれている`).toEqual([allow.form]);
    }
    for (const alias of Object.keys(TEMPLATE_UNIONS)) {
      expect(
        CALLS.some((c) => c.generic.includes(`\${${alias}}`)) || inlineDeclared(code(read(WEB_SHIM))).size > 0,
        `${alias}: 展開表の別名がどこにも使われていない`,
      ).toBe(true);
    }
  });

  it('★ 登録済みの action はすべて台帳に在り、台帳の鍵はすべて登録済み (両方向)', () => {
    const missing = [...REGISTERED.keys()].filter((k) => !KEYS.includes(k)).sort();
    expect(missing, '台帳 (shared/actionData.ts) に無い action —— 鍵と形を足すこと').toEqual([]);
    const stale = KEYS.filter((k) => !REGISTERED.has(k));
    expect(stale, 'main の ACTIONS に無い鍵 (台帳が古い)').toEqual([]);
  });

  it('★ main の handler が台帳の型を宣言している', () => {
    for (const key of KEYS) {
      const reg = REGISTERED.get(key)!;
      const src = code(readOriginalSource(path.join(CLIENTS, reg.file)));
      expect(signature(src, reg.handler), `${key}: handler ${reg.handler} が ActionData<'${key}'> を宣言していない`).toContain(
        `ActionData<'${key}'>`,
      );
    }
  });

  it('★ ブラウザ版の双子も台帳の型を宣言している (無い鍵は理由つき)', () => {
    const inline = new Map<string, Set<string>>();
    const declaredInline = (file: string): Set<string> => {
      let s = inline.get(file);
      if (s === undefined) {
        s = inlineDeclared(code(read(file)));
        inline.set(file, s);
      }
      return s;
    };
    for (const key of KEYS) {
      const twin = WEB_TWINS[key];
      if (twin === undefined) {
        expect(WEB_TWIN_NONE[key], `${key}: 双子の宣言も理由も無い`).toBeTruthy();
        continue;
      }
      expect(WEB_TWIN_NONE[key], `${key}: 双子が在るのに「無い」の台帳にも載っている`).toBeUndefined();
      if ('inline' in twin) {
        expect(declaredInline(twin.file).has(key), `${key}: ${twin.file} の dispatch に ok<ActionData<'${key}'>>(…) が無い`).toBe(true);
        continue;
      }
      const src = code(read(twin.file));
      expect(signature(src, twin.fn), `${key}: ${twin.file} の ${twin.fn} が ActionData<'${key}'> を宣言していない`).toContain(
        `ActionData<'${key}'>`,
      );
    }
    // 台帳が古くなっていない: 「無い」に載る鍵は台帳の鍵。
    for (const key of Object.keys(WEB_TWIN_NONE)) expect(KEYS, `${key}: 台帳に無い鍵が「無い」に載っている`).toContain(key);
  });

  it('★ 対照: 走査は手写し・組のずれ・多行の型引数・テンプレートの鍵・計算された ACTIONS に当たる', () => {
    const sample = [
      "await hub.invoke<{ id: string; url: string }>('notion', 'create-page', {});",
      "await window.serviceHub.invoke<ActionData<'slack/send-message'>>(\n  'slack',\n  'send-message',\n  {},\n);",
      "await window.serviceHub.invoke<ActionData<'stocks/export-dashboard'>>('business', action, payload);",
      "await hub.invoke<OllamaChatResult>('ollama', 'chat', { model, prompt });",
      'await window.serviceHub.invoke<ActionData<`stocks/${typeof action}`>>(\n  \'stocks\',\n  action,\n  { symbol },\n);',
      "await window.serviceHub.invoke<ActionData<`${RecordEntryServiceId}/record-entry`>>(serviceId, 'record-entry', payload);",
    ].join('\n');
    const calls = invokeCalls(sample, 'x');
    expect(calls.map((c) => c.generic)).toEqual([
      '{ id: string; url: string }',
      "ActionData<'slack/send-message'>",
      "ActionData<'stocks/export-dashboard'>",
      'OllamaChatResult',
      'ActionData<`stocks/${typeof action}`>',
      'ActionData<`${RecordEntryServiceId}/record-entry`>',
    ]);
    expect(calls[1]).toMatchObject({ service: 'slack', action: 'send-message' });
    expect(calls[2]).toMatchObject({ service: 'business', action: null });
    expect(calls[4]).toMatchObject({ service: 'stocks', action: null });
    expect(calls[5]).toMatchObject({ service: null, action: 'record-entry' });
    // 署名の切り出し: 戻り値の型まで含み、本体は含まない。
    const sig = signature("export async function f(\n  ctx: ActionContext,\n): Promise<ActionData<'a/b'>> {\n  return {};\n}", 'f');
    expect(sig).toContain("ActionData<'a/b'>");
    expect(sig).not.toContain('return');
    // dispatch の中の宣言: `ok<ActionData<'…'>>` と `${Alias}` の展開、`ok<T>` の定義は鍵にならない。
    const shim = [
      'function ok<T>(data: T): ActionResult<T> { return { ok: true, data }; }',
      "return ok<ActionData<'talent/save-state'>>(clean) as ActionResult<T>;",
      "return ok<ActionData<'stocks/register-ticker'> | ActionData<'stocks/unregister-ticker'>>(result) as ActionResult<T>;",
      'return ok<ActionData<`${RecordEntryServiceId}/record-entry`>>({ ok: true }) as ActionResult<T>;',
    ].join('\n');
    expect([...inlineDeclared(shim)].sort()).toEqual(
      [
        'demae-can/record-entry',
        'mutual-funds/record-entry',
        'real-estate/record-entry',
        'stocks/register-ticker',
        'stocks/unregister-ticker',
        'talent/save-state',
        'uber-eats/record-entry',
      ].sort(),
    );
    // 計算された ACTIONS: 表の行から (action, handler) を読む。字面の ACTIONS も読む。読めない形は null。
    expect(
      actionEntries(
        "export const CONNECTORS = [\n  { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token'], run: syncToSlack },\n];\nexport const ACTIONS: ActionMap = Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));",
      ),
    ).toEqual([{ action: 'sync-to-slack', handler: 'syncToSlack' }]);
    expect(actionEntries("export const ACTIONS: ActionMap = {\n  'send-message': sendMessage,\n  chat,\n};")).toEqual([
      { action: 'send-message', handler: 'sendMessage' },
      { action: 'chat', handler: 'chat' },
    ]);
    expect(actionEntries('export const ACTIONS: ActionMap = buildActions();')).toBeNull();
    expect(actionEntries('export const ACTIONS: ActionMap = {};'), '空の ACTIONS は「無い」であって「読めない」ではない').toEqual([]);
    expect(actionEntries('export async function fetchX() {}')).toEqual([]);
  });
});
