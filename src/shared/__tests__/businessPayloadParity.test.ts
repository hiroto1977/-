/**
 * **画面が payload の型を手書きで写しており、写しが既にずれている。**
 *
 * `BusinessPage.tsx:50` 付近は `CategoryKpi` / `BusinessUnit` / `BusinessSnapshot` を
 * **自前で宣言**している。本物は `main/clients/business.ts` の
 * `CategoryKpi` / `BusinessUnit` / `BusinessOpsSnapshot` で、`renderer` は
 * `main` を import できない (`lint:imports`) ため写しになっていた。
 *
 * **実測したずれ (2026-09-08)** —— 3 件、すべて写しが**広い**方向:
 *
 * | 欄 | client | 画面の写し |
 * | --- | --- | --- |
 * | `BusinessUnit.id` | `BusinessCategoryId` (10 値の合併) | `string` |
 * | `BusinessUnit.trafficKind` | `BusinessCategoryDef['trafficKind']` | 合併を**字面で書き写し** |
 * | `isMock` | `true` | `boolean` |
 *
 * **写しが広い方へずれると代入は通るので `tsc` は黙る** (パス 62 と同じ機構)。
 *
 * ## 一番効くのは `trafficKind` の写し
 *
 * 画面は `TRAFFIC_KIND_LABEL: Record<BusinessUnit['trafficKind'], string>` を
 * **写した合併で鍵付け**し、`TRAFFIC_KIND_LABEL[unit.trafficKind]` を **3 か所**
 * (`:208` `:433` `:484`) で刷る。client に 6 つ目の種類が増えると、
 * 写しにはそれが無いので **Record に項目が無く `undefined`** になり、
 * 3 つの欄が**理由も出ずに空欄**になる。`tsc` は 2 つの合併が別物なので何も言わない。
 *
 * ## ここで留めること / 留めないこと
 *
 * 型の移動 (payload 型を `shared/` に出す) は **75 サービス分の置き場所という設計判断**で、
 * 利用者の指示を待っている (`docs/REMAINING_WORK.md` パス 79)。
 * そこで**リポジトリに既に在る「原文を読む parity 検査」の型**を使い、
 * *ずれが増えたら鳴る*状態にしておく。
 *
 * **既知のずれを「期待値」として書かない。** それは
 * 「見本が欠陥を仕様として固定する」形 (今日 24 例数えた) である ——
 * 理由つきの台帳に載せ、**台帳に無いずれが出たら鳴る**ようにする。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

const CLIENT = join(__dirname, '../../main/clients/business.ts');
const PAGE = join(__dirname, '../../renderer/pages/BusinessPage.tsx');

/** `interface Name { … }` の本体を波括弧の対応で取り出す (正規表現だけでは入れ子で切れる)。 */
function interfaceBody(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?interface\\s+${name}\\s*\\{`).exec(src);
  if (m === null) throw new Error(`interface not found: ${name}`);
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth > 0) {
    if (i >= src.length) throw new Error(`unterminated interface: ${name}`);
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  return src.slice(start, i - 1);
}

/** 本体から「欄名 → 型注釈」を読む (注釈行・コメント行は飛ばす)。 */
function fieldTypes(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) continue;
    const m = /^(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:\s*(.+?);?$/.exec(line);
    // 捕獲群は `noUncheckedIndexedAccess` の下では `string | undefined` になる。
    // マッチが成立していれば在るが、**型検査器は跨いで知らない** —— 明示的に確かめる
    // (`!` で黙らせるより、無かったときに飛ばすほうが安全)。
    const [, name, annotation] = m ?? [];
    if (name !== undefined && annotation !== undefined) out.set(name, annotation.replace(/;$/, '').trim());
  }
  return out;
}

/** `'a' | 'b' | 'c'` を集合にする。 */
const unionMembers = (annotation: string): string[] =>
  [...annotation.matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((x): x is string => x !== undefined)
    .sort();

const clientSrc = readOriginalSource(CLIENT);
const pageSrc = readOriginalSource(PAGE);

/**
 * **既知のずれの台帳。** 理由を書く。台帳に無いずれが出たら鳴る。
 * 解消したら台帳から消す (`payload 型の置き場所` が決まれば全部消える)。
 */
const KNOWN_DRIFT: readonly { readonly iface: string; readonly field: string; readonly why: string }[] = [
  {
    iface: 'BusinessUnit',
    field: 'id',
    why: 'client は BusinessCategoryId (10 値の合併)。画面は main を import できないので string。写しが広いので代入は通る。',
  },
  {
    iface: 'BusinessUnit',
    field: 'trafficKind',
    why: "client は BusinessCategoryDef['trafficKind'] を参照。画面は同じ合併を字面で写している (下の「合併の members が一致する」で留める)。",
  },
  {
    iface: 'Snapshot',
    field: 'isMock',
    why: 'client は true (常に mock を返す fetcher)。画面は boolean —— live 取得でも読めるようにしている。',
  },
];

const PAIRS = [
  ['CategoryKpi', 'CategoryKpi', 'CategoryKpi'],
  ['BusinessUnit', 'BusinessUnit', 'BusinessUnit'],
  ['BusinessOpsSnapshot', 'BusinessSnapshot', 'Snapshot'],
] as const;

describe('business の payload 型 — client と画面の写しが一致している', () => {
  it.each(PAIRS)('★ %s と %s の欄の集合が一致する', (clientName, pageName) => {
    const c = fieldTypes(interfaceBody(clientSrc, clientName));
    const p = fieldTypes(interfaceBody(pageSrc, pageName));
    // 走査の生死: 欄が 1 つも取れていないなら、この検査は何も守っていない。
    expect(c.size, `client ${clientName} の欄`).toBeGreaterThanOrEqual(4);
    expect(p.size, `page ${pageName} の欄`).toBeGreaterThanOrEqual(4);
    expect([...p.keys()].sort()).toEqual([...c.keys()].sort());
  });

  it('★ 注釈のずれは台帳に載っているものだけ (新しいずれが出たら鳴る)', () => {
    const found: { iface: string; field: string; client: string; page: string }[] = [];
    for (const [clientName, pageName, ledgerName] of PAIRS) {
      const c = fieldTypes(interfaceBody(clientSrc, clientName));
      const p = fieldTypes(interfaceBody(pageSrc, pageName));
      for (const [field, cType] of c) {
        const pType = p.get(field);
        if (pType !== undefined && pType !== cType) found.push({ iface: ledgerName, field, client: cType, page: pType });
      }
    }
    const key = (x: { iface: string; field: string }) => `${x.iface}.${x.field}`;
    const ledger = new Set(KNOWN_DRIFT.map(key));
    const unexpected = found.filter((f) => !ledger.has(key(f)));
    expect(unexpected, `台帳に無い注釈のずれ: ${JSON.stringify(unexpected)}`).toEqual([]);
    // 台帳の側も腐らせない: 消えたずれが台帳に残っていたら鳴る。
    const actual = new Set(found.map(key));
    expect(KNOWN_DRIFT.filter((d) => !actual.has(key(d))), '解消済みなのに台帳に残っている').toEqual([]);
  });

  /**
   * **これが実害の本体。** client に 6 つ目の種類が増えたとき、
   * 画面の `TRAFFIC_KIND_LABEL` に項目が無いと 3 か所が空欄になる。
   */
  it('★ trafficKind の合併の members が client と一致する', () => {
    const cUnion = unionMembers(
      fieldTypes(interfaceBody(clientSrc, 'BusinessCategoryDef')).get('trafficKind') ?? '',
    );
    const pUnion = unionMembers(fieldTypes(interfaceBody(pageSrc, 'BusinessUnit')).get('trafficKind') ?? '');
    expect(cUnion.length, 'client の trafficKind の members').toBeGreaterThanOrEqual(5);
    expect(pUnion).toEqual(cUnion);
  });

  it('★ TRAFFIC_KIND_LABEL に client の全種類の鍵が在る (空欄が出ない)', () => {
    const cUnion = unionMembers(
      fieldTypes(interfaceBody(clientSrc, 'BusinessCategoryDef')).get('trafficKind') ?? '',
    );
    const m = /const TRAFFIC_KIND_LABEL[^=]*=\s*\{([^}]*)\}/.exec(pageSrc);
    const body = m?.[1];
    expect(body, 'TRAFFIC_KIND_LABEL が見つからない').toBeDefined();
    const keys = [...(body ?? '').matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)]
      .map((x) => x[1])
      .filter((x): x is string => x !== undefined)
      .sort();
    expect(keys.length, 'ラベルの鍵').toBeGreaterThanOrEqual(5);
    expect(keys).toEqual(cUnion);
  });

  it('★ 標本: 抽出そのものが働いている (欄名と注釈が実際に取れる)', () => {
    const c = fieldTypes(interfaceBody(clientSrc, 'CategoryKpi'));
    expect(c.get('revenue')).toBe('number');
    expect(c.get('profitMargin')).toBe('number');
    const u = fieldTypes(interfaceBody(clientSrc, 'BusinessUnit'));
    expect(u.get('id')).toBe('BusinessCategoryId');
    expect(u.get('history')).toBe('readonly CategoryKpi[]');
  });
});
