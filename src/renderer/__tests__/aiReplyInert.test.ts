/*
 * **最小権限 —— AI の応答は手足を動かさない** (2026-10-29 · パス 552 · threat: T-217)。
 *
 * 「AI の頭は騙せても、システムの手足は動かない」の 3 枚目。実測 (2026-10-29): AI の応答
 * (`assistant/chat` ほか egress の action の戻り) を読む画面は 11 枚で、その値が流れる先は
 * 描画・読み上げ・会話履歴・端末内のファイル書き出しだけ —— **外部へ書く action・網・OS の扉へ
 * 渡す経路は 0 件**だった。この検査はその 0 件を**census として固定する**: 12 枚目の画面が
 * 「AI の答えをそのまま Slack へ送る」「AI が返した URL を開く」を足した日に鳴る。
 *
 * 数え方:
 *   - AI の応答の束縛 = `invoke<ActionData<'<egress の action>'>>` の戻りを受ける `const X =` と、
 *     `useState<ActionData<'<egress の action>'>>` の `[X, setX]`。egress かは `ACTION_TIER` が決める
 *     (台帳が増えれば母集団も増える —— 手で並べない)。
 *   - 手足 = `invoke(` のうち action の段階が external-write / egress の物・`openExternal(`・`fetch(`・
 *     `window.open(`。その引数の中に AI の束縛の名前が現れたら落ちる。
 *   - 端末内 (local-write / read) へ渡すのは許す —— 株式 / 経営のダッシュボード書き出し (ファイル) が
 *     AI の推奨を載せる設計 (stocks.ts の `isAdvisorResult`)。外へは出ない。
 *
 * 限界 (正直に書く): 綴りの走査なので、AI の答えを別の名前の変数へ写してから渡す形は映らない
 * (`const t = r.data.text; invoke('slack','send-message',{text: t})`)。それは `t` が外へ出る時点で
 * 出力インターセプター (T-215) が中身を見るので、2 枚目の層が受ける。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_TIER, OUTBOUND_TIERS } from '../../shared/actionTier';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const RENDERER = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readOriginalDirEntries(dir)) {
    const p = path.join(dir, ent.name);
    if (ent.name === '__tests__' || ent.name === '__audits__') continue;
    if (ent.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

const EGRESS_ACTIONS = new Set(Object.entries(ACTION_TIER).filter(([, t]) => t === 'egress').map(([k]) => k));

/** AI の応答を受ける束縛の名前 (ファイル単位)。 */
export function aiBindings(src: string): string[] {
  const names = new Set<string>();
  const invokeRe = /const\s+(\w+)\s*=\s*await\s+(?:window\.serviceHub\.|hub\.)?invoke<ActionData<'([a-z0-9-]+\/[A-Za-z-]+)'>>/g;
  const stateRe = /const\s+\[(\w+),\s*\w+\]\s*=\s*useState<ActionData<'([a-z0-9-]+\/[A-Za-z-]+)'>/g;
  for (const re of [invokeRe, stateRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (EGRESS_ACTIONS.has(m[2]!)) names.add(m[1]!);
  }
  return [...names].sort();
}

/** 括弧の釣り合いで呼び出しの引数の文字列を取る。 */
function argsAfter(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1);
}

export interface Sink {
  readonly kind: 'invoke' | 'openExternal' | 'fetch' | 'window.open';
  readonly action: string | null;
  readonly args: string;
}

/** 手足 (外へ出る呼び出し) を全部取る。`invoke` は action の段階が外向きの物だけ。 */
export function outboundSinks(src: string): Sink[] {
  const out: Sink[] = [];
  const re = /\b(invoke|openExternal|fetch|window\.open)\b(?:<[^(]*?>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const kind = m[1] as Sink['kind'];
    const args = argsAfter(src, m.index + m[0].length - 1);
    if (kind === 'invoke') {
      const lit = args.match(/^\s*'([a-z0-9-]+)'\s*,\s*'([A-Za-z-]+)'/);
      const action = lit ? `${lit[1]}/${lit[2]}` : null;
      // action が字面で読めない invoke は「外向き」と見なす (fail closed)。
      const tier = action !== null ? ACTION_TIER[action] ?? 'external-write' : 'external-write';
      if (!OUTBOUND_TIERS.has(tier)) continue;
      out.push({ kind, action, args });
    } else {
      out.push({ kind, action: null, args });
    }
  }
  return out;
}

/** AI の束縛が手足の引数に現れている所。 */
export function aiReachesSink(src: string): string[] {
  const names = aiBindings(src);
  if (names.length === 0) return [];
  const problems: string[] = [];
  for (const s of outboundSinks(src)) {
    for (const n of names) {
      if (new RegExp(`\\b${n}\\b`).test(s.args)) problems.push(`${s.kind}${s.action ? ` ${s.action}` : ''} ← ${n}`);
    }
  }
  return problems;
}

const files = walk(RENDERER);
const consumers = files
  .map((f) => ({ rel: path.relative(RENDERER, f).replace(/\\/g, '/'), src: stripComments(readOriginalSource(f)) }))
  .filter((f) => aiBindings(f.src).length > 0);

/** AI の応答を受ける画面と、その束縛の名前 (両方向)。 */
const CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  'components/ChatbotWidget.tsx': ['res'],
  'pages/AssistantPage.tsx': ['r', 'res', 'resAll'],
  'pages/BusinessPage.tsx': ['advisorResult', 'r'],
  'pages/EmotionsPage.tsx': ['res'],
  'pages/GmailPage.tsx': ['res'],
  'pages/MentorPage.tsx': ['r'],
  'pages/OllamaPage.tsx': ['res'],
  'pages/SecurityPage.tsx': ['breachResult', 'res'],
  'pages/SkillsPage.tsx': ['res'],
  'pages/SlackPage.tsx': ['res'],
  'pages/StocksPage.tsx': ['advisorResult', 'r'],
  'pages/VillagePage.tsx': ['res'],
};

describe('AI の応答は手足を動かさない (threat: T-217)', () => {
  it('★ 母集団: AI の応答を受ける画面は台帳と一致する (両方向)', () => {
    const real = Object.fromEntries(consumers.map((c) => [c.rel, aiBindings(c.src)]));
    expect(real).toEqual(CONSUMERS);
    expect(consumers.length).toBeGreaterThanOrEqual(10);
  });

  it('★ どの画面でも、AI の束縛は外向きの invoke / openExternal / fetch / window.open の引数に現れない', () => {
    const problems = consumers.flatMap((c) => aiReachesSink(c.src).map((p) => `${c.rel}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('対照: AI の答えを Slack へ送る形・AI の返した URL を開く形は落ち、端末内へ書く形は通る', () => {
    const head = "const r = await hub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', { messages });\n";
    expect(aiReachesSink(head + "await hub.invoke('slack', 'send-message', { channel: '#x', text: r.data.text });")).toEqual([
      'invoke slack/send-message ← r',
    ]);
    expect(aiReachesSink(head + 'await hub.openExternal(r.data.text);')).toEqual(['openExternal ← r']);
    expect(aiReachesSink(head + "await fetch('https://x.example', { body: r.data.text });")).toEqual(['fetch ← r']);
    expect(aiReachesSink(head + "await hub.invoke('stocks', 'export-dashboard', { advisorResult: r.data });")).toEqual([]);
    // 名前の部分一致では当てない (`r` と `rows`)
    expect(aiReachesSink(head + "await hub.invoke('slack', 'send-message', { text: rows.join() });")).toEqual([]);
  });

  it('対照: 字面で action が読めない invoke は外向きと見なす (fail closed)', () => {
    const head = "const r = await hub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', {});\n";
    expect(aiReachesSink(head + 'await hub.invoke(service, action, { text: r.data.text });')).toEqual(['invoke ← r']);
  });

  it('egress の action は台帳から導き、空ではない', () => {
    expect(EGRESS_ACTIONS.has('assistant/chat')).toBe(true);
    expect(EGRESS_ACTIONS.size).toBeGreaterThanOrEqual(10);
  });
});
