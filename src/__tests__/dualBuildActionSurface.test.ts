import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

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

/** ACTIONS マップから鍵を取る。3 通りの書き方すべて。 */
function actionKeysOf(file: string): string[] {
  const text = read(`src/main/clients/${file}.ts`);
  const at = text.indexOf('export const ACTIONS');
  if (at < 0) return [];
  // shopify は `Object.fromEntries(CONNECTORS.map(…))` で組み立てる。
  // 字面の表が無いので、その元になる CONNECTORS の action 欄から取る。
  if (text.slice(at, at + 200).includes('Object.fromEntries')) {
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

/** `record-entry` を集合で受ける分岐の対象サービス。 */
function recordEntryServices(): string[] {
  const shim = read('src/renderer/web-shim.ts');
  const decl = shim.slice(shim.indexOf('RECORD_ENTRY_SERVICES ='));
  const set = decl.slice(0, decl.indexOf(']'));
  return [...set.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
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
  for (const svc of recordEntryServices()) out.add(`${svc}/record-entry`);
  return out;
}

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
