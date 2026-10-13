import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripNonCode } from '../../shared/__tests__/stripNonCode';

/*
 * **押して外へ送る操作は、押している間 2 度目を送らない** —— 母集団を実装から数える
 * (2026-09-27 · パス 493h)。
 *
 * ## なぜ要るか
 *
 * `serviceHub.invoke` は外部サービスへの書き込み (GitHub の issue・Slack の投稿・
 * Gmail の下書き・DNS レコード …) と、**有料の AI 呼び出し** (感情分析・経営/株式の
 * アドバイザー・AI アシスタント) の唯一の口である。押している間にもう 1 度押すと
 * **同じ中身が 2 回送られる** —— 相手側に 2 件残り、AI なら 2 回課金される。
 *
 * パス 124 の `submitGuardCensus.test.ts` は **record store に触るファイル**の
 * 名前つき handler だけを数え、docblock に「外部サービスへ書く入口は**今も規則の外**
 * … 母集団としてはまだ数えていない」と書いて残していた。その外側を 2026-09-27 に
 * 測ると `invoke` の呼び出しは **42 か所**あり、**2 か所が関門を 1 つも持っていなかった** ——
 * `SlackPage` と `GmailPage` の「Emotions で分析」(有料の Anthropic API を呼び、
 * 結果を Emotions の履歴へ保存する)。どちらも `onClick={async () => { … }}` と
 * **その場に書いた** handler で、**名前つき handler しか見ない走査には構造的に映らない**。
 * 振る舞いは `pages/__tests__/emotionsAnalyzeDoubleSubmit.test.ts` が実物を押して留める。
 *
 * ## 規則
 *
 * `src/renderer` の `.tsx` の **`invoke` の呼び出し 1 つ 1 つ**について、それを起こす JSX の
 * 属性 (`onClick` / `onSubmit` / `onKeyDown` …) を辿り、属性ごとに次のどれかで守られていること:
 *
 * | 種類 | 形 |
 * | --- | --- |
 * | `submit-guard` | 属性が `useSubmitGuard()` の `.run(` を通る |
 * | `busy-disabled` | 送る側が**最初の `await` より前に**状態を立て、その要素の `disabled` がその状態を読む |
 * | `busy-condition` | 同じく状態を立て、**属性自身が** `!状態` を見てから呼ぶ (`if (e.key === 'Enter' && !busy) run()`) |
 * | `busy-reentry` | 同じく状態を立て、**送る側の入口が**その状態を見て戻る (`if (busy) return;`) |
 *
 * どれにも当たらない呼び出しは、**理由つきの台帳** (`NOT_GUARDED_BY_STATE`) に載っていなければ落ちる。
 * 台帳は**両方向** —— 載っているのに走査が「全部守られている」と答えるようになった行も落ちる
 * (古い免除は、次に足された 1 か所を隠す)。
 *
 * ★ **「最初の `await` より前」が要る理由** —— 状態を立てる前に待つと、その待ちの間は
 * 押せる。`await x; setBusy(true)` は関門に見えて関門ではない (標本が留める)。
 *
 * ★ **状態の関門が効く理由と、効かない場面** —— React 18 はクリックのような離散的な出来事の
 * 更新を、その出来事の後の microtask で描き直す。人の 2 度目のクリックは別の task なので、
 * そのときボタンは既に `disabled` で、ブラウザは押下を届けない。**同じ tick に 2 度届く形**
 * (自動化・jsdom の連続 dispatch) は状態では止まらず、`useSubmitGuard` の ref だけが止める ——
 * だから**新しく足す物は `.run(` を使う**。表の下 3 つは「今ある形」を認めているだけである。
 *
 * ★ **これは近似である** —— AST を使わず、波括弧の対応と綴りで辿る。辿り損ねた呼び出しは
 * 「守られていない」側に倒れる (台帳を書けと落ちる) ので、黙って通ることはない。
 * 逆向きの誤り (守られていないのに守られていると読む) の余地は、呼び手が `await` の後で
 * 呼び先を呼ぶ形に残る —— 今日その形は 0 件で、振る舞いの背骨は上の jsdom の検査が持つ。
 *
 * **手で一覧を書かない** —— 呼び出しの位置も、それを起こす属性も、実装から導く。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RENDERER = 'src/renderer';

export type Gate = 'submit-guard' | 'busy-disabled' | 'busy-condition' | 'busy-reentry';

export interface Trigger {
  /** 属性の名前 (`onClick` ほか)。 */
  readonly attr: string;
  /** 属性がある行 (1 始まり)。 */
  readonly line: number;
  /** 守りの種類。守られていなければ null。 */
  readonly gate: Gate | null;
}

export interface Site {
  readonly file: string;
  /** `invoke` の呼び出しがある行 (1 始まり)。 */
  readonly line: number;
  /** 呼び出しを起こす属性に最初に当たった関数 (無ければ最も内側の関数・属性に直に書いたなら `(inline)`)。 */
  readonly handler: string;
  /** それを起こす JSX の属性。空なら「押して起きる」送信ではない。 */
  readonly triggers: readonly Trigger[];
}

interface Fn {
  readonly name: string;
  /** 本体の `{` の位置。 */
  readonly bodyStart: number;
  /** 本体の `}` の位置。 */
  readonly bodyEnd: number;
}

interface Attr {
  readonly name: string;
  readonly start: number;
  /** 値の `{` の位置。 */
  readonly open: number;
  /** 値の `}` の位置。 */
  readonly close: number;
}

/** `code[open]` の括弧に対応する閉じ括弧の位置 (無ければ -1)。文字列の中身は落としてある前提。 */
export function matchClose(code: string, open: number): number {
  const o = code[open];
  const c = o === '(' ? ')' : o === '{' ? '}' : o === '[' ? ']' : '';
  if (c === '') return -1;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === o) depth += 1;
    else if (ch === c) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineOf(code: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i += 1) if (code[i] === '\n') n += 1;
  return n;
}

/** 名前つきの関数 (宣言・`const x = (…) =>`・`const x = useCallback(…)`) と本体の範囲。 */
export function functionsOf(code: string): Fn[] {
  const out: Fn[] = [];
  for (const m of code.matchAll(/\bfunction\s+(\w+)\s*(?:<[^>(]*>)?\s*\(/g)) {
    const paren = m.index! + m[0].length - 1;
    const pClose = matchClose(code, paren);
    if (pClose < 0) continue;
    const open = code.indexOf('{', pClose);
    if (open < 0) continue;
    const close = matchClose(code, open);
    if (close > open) out.push({ name: m[1]!, bodyStart: open, bodyEnd: close });
  }
  for (const m of code.matchAll(/\bconst\s+(\w+)\s*(?::[^=]+)?=\s*(?:useCallback\(\s*)?(?:async\s*)?(?:function\b[^(]*)?\(/g)) {
    const paren = m.index! + m[0].length - 1;
    const pClose = matchClose(code, paren);
    if (pClose < 0) continue;
    // `(…) =>` か `(…): T =>` か `function (…) {`。矢印なら `=>` の後ろの `{` が本体。
    const rest = code.slice(pClose + 1, pClose + 200);
    const arrow = /^\s*(?::[^=]*?)?=>\s*\{/.exec(rest);
    const fnBody = /^\s*(?::[^{]*?)?\{/.exec(rest);
    const isFunctionKeyword = /function\b[^(]*\($/.test(m[0]);
    let open = -1;
    if (arrow) open = pClose + 1 + arrow[0].length - 1;
    else if (isFunctionKeyword && fnBody) open = pClose + 1 + fnBody[0].length - 1;
    if (open < 0) continue;
    const close = matchClose(code, open);
    if (close > open) out.push({ name: m[1]!, bodyStart: open, bodyEnd: close });
  }
  return out;
}

/** JSX の出来事の属性 (`onClick={…}` ほか) と値の範囲。部品の prop (`onSubmit={handler}`) も含む。 */
export function eventAttrsOf(code: string): Attr[] {
  const out: Attr[] = [];
  for (const m of code.matchAll(/\b(on[A-Z]\w*)=\{/g)) {
    const open = m.index! + m[0].length - 1;
    const close = matchClose(code, open);
    if (close > open) out.push({ name: m[1]!, start: m.index!, open, close });
  }
  return out;
}

/** 属性を持つ開始タグ (`<button …>`)。波括弧の中の `<` `>` (比較・矢印) は数えない。 */
export function openingTagOf(code: string, attrStart: number): string {
  let depth = 0;
  let start = -1;
  for (let i = attrStart; i >= 0; i -= 1) {
    const ch = code[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') depth -= 1;
    else if (ch === '<' && depth === 0 && /[A-Za-z]/.test(code[i + 1] ?? '')) {
      start = i;
      break;
    }
  }
  if (start < 0) return '';
  depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return code.slice(start, i + 1);
  }
  return '';
}

/** 開始タグの `disabled={…}` の中身 (無ければ null)。 */
export function disabledExprOf(tag: string): string | null {
  const m = /\bdisabled=\{/.exec(tag);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const close = matchClose(tag, open);
  return close > open ? tag.slice(open + 1, close) : null;
}

/** 本体のうち、最初の `await` より前 (無ければ全部)。 */
export function beforeFirstAwait(body: string): string {
  const m = /\bawait\b/.exec(body);
  return m ? body.slice(0, m.index) : body;
}

/** `setX(値)` で立てる状態の名前 (`setSubmitting(true)` → `submitting`)。倒す値 (false / null / undefined) は数えない。 */
export function raisedStates(prefix: string): Set<string> {
  const out = new Set<string>();
  for (const m of prefix.matchAll(/\bset([A-Z]\w*)\(\s*([^()\s][^()]*?)\s*\)/g)) {
    const arg = m[2]!.trim();
    if (/^(false|null|undefined|0|''|"")$/.test(arg)) continue;
    out.add(m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1));
  }
  return out;
}

function mentions(expr: string, name: string): boolean {
  return new RegExp(`(^|[^\\w.$])${name}\\b`).test(expr);
}

/** `const NAME = 式;` の 1 行の別名 (`const busy = status.kind === 'busy'`)。`disabled={busy}` を状態まで辿るため。 */
export function aliasesOf(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/\bconst\s+(\w+)\s*=\s*([^;\n]+);/g)) out.set(m[1]!, m[2]!);
  return out;
}

function expand(expr: string, aliases: ReadonlyMap<string, string>): string {
  let out = expr;
  for (const id of expr.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    const a = aliases.get(id);
    if (a !== undefined) out += ` ${a}`;
  }
  return out;
}

/**
 * 1 つの属性の守り。`attrText` は属性の値、`prefix` は送る側の関数たちの「最初の await より前」、
 * `tag` は属性を持つ開始タグ。
 */
export function gateOf(
  attrText: string,
  prefix: string,
  tag: string,
  aliases: ReadonlyMap<string, string> = new Map(),
): Gate | null {
  if (/\.run\(/.test(attrText)) return 'submit-guard';
  const states = raisedStates(beforeFirstAwait(prefix));
  if (states.size === 0) return null;
  const disabled = disabledExprOf(tag);
  if (disabled !== null) {
    const expanded = expand(disabled, aliases);
    if ([...states].some((s) => mentions(expanded, s))) return 'busy-disabled';
  }
  // 属性自身が `!状態` を見てから呼ぶ (Enter キーの経路 —— `<input>` は `disabled` を持たない)。
  if ([...states].some((s) => new RegExp(`!\\s*${s}\\b`).test(attrText))) return 'busy-condition';
  // 送る側の入口で戻る: `if (… busy …) return` (立てる状態そのものを見ている)。
  for (const m of prefix.matchAll(/\bif\s*\(([^)]*)\)\s*(?:\{\s*)?return\b/g)) {
    if ([...states].some((s) => mentions(m[1]!, s))) return 'busy-reentry';
  }
  return null;
}

/** 1 ファイルの `invoke` の呼び出しと、それを起こす属性・守り。 */
export function scanFile(file: string, src: string): Site[] {
  const code = stripNonCode(src);
  const fns = functionsOf(code);
  const attrs = eventAttrsOf(code);
  const aliases = aliasesOf(code);
  const sites: Site[] = [];
  for (const m of code.matchAll(/\.invoke\s*(?=[<(])/g)) {
    const at = m.index!;
    const inline = attrs
      .filter((a) => a.open < at && at < a.close)
      .sort((a, b) => b.open - a.open)[0];
    const enclosing = fns
      .filter((f) => f.bodyStart < at && at < f.bodyEnd)
      .sort((a, b) => b.bodyStart - a.bodyStart);
    // 属性の中に直接書いた送信 (`onClick={async () => { … invoke … }}`)。
    if (inline !== undefined && (enclosing.length === 0 || enclosing[0]!.bodyStart < inline.open)) {
      const body = code.slice(inline.open + 1, inline.close);
      sites.push({
        file,
        line: lineOf(code, at),
        handler: '(inline)',
        triggers: [
          { attr: inline.name, line: lineOf(code, inline.start), gate: gateOf(body, body, openingTagOf(code, inline.start), aliases) },
        ],
      });
      continue;
    }
    // 名前つきの関数の中の送信。内側から外へ辿り、JSX の属性か、それを呼ぶ関数に当たるまで。
    const triggers: Trigger[] = [];
    let handler = enclosing[0]?.name ?? '(none)';
    const seen = new Set<string>();
    const walk = (fn: Fn, chainPrefix: string): void => {
      if (seen.has(fn.name)) return;
      seen.add(fn.name);
      const prefix = chainPrefix + beforeFirstAwait(code.slice(fn.bodyStart + 1, fn.bodyEnd));
      for (const a of attrs) {
        const text = code.slice(a.open + 1, a.close);
        if (!mentions(text, fn.name)) continue;
        // 関数の本体の中の属性 (その関数が描く JSX) は、その関数を起こす属性ではない。
        if (fn.bodyStart < a.start && a.start < fn.bodyEnd) continue;
        triggers.push({
          attr: a.name,
          line: lineOf(code, a.start),
          gate: gateOf(text, prefix, openingTagOf(code, a.start), aliases),
        });
      }
      // その関数を呼ぶ、名前つきの別の関数 (呼び手の側の守りも数える)。
      for (const caller of fns) {
        if (caller.name === fn.name) continue;
        if (caller.bodyStart < fn.bodyStart && fn.bodyEnd < caller.bodyEnd) continue; // 包む関数は外側の段で辿る
        const body = code.slice(caller.bodyStart + 1, caller.bodyEnd);
        if (new RegExp(`(^|[^\\w.$])${fn.name}\\s*\\(`).test(body)) walk(caller, prefix);
      }
    };
    for (const fn of enclosing) {
      walk(fn, '');
      if (triggers.length > 0) {
        handler = fn.name;
        break;
      }
    }
    sites.push({ file, line: lineOf(code, at), handler, triggers });
  }
  return sites;
}

/**
 * **守られていない送信の台帳** —— 鍵は `ファイル::関数`。理由は「なぜ 2 度目の送信が
 * 起きないか (または起きても良いか)」を書く。空・省略形は落ちる。
 */
const NOT_GUARDED_BY_STATE: Readonly<Record<string, string>> = {
  'src/renderer/components/ChatbotWidget.tsx::runIntent':
    '確認の窓 (「実行」) は押した瞬間に `setPendingIntent(null)` で閉じる —— 窓は `pendingIntent ?` の下でだけ描かれるので、' +
    '描き直しの後の 2 度目のクリックは届く要素が無い。窓を経ない経路 (チップと送信欄) は `send` の入口の `busy` が止める (busy-reentry)。',
  'src/renderer/components/VoiceCommandBar.tsx::performIntent':
    '押して起きる送信ではない —— 音声認識の確定した 1 発話ごとに 1 度呼ばれる (発話が送信の単位)。' +
    '同じ発話が 2 度届く道は認識器の側に無く、画面のボタンは認識の開始/停止だけを切り替える。',
  'src/renderer/pages/VillagePage.tsx::handleUtterance':
    '会話の 1 発話 = 1 送信。文字の欄 (VoiceFooter) は送った瞬間に欄を空にし、ボタンは `!text.trim()` で押せなくなるので' +
    '同じ文は 2 度送れない。マイクの経路は認識器が確定した発話ごとに 1 度呼ぶ (上の VoiceCommandBar と同じ)。',
};

function listTsx(rel: string): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(path.join(REPO_ROOT, rel))) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      out.push(...listTsx(child));
    } else if (e.name.endsWith('.tsx')) {
      out.push(child);
    }
  }
  return out.sort();
}

function describeSite(s: Site): string {
  const t = s.triggers.map((x) => `${x.attr}@${x.line}:${x.gate ?? '守りなし'}`).join(' ');
  return `${s.file}:${s.line} ${s.handler} ← ${t || '(押して起きない)'}`;
}

describe('押して外へ送る操作は、押している間 2 度目を送らない (母集団は実装から)', () => {
  const sites = listTsx(RENDERER).flatMap((f) => scanFile(f, readOriginalSource(path.join(REPO_ROOT, f))));
  const key = (s: Site): string => `${s.file}::${s.handler}`;

  it('走査は実物に当たる (呼び出しが 35 未満・守りの種類が欠けるなら、規則が空振りしている)', () => {
    expect(sites.length, sites.map(describeSite).join('\n')).toBeGreaterThanOrEqual(35);
    const gates = sites.flatMap((s) => s.triggers.map((t) => t.gate));
    const count = (g: Gate): number => gates.filter((x) => x === g).length;
    expect(count('busy-disabled'), '状態 + disabled で守る属性').toBeGreaterThanOrEqual(25);
    expect(count('submit-guard'), 'useSubmitGuard を通る属性').toBeGreaterThanOrEqual(4);
    expect(count('busy-condition'), 'Enter キーの経路').toBeGreaterThanOrEqual(4);
    expect(count('busy-reentry'), '入口で戻る経路').toBeGreaterThanOrEqual(1);
    // 標本: 直した 2 画面の「Emotions で分析」は、その場に書いた handler のまま関門を通る。
    for (const page of ['SlackPage.tsx', 'GmailPage.tsx']) {
      const inline = sites.filter((s) => s.file.endsWith(`/${page}`) && s.handler === '(inline)');
      expect(inline, `${page} のその場の送信が走査に無い`).toHaveLength(1);
      expect(inline[0]!.triggers.map((t) => t.gate)).toEqual(['submit-guard']);
    }
  });

  it('★ 押して起きる送信は、どれも押している間の守りを通る (台帳の外)', () => {
    const problems = sites
      .filter((s) => !(key(s) in NOT_GUARDED_BY_STATE))
      .filter((s) => s.triggers.length === 0 || s.triggers.some((t) => t.gate === null))
      .map(describeSite);
    expect(problems, `守りの無い送信 —— useSubmitGuard の .run( を通すか、理由を台帳へ:\n${problems.join('\n')}`).toEqual([]);
  });

  it('台帳は両方向 —— 行は実在し、今も守りの外に在り、理由を持つ', () => {
    for (const [k, reason] of Object.entries(NOT_GUARDED_BY_STATE)) {
      const matched = sites.filter((s) => key(s) === k);
      expect(matched.length, `${k} が走査に無い —— 台帳から外すこと`).toBeGreaterThan(0);
      const stillOutside = matched.some((s) => s.triggers.length === 0 || s.triggers.some((t) => t.gate === null));
      expect(stillOutside, `${k} は全部守られるようになった —— 台帳から外すこと`).toBe(true);
      expect(reason.trim().length, `${k}: 理由が短すぎる`).toBeGreaterThanOrEqual(40);
      expect(reason.trim(), `${k}: 省略形の理由`).not.toMatch(PLACEHOLDER_REASON);
    }
  });

  it('`invoke` を呼ぶ .tsx は、走査が歩いた木の中にしか無い (歩き方が死んでいない)', () => {
    const files = new Set(sites.map((s) => s.file));
    expect(files.size, [...files].join('\n')).toBeGreaterThanOrEqual(25);
    expect([...files].some((f) => f.startsWith('src/renderer/pages/'))).toBe(true);
    expect([...files].some((f) => f.startsWith('src/renderer/components/'))).toBe(true);
  });
});

/** 台帳の理由が保留の決まり文句でないこと (`同上` / `TBD` / `後で`)。 */
const PLACEHOLDER_REASON = /^(同上|TBD|todo|後で|未定)[。.]?$/i;

describe('規則は標本に当たる (対照)', () => {
  const one = (src: string): Site => {
    const got = scanFile('sample.tsx', src);
    expect(got).toHaveLength(1);
    return got[0]!;
  };

  it('理由の針は、禁じたい文面に当たり、実物の理由には当たらない', () => {
    expect('同上。').toMatch(PLACEHOLDER_REASON);
    expect('TBD').toMatch(PLACEHOLDER_REASON);
    for (const reason of Object.values(NOT_GUARDED_BY_STATE)) expect(reason).not.toMatch(PLACEHOLDER_REASON);
  });

  it('★ 直す前の形 —— その場に書いた async の handler は守りなし', () => {
    const s = one(
      [
        'function P() {',
        '  return <button onClick={async () => {',
        "    const r = await window.serviceHub.invoke('emotions', 'analyze-text', { text });",
        '    alert(r.ok);',
        '  }} disabled={n < 1}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.handler).toBe('(inline)');
    expect(s.triggers.map((t) => t.gate)).toEqual([null]);
  });

  it('★ 直した後の形 —— 同じ handler を .run( で包むと submit-guard', () => {
    const s = one(
      [
        'function P() {',
        '  const g = useSubmitGuard();',
        '  return <button onClick={() => void g.run(async () => {',
        "    const r = await window.serviceHub.invoke('emotions', 'analyze-text', { text });",
        '  })} disabled={g.busy || n < 1}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.triggers.map((t) => t.gate)).toEqual(['submit-guard']);
  });

  it('状態を最初の await の前に立て、disabled がそれを読む → busy-disabled', () => {
    const s = one(
      [
        'function P() {',
        '  const send = async () => {',
        '    setSubmitting(true);',
        "    try { await window.serviceHub.invoke('slack', 'post', {}); } finally { setSubmitting(false); }",
        '  };',
        '  return <button onClick={send} disabled={submitting || !text}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.handler).toBe('send');
    expect(s.triggers.map((t) => t.gate)).toEqual(['busy-disabled']);
  });

  it('★ 状態を await の後で立てる形は守りではない (その待ちの間は押せる)', () => {
    const s = one(
      [
        'function P() {',
        '  const send = async () => {',
        '    await prepare();',
        '    setSubmitting(true);',
        "    await window.serviceHub.invoke('slack', 'post', {});",
        '  };',
        '  return <button onClick={send} disabled={submitting}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.triggers.map((t) => t.gate)).toEqual([null]);
  });

  it('倒す値 (false / null / undefined) は立てた状態に数えない', () => {
    expect([...raisedStates('setBusy(false); setError(null); setResult(undefined); setMsg(\'\');')]).toEqual([]);
    expect([...raisedStates('setBusy(true); setPhase(\'x\'); setRunningId(id);')].sort()).toEqual(['busy', 'phase', 'runningId']);
  });

  it('disabled が読むのが状態の別名でも辿る (`const busy = status.kind === …`)', () => {
    const s = one(
      [
        'function Card() {',
        '  async function run() {',
        "    setStatus({ kind: 'busy' });",
        "    await window.serviceHub.invoke('templates', 'export-svg', {});",
        '  }',
        "  const busy = status.kind === 'busy';",
        '  return <button onClick={run} disabled={busy}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.triggers.map((t) => t.gate)).toEqual(['busy-disabled']);
  });

  it('Enter キーの経路: 属性が `!状態` を見てから呼ぶ → busy-condition', () => {
    const s = one(
      [
        'function P() {',
        '  const runAdvisor = async () => {',
        '    setAdvisorBusy(true);',
        "    await window.serviceHub.invoke('stocks', 'advise', {});",
        '  };',
        "  return <input onKeyDown={(e) => { if (e.key === 'Enter' && !advisorBusy) runAdvisor(); }} />;",
        '}',
      ].join('\n'),
    );
    expect(s.triggers.map((t) => t.gate)).toEqual(['busy-condition']);
    // 同じ経路で `!状態` を見なければ守りなし (`<input>` は disabled を持たない)。
    const bare = one(
      [
        'function P() {',
        '  const runAdvisor = async () => {',
        '    setAdvisorBusy(true);',
        "    await window.serviceHub.invoke('stocks', 'advise', {});",
        '  };',
        "  return <input onKeyDown={(e) => { if (e.key === 'Enter') runAdvisor(); }} />;",
        '}',
      ].join('\n'),
    );
    expect(bare.triggers.map((t) => t.gate)).toEqual([null]);
  });

  it('入口で状態を見て戻る → busy-reentry (フォームの送信)', () => {
    const s = one(
      [
        'function P() {',
        '  const send = async (raw) => {',
        '    if (!raw || busy) return;',
        '    setBusy(true);',
        "    await window.serviceHub.invoke('assistant', 'chat', {});",
        '  };',
        '  return <form onSubmit={(e) => { e.preventDefault(); void send(input); }}><input /></form>;',
        '}',
      ].join('\n'),
    );
    expect(s.triggers.map((t) => t.gate)).toEqual(['busy-reentry']);
  });

  it('呼び手の関数を辿る (送る関数を別の関数が呼び、その関数を属性が呼ぶ)', () => {
    const s = one(
      [
        'function P() {',
        '  async function inner() {',
        "    await window.serviceHub.invoke('x', 'y', {});",
        '  }',
        '  function outer() {',
        '    setBusy(true);',
        '    void inner();',
        '  }',
        '  return <button onClick={outer} disabled={busy}>go</button>;',
        '}',
      ].join('\n'),
    );
    expect(s.handler).toBe('inner');
    expect(s.triggers.map((t) => t.gate)).toEqual(['busy-disabled']);
  });

  it('属性から辿れない送信は「押して起きない」(triggers が空) —— 台帳を要求する側に倒れる', () => {
    const s = one(
      [
        'function P() {',
        '  useEffect(() => {',
        "    void window.serviceHub.invoke('x', 'y', {});",
        '  }, []);',
        '  return <div />;',
        '}',
      ].join('\n'),
    );
    expect(s.triggers).toEqual([]);
  });

  it('注記と文字列の中の `.invoke(` は数えない', () => {
    const got = scanFile(
      'sample.tsx',
      [
        '/* 実行は `window.serviceHub.invoke(...)` を通す */',
        "const doc = 'hub.invoke(x)';",
        'function P() { return <div />; }',
      ].join('\n'),
    );
    expect(got).toEqual([]);
  });
});
