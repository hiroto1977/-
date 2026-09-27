import path from 'node:path';
import { readOriginalSource } from '../shared/__tests__/originalSource';
import { RECORD_ENTRY_SERVICE_IDS } from '../shared/recordEntryLimits';
import { stripComments } from '../shared/__tests__/stripNonCode';

/*
 * **二つの版の「書き込み操作の面」を読む助け。**
 *
 * デスクトップ版は `LIVE_ACTIONS` (main/clients/index.ts) の表、ブラウザ版は
 * `web-shim.ts` の `invoke` の if 連鎖。どちらも字面から読むしかないので、
 * 読み方をここに 1 つ置く。読み手は 2 つ:
 *
 *   - `dualBuildActionSurface.test.ts` (ブラウザ版はデスクトップの許可表を超えない)
 *   - `ontologyFacts.ts` (オントロジーのサービス facet 行列)
 *
 * 2026-09-18 まではこの読み方は検査ファイルの中に閉じていて、オントロジーが
 * 同じ物を読むには写すしか無かった (写しは避けられるなら避ける —— 規則は 1 つ)。
 * `*.test.ts` を別の検査から import すると `describe` が二重に走るので、
 * 検査でないモジュールへ出した。
 */

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));
/** リポジトリ相対パスを読む (dualBuildActionSurface の「実物」の検査が使う)。 */
export const readRepoFile = read;

/** `{` から対応する `}` までを返す。 */
export function braceBlock(text: string, from: number): string {
  const b = text.indexOf('{', from);
  let depth = 0;
  for (let i = b; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(b + 1, i);
    }
  }
  return text.slice(b + 1);
}

// ===== デスクトップ版の許可表 =====

/** `LIVE_ACTIONS` の各行 (serviceId → ACTIONS を export しているモジュール名)。 */
export function desktopServiceModules(): Map<string, string> {
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
 * 固定長の窓 (`slice(at, at + 200)`) は注記を 3 行足せば静かに逆へ倒れた
 * (2026-09-12 · パス 166)。**窓ではなく構造で決める**: 初期化子の頭は
 *
 * ```
 *   字面の表   export const ACTIONS: ActionMap = {        ← 最初の `{` が表の開き
 *   組み立て   export const ACTIONS: ActionMap = Object.fromEntries(…);
 * ```
 *
 * なので「`at` から最初の `{` か `;` まで」に `Object.fromEntries` が在るかで決まる。
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
export function actionKeysOf(file: string): string[] {
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
export const KNOWN_EMPTY: readonly string[] = ['cursor'];

/** デスクトップ版の `service/action` の集合と、ACTIONS が空だったサービス。 */
export function desktopPairs(): { pairs: Set<string>; empty: string[] } {
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
export function invokeBody(): string {
  const shim = read('src/renderer/web-shim.ts');
  return stripComments(braceBlock(shim, shim.indexOf('  invoke: async <T>')));
}

/**
 * `record-entry` / `advise` を集合で受ける分岐の対象サービス。
 *
 * ブラウザ版は shared の `RECORD_ENTRY_SERVICE_IDS` を `isRecordEntryServiceId` で読むので、
 * **分岐がその関数で振り分けている**ことを字面で確かめた上で、集合は shared から取る
 * (集合を 2 度書かない)。分岐の形が変われば [] になり、その action が「拾えていない
 * action」として鳴る。
 */
export function sharedSetServices(body: string, action: 'record-entry' | 'advise'): string[] {
  return new RegExp(`action\\s*===\\s*'${action}'\\s*&&\\s*isRecordEntryServiceId\\(serviceId\\)`).test(body)
    ? [...RECORD_ENTRY_SERVICE_IDS]
    : [];
}

/** ブラウザ版の `service/action` の集合。 */
export function browserPairs(body: string): Set<string> {
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
