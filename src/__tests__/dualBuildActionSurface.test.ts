import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../shared/__tests__/originalSource';
import path from 'node:path';
import { RECORD_ENTRY_SERVICE_IDS } from '../shared/recordEntryLimits';

/*
 * **ブラウザ版が、デスクトップ版の許可表に無い操作を実行できてはいけない。**
 *
 * デスクトップ版では書き込み操作は `LIVE_ACTIONS` (main/clients/index.ts) の
 * 表に載っているものだけが `action:invoke` で届く。ブラウザ版には main プロセス
 * が無く、`web-shim.ts` の `invoke` が**長い if 連鎖でそれを代替**している。
 *
 * 連鎖は表ではないので、**片方にだけ生えても誰も気付かない**。ブラウザ版に
 * だけ生えた操作は「デスクトップ版では main に閉じ込めてある処理が、
 * レンダラと同じ文脈で動く」ことを意味する。
 *
 * 実測 (2026-08-23): ブラウザだけに在る操作は **0**。デスクトップだけに在る
 * ものは 16 で、こちらは `action_not_found` を返すだけなので害は無い
 * (ブラウザで動かせない理由がある: `skills/run-skill` はローカル実行、
 * `microsoft-365/*` は CORS、など)。この検査は **0 の側**を留める。
 *
 * ## 走査が的を外すと、この検査は黙って通る
 *
 * 「ブラウザだけに在る操作」は web 側の走査で数える。正規表現が新しい
 * 分岐の書き方を取りこぼすと、集合が小さくなって差が空になり **通ってしまう**。
 * そこで if 連鎖の中の `action === '…'` / `serviceId === '…'` の**字面を全部**
 * 数え、走査結果がその全部を説明できることを別に確かめる。
 */

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));

/** コメントを落とす (説明文の中の例を数えないため)。 */
function stripComments(text: string): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** `{` から対応する `}` までを返す。 */
function braceBlock(text: string, from: number): string {
  const b = text.indexOf('{', from);
  let depth = 0;
  for (let i = b; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(b + 1, i);
    }
  }
  return '';
}

// ===== デスクトップ版の許可表 =====

/** LIVE_ACTIONS の `serviceId: ALIAS` と、その ALIAS の輸入元ファイル。 */
function desktopServiceModules(): Map<string, string> {
  const idx = read('src/main/clients/index.ts');
  const alias = new Map<string, string>();
  for (const m of idx.matchAll(
    /import\s*\{[^}]*\bACTIONS\s+as\s+([A-Z0-9_]+)[^}]*\}\s*from\s*'\.\/([^']+)'/g,
  )) {
    alias.set(m[1]!, m[2]!);
  }
  const table = braceBlock(idx, idx.indexOf('export const LIVE_ACTIONS'));
  const out = new Map<string, string>();
  for (const m of stripComments(table).matchAll(/^\s*'?([a-z0-9-]+)'?:\s*([A-Z0-9_]+),/gm)) {
    const file = alias.get(m[2]!);
    if (file) out.set(m[1]!, file);
  }
  return out;
}

/**
 * `ACTIONS` の初期化子が `Object.fromEntries(...)` で**組み立て**ているか。
 *
 * ## 2026-09-12 (パス 166) に直した形 —— 固定長の窓が条件だった
 *
 * ここは `text.slice(at, at + 200).includes('Object.fromEntries')` だった。
 * 実測すると shopify の `Object.fromEntries` は `export const ACTIONS` から **+34**
 * —— **窓 200 に対し余裕は 166 文字**しかなく、注記を 3 行足せば越える。
 * 越えたときこれは**落ちずに別の枝へ行く** (字面の表として読もうとして鍵が 0 件になり、
 * `KNOWN_EMPTY` との突き合わせで「shopify に action が無い」と**誤った理由で**鳴る)。
 *
 * パス 165 で `browserSnapshotGates` の窓 4000 を 28 文字で踏み抜いたのと同じ形。
 * **窓ではなく構造で決める**: 初期化子の頭は
 *
 * ```
 *   字面の表   export const ACTIONS: ActionMap = {        ← 最初の `{` が表の開き
 *   組み立て   export const ACTIONS: ActionMap = Object.fromEntries(…);
 * ```
 *
 * なので「`at` から最初の `{` か `;` まで」に `Object.fromEntries` が在るかで決まる。
 * 文字数に依らないので、注記を何行足しても倒れない (下の対照で確かめる)。
 */
export function actionsIsComputed(text: string): boolean {
  const at = text.indexOf('export const ACTIONS');
  if (at < 0) return false;
  const brace = text.indexOf('{', at);
  const semi = text.indexOf(';', at);
  const end = Math.min(brace < 0 ? text.length : brace, semi < 0 ? text.length : semi);
  return text.slice(at, end).includes('Object.fromEntries');
}

/** ACTIONS マップから鍵を取る。3 通りの書き方すべて。 */
function actionKeysOf(file: string): string[] {
  const text = read(`src/main/clients/${file}.ts`);
  const at = text.indexOf('export const ACTIONS');
  if (at < 0) return [];
  // shopify は `Object.fromEntries(CONNECTORS.map(…))` で組み立てる。
  // 字面の表が無いので、その元になる CONNECTORS の action 欄から取る。
  if (actionsIsComputed(text)) {
    const arr = text.slice(text.indexOf('export const CONNECTORS'));
    return [...stripComments(arr).matchAll(/\baction:\s*'([^']+)'/g)].map((m) => m[1]!);
  }
  const body = stripComments(braceBlock(text, at));
  const keys = new Set<string>();
  for (const m of body.matchAll(/^\s*'([^']+)'\s*:/gm)) keys.add(m[1]!);
  for (const m of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) keys.add(m[1]!);
  for (const m of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*,\s*$/gm)) keys.add(m[1]!);
  return [...keys];
}

/** 意図的に空の ACTIONS を持つサービス (書き込み操作がまだ無い)。 */
const KNOWN_EMPTY = ['cursor'];

function desktopPairs(): { pairs: Set<string>; empty: string[] } {
  const pairs = new Set<string>();
  const empty: string[] = [];
  for (const [svc, file] of desktopServiceModules()) {
    const keys = actionKeysOf(file);
    if (keys.length === 0) empty.push(svc);
    for (const k of keys) pairs.add(`${svc}/${k}`);
  }
  return { pairs, empty };
}

// ===== ブラウザ版の if 連鎖 =====

/** `invoke:` の本体だけを取る。 */
function invokeBody(): string {
  const shim = read('src/renderer/web-shim.ts');
  return stripComments(braceBlock(shim, shim.indexOf('  invoke: async <T>')));
}

/**
 * `record-entry` / `advise` を集合で受ける分岐の対象サービス。
 *
 * 2026-09-09 (パス 117) までブラウザ版は `RECORD_ENTRY_SERVICES = new Set([…])` を自前で持ち、
 * ここはその字面を読んでいた。いまは shared の `RECORD_ENTRY_SERVICE_IDS` を `isRecordEntryServiceId`
 * で読むので、**分岐がその関数で振り分けている**ことを字面で確かめた上で、集合は shared から取る
 * (集合を 2 度書かない)。分岐の形が変われば [] になり、その action が「拾えていない action」として鳴る。
 * パス 119 で `advise` も同じ形の分岐になった (4 サービスの提案を shared の 1 関数が組む)。
 */
function sharedSetServices(body: string, action: 'record-entry' | 'advise'): string[] {
  return new RegExp(`action\\s*===\\s*'${action}'\\s*&&\\s*isRecordEntryServiceId\\(serviceId\\)`).test(body)
    ? [...RECORD_ENTRY_SERVICE_IDS]
    : [];
}

function browserPairs(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/serviceId\s*===\s*'([^']+)'\s*&&\s*action\s*===\s*'([^']+)'/g)) {
    out.add(`${m[1]}/${m[2]}`);
  }
  for (const m of body.matchAll(/action\s*===\s*'([^']+)'\s*&&\s*serviceId\s*===\s*'([^']+)'/g)) {
    out.add(`${m[2]}/${m[1]}`);
  }
  for (const m of body.matchAll(/serviceId\s*===\s*'([^']+)'\s*&&\s*\(([^)]*action\s*===[^)]*)\)/g)) {
    for (const a of m[2]!.matchAll(/action\s*===\s*'([^']+)'/g)) out.add(`${m[1]}/${a[1]}`);
  }
  for (const action of ['record-entry', 'advise'] as const) {
    for (const svc of sharedSetServices(body, action)) out.add(`${svc}/${action}`);
  }
  return out;
}

/**
 * **判定が文字数に依らないこと** (2026-09-12 · パス 166)。
 *
 * 旧実装 (窓 200) は注記を 3 行足せば静かに逆へ倒れた。ここは**合成した文面**に
 * 当てて、どちらの書き方も・注記が何行在っても正しく分かれることを留める。
 */
describe('ACTIONS の書き方の判定 (パス 166)', () => {
  const LITERAL = "export const ACTIONS: ActionMap = {\n  'create-issue': createIssue,\n};\n";
  const COMPUTED = 'export const ACTIONS: ActionMap = Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n';

  it('字面の表は組み立てではない', () => {
    expect(actionsIsComputed(LITERAL)).toBe(false);
  });

  it('Object.fromEntries は組み立て', () => {
    expect(actionsIsComputed(COMPUTED)).toBe(true);
  });

  it('★ 注記を 300 文字挟んでも倒れない (固定長の窓では倒れた)', () => {
    const note = `// ${'あ'.repeat(300)}\n`;
    expect(actionsIsComputed(note + COMPUTED)).toBe(true);
    expect(actionsIsComputed(note + LITERAL)).toBe(false);
    // 宣言と初期化子の**間**に挟んでも同じ (ここが旧実装の踏み抜き点だった)。
    const between = `export const ACTIONS: ActionMap =\n  ${note}  Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n`;
    expect(actionsIsComputed(between)).toBe(true);
  });

  it('★ 対照: 固定長 200 の窓なら、間に注記を挟むと逆へ倒れていた', () => {
    // 旧実装を再現して、**直した理由が実在した**ことを標本で示す。
    const oldRule = (text: string): boolean => {
      const at = text.indexOf('export const ACTIONS');
      return at >= 0 && text.slice(at, at + 200).includes('Object.fromEntries');
    };
    const note = `// ${'あ'.repeat(300)}\n`;
    const between = `export const ACTIONS: ActionMap =\n  ${note}  Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n`;
    expect(oldRule(between)).toBe(false); // 旧実装は見失う
    expect(actionsIsComputed(between)).toBe(true); // 今の実装は見る
  });

  it('ACTIONS が無い文面は組み立てではない', () => {
    expect(actionsIsComputed('const x = 1;\n')).toBe(false);
  });

  it('★ 実物: 組み立てで書いているのは shopify だけ (母集団を数える)', () => {
    const computed = [...desktopServiceModules().values()]
      .filter((file, i, arr) => arr.indexOf(file) === i)
      .filter((file) => actionsIsComputed(read(`src/main/clients/${file}.ts`)));
    expect(computed).toEqual(['shopify']);
  });
});

describe('二つの版で、実行できる書き込み操作の面が食い違わない', () => {
  const body = invokeBody();
  const web = browserPairs(body);
  const { pairs: desktop, empty } = desktopPairs();

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(body.length, 'invoke の本体を取れていない').toBeGreaterThan(5000);
    expect(desktop.size, 'デスクトップ版の許可表を読めていない').toBeGreaterThanOrEqual(45);
    expect(web.size, 'ブラウザ版の分岐を読めていない').toBeGreaterThanOrEqual(30);
    // ACTIONS が読めなかったサービスは表から静かに消える。意図的に空の
    // ものだけを許す (計算で組み立てる shopify は CONNECTORS から拾う)。
    expect(empty.sort(), 'ACTIONS を読めなかったサービスがあります').toEqual([...KNOWN_EMPTY].sort());
  });

  it('if 連鎖の字面を、走査が全部説明できている', () => {
    // 新しい書き方の分岐 (switch や別の合成) が増えると、`browserPairs` は
    // それを取りこぼす。取りこぼしは差集合を空にして**検査を通してしまう**ので、
    // 字面の側から数え直して突き合わせる。
    const services = new Set([...web].map((p) => p.split('/')[0]!));
    const actions = new Set([...web].map((p) => p.split('/').slice(1).join('/')));
    const looseService = [...body.matchAll(/serviceId\s*===\s*'([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((s) => !services.has(s));
    const looseAction = [...body.matchAll(/action\s*===\s*'([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((a) => !actions.has(a));
    expect(looseService, '走査が拾えていない serviceId の分岐があります').toEqual([]);
    expect(looseAction, '走査が拾えていない action の分岐があります').toEqual([]);
  });

  it('ブラウザ版だけで実行できる書き込み操作が無い', () => {
    const webOnly = [...web].filter((p) => !desktop.has(p)).sort();
    expect(
      webOnly,
      'デスクトップ版の LIVE_ACTIONS に無い操作がブラウザ版で実行できます',
    ).toEqual([]);
  });
});
