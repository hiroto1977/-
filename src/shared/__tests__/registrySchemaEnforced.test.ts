/**
 * **台帳の宣言 (`orchestration/registry.schema.json`) を、門が丸ごと検める** (2026-09-26 · パス 484)。
 *
 * ## なぜ在るか (実測)
 *
 * 門 (`scripts/verify-orchestration.cjs`) の冒頭は「1. JSON は registry.schema.json の
 * 必須構造を満たす (簡易チェック)」と書いていたが、実際に見ていたのは最上位の必須キーと、
 * 門が自分で書いた個々の不変条件だけだった。宣言された制約を 1 つずつ実物の写しで破って
 * 門を走らせると:
 *
 * | | 件数 |
 * | --- | ---: |
 * | 宣言された制約 | 153 |
 * | 門が鳴る | 85 |
 * | **門が素通りさせる** | **67** |
 *
 * 素通りした中に**製品が読む欄**が在った (実物の関数で測った):
 *
 * | 壊し方 (門は exit 0) | 製品 |
 * | --- | --- |
 * | チームの `domain` が無い / 数 | 村の計画 (`buildVillagers` / `buildDispatchPlan`) が**投げる**・チャットの振り分け (`routeTopic`) も投げる |
 * | 役員 / 秘書室の `title` が無い | 村が**投げる** |
 * | `active: "false"` (文字列) | 止めたチームが**真として数えられ**村に居続ける |
 * | backlog の `status` の綴り違い | dispatch から黙って外れ、村では完了の色で塗られる |
 *
 * `npm test` のうち `registry.json` に関わる 120 本 (1,237 件) を同じ壊し方で走らせても、
 * 綴り違いの `status` は**全件緑**だった (投げる形は村の検査が偶然拾う —— 門ではない)。
 *
 * ## この検査が見ること
 *
 * 1. 実物の台帳は宣言をすべて満たし、宣言は検証器が知っているキーワードだけで書かれている
 * 2. **宣言のどの制約も、破れば検証器が名指しする** —— 母集団は宣言を歩いて導く
 *    (手で並べると、宣言に足した制約が検査の外に出る)
 * 3. **門のプロセスがその検証器を使っている** —— 判定を関数として呼ぶ検査だけだと、
 *    `main` が使わなくなっても黙る (パス 472 / 475 / 483 と同じ形)
 * 4. 門の必須キーは宣言の `required` と同じ物 (宣言が門より弱くない)
 * 5. 知らないキーワードは落ちる (宣言に足した制約が門に届かないまま残らない)
 * 6. 題名の `pattern` (制御文字・双方向制御・不可視文字を通さない) は、
 *    `lint:charset` の群 + 改行・タブと **BMP の全コードポイントで**一致する
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readOriginalSource } from './originalSource';

const REPO = resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const subset = req('../../../scripts/lib/json-schema-subset.cjs') as {
  validateAgainstSchema: (schema: unknown, value: unknown, where?: string) => string[];
  SUPPORTED_KEYWORDS: ReadonlySet<string>;
  ANNOTATION_KEYWORDS: ReadonlySet<string>;
};
const untrusted = req('../../../scripts/lib/untrusted-text.cjs') as {
  unsafeCharsIn: (text: string) => { name: string; codePoints: string[] }[];
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type SchemaNode = { [k: string]: unknown };

const schema = JSON.parse(readOriginalSource(join(REPO, 'orchestration', 'registry.schema.json'))) as SchemaNode;
const registry = (): { [k: string]: Json } =>
  JSON.parse(readOriginalSource(join(REPO, 'orchestration', 'registry.json'))) as { [k: string]: Json };

const isObj = (v: unknown): v is { [k: string]: Json } => v !== null && typeof v === 'object' && !Array.isArray(v);

// --- 宣言を歩いて、制約の母集団を導く ----------------------------------------

type Step = { prop: string } | { item: true } | { extra: readonly string[] };
interface Constraint {
  readonly steps: readonly Step[];
  readonly kind: 'type' | 'enum' | 'pattern' | 'minimum' | 'minItems' | 'minLength' | 'maxLength' | 'required';
  readonly arg: unknown;
}

function constraints(node: SchemaNode, steps: readonly Step[] = [], out: Constraint[] = []): Constraint[] {
  if (typeof node.type === 'string') out.push({ steps, kind: 'type', arg: node.type });
  for (const kind of ['enum', 'pattern', 'minimum', 'minItems', 'minLength', 'maxLength'] as const) {
    if (Object.hasOwn(node, kind)) out.push({ steps, kind, arg: node[kind] });
  }
  if (Array.isArray(node.required)) for (const k of node.required) out.push({ steps, kind: 'required', arg: k });
  const props = isObj(node.properties) ? (node.properties as { [k: string]: SchemaNode }) : {};
  for (const [k, sub] of Object.entries(props)) constraints(sub, [...steps, { prop: k }], out);
  if (isObj(node.items)) constraints(node.items as SchemaNode, [...steps, { item: true }], out);
  if (isObj(node.additionalProperties)) {
    constraints(node.additionalProperties as SchemaNode, [...steps, { extra: Object.keys(props) }], out);
  }
  return out;
}

interface Located {
  readonly holder: { [k: string]: Json } | Json[];
  readonly key: string | number;
  readonly path: string;
}

/**
 * 写しの中で制約の当たる場所を探す。配列は**次の段が在る最初の要素**を選び、
 * 最後の段の欄が無い (任意の欄) ときはその欄を作って当てる —— 実物に 1 件も無い
 * 任意の欄 (`source`) も母集団から落とさない。
 */
function locate(root: { [k: string]: Json }, steps: readonly Step[]): Located | null {
  let frontier: Located[] = [{ holder: { $: root } as { [k: string]: Json }, key: '$', path: '$' }];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const last = i === steps.length - 1;
    const next: Located[] = [];
    for (const f of frontier) {
      const v = (f.holder as { [k: string]: Json })[f.key as string] ?? (f.holder as Json[])[f.key as number];
      if ('item' in step) {
        if (Array.isArray(v)) v.forEach((_, j) => next.push({ holder: v, key: j, path: `${f.path}[${j}]` }));
      } else if ('extra' in step) {
        if (isObj(v)) {
          for (const k of Object.keys(v)) if (!step.extra.includes(k)) next.push({ holder: v, key: k, path: `${f.path}.${k}` });
        }
      } else if (isObj(v) && (Object.hasOwn(v, step.prop) || last)) {
        next.push({ holder: v, key: step.prop, path: `${f.path}.${step.prop}` });
      }
    }
    // 次の段が在る要素を先に (任意の欄は作れるので、作る物は後回しにする)。
    frontier = next.sort((a, b) => Number(!Object.hasOwn(a.holder, a.key)) - Number(!Object.hasOwn(b.holder, b.key)));
  }
  return frontier[0] ?? null;
}

const WRONG_TYPE: { [t: string]: Json } = { string: 42, integer: '1', number: 'x', boolean: 'true', array: {}, object: [] };

/** 制約を 1 つ破った写しと、問題文が名指しすべき場所。当てる所が無ければ null。 */
function breakOne(c: Constraint): { reg: unknown; expectPath: string } | null {
  const reg = registry();
  if (c.steps.length === 0 && c.kind === 'type') return { reg: [], expectPath: '$' };
  const loc = locate(reg, c.steps);
  if (!loc) return null;
  const h = loc.holder as { [k: string]: Json };
  switch (c.kind) {
    case 'type': h[loc.key as string] = WRONG_TYPE[c.arg as string]!; return { reg, expectPath: loc.path };
    case 'enum': h[loc.key as string] = 'zz-not-in-enum'; return { reg, expectPath: loc.path };
    case 'pattern': h[loc.key as string] = 'Bad Id!\u0007'; return { reg, expectPath: loc.path };
    case 'minimum': h[loc.key as string] = (c.arg as number) - 1; return { reg, expectPath: loc.path };
    case 'minItems': h[loc.key as string] = []; return { reg, expectPath: loc.path };
    case 'minLength': h[loc.key as string] = ''; return { reg, expectPath: loc.path };
    case 'maxLength': h[loc.key as string] = 'x'.repeat((c.arg as number) + 1); return { reg, expectPath: loc.path };
    case 'required': {
      const obj = c.steps.length === 0 ? reg : h[loc.key as string];
      if (!isObj(obj)) return null;
      delete obj[c.arg as string];
      return { reg, expectPath: c.steps.length === 0 ? '$' : loc.path };
    }
  }
}

// --- 門を丸ごと走らせる -------------------------------------------------------

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function gate(reg: unknown): { status: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'registry-schema-'));
  tmpDirs.push(dir);
  const f = join(dir, 'registry.json');
  writeFileSync(f, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
  const r = spawnSync('node', [join(REPO, 'scripts', 'verify-orchestration.cjs'), '--registry', f], { encoding: 'utf8' });
  return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('台帳の宣言を門が丸ごと検める (パス 484)', () => {
  const all = constraints(schema);

  it('実物の台帳は宣言をすべて満たし、宣言は検証器が知っているキーワードだけで書かれている', () => {
    expect(subset.validateAgainstSchema(schema, registry())).toEqual([]);
    const unknown: string[] = [];
    const walk = (n: unknown, where: string): void => {
      if (!isObj(n)) return;
      for (const k of Object.keys(n)) {
        if (!subset.SUPPORTED_KEYWORDS.has(k) && !subset.ANNOTATION_KEYWORDS.has(k)) unknown.push(`${where}.${k}`);
      }
      if (isObj(n.properties)) for (const [k, s] of Object.entries(n.properties)) walk(s, `${where}.${k}`);
      walk(n.items, `${where}[]`);
      walk(n.additionalProperties, `${where}.*`);
    };
    walk(schema, '$');
    expect(unknown).toEqual([]);
  });

  it('★ 宣言のどの制約も、破れば検証器が名指しする (母集団は宣言から導く)', () => {
    // 床: 宣言を歩く走査が空虚でない (実測 158 —— 2026-09-26)。
    expect(all.length).toBeGreaterThanOrEqual(150);
    const silent: string[] = [];
    const unreached: string[] = [];
    for (const c of all) {
      const broken = breakOne(c);
      const label = `${c.steps.map((s) => ('prop' in s ? s.prop : 'item' in s ? '[]' : '*')).join('.')} ${c.kind} ${JSON.stringify(c.arg)}`;
      if (!broken) { unreached.push(label); continue; }
      const problems = subset.validateAgainstSchema(schema, broken.reg);
      if (!problems.some((p) => p.startsWith(`${broken.expectPath}:`) || p.startsWith(`${broken.expectPath}.`) || p.startsWith(`${broken.expectPath}[`))) {
        silent.push(`${label} → ${JSON.stringify(problems.slice(0, 2))}`);
      }
    }
    expect(unreached, '当てる場所が見つからない制約 (母集団から黙って落ちる)').toEqual([]);
    expect(silent, '破っても名指しされない制約').toEqual([]);
  });

  it('★ 実物に 1 件も無い任意の欄も母集団に入る (backlog の source)', () => {
    const src = all.filter((c) => c.steps.some((s) => 'prop' in s && s.prop === 'source'));
    expect(src.map((c) => c.kind).sort()).toEqual(['enum', 'type']);
    const broken = breakOne(src.find((c) => c.kind === 'enum')!)!;
    expect(subset.validateAgainstSchema(schema, broken.reg).join('\n')).toContain('$.backlog[0].source');
  });

  it('★ 門のプロセスが検証器を使っている —— 製品が読む欄の 3 形が exit 1 で名指しされる', () => {
    const typo = registry();
    ((typo.backlog as { [k: string]: Json }[])[0]!).status = 'designd';
    const g1 = gate(typo);
    expect(g1.status, g1.out).toBe(1);
    expect(g1.out).toContain('$.backlog[0].status');

    const active = registry();
    ((active.teams as { [k: string]: Json }[])[0]!).active = 'false';
    const g2 = gate(active);
    expect(g2.status, g2.out).toBe(1);
    expect(g2.out).toContain('$.teams[0].active');

    const noDomain = registry();
    delete ((noDomain.teams as { [k: string]: Json }[])[0]!).domain;
    const g3 = gate(noDomain);
    expect(g3.status, g3.out).toBe(1);
    expect(g3.out).toContain('必須の "domain"');

    // 対照: 健全な写しは通る (鳴るのは壊したからであって、写しの置き方のせいではない)。
    expect(gate(registry()).status).toBe(0);
  });

  it('★ 門の必須キーは宣言の required から読む (宣言が門より弱くない)', () => {
    const required = schema.required as string[];
    expect(required).toContain('org');
    for (const key of required) {
      const reg = registry();
      delete reg[key];
      const g = gate(reg);
      expect(g.status, key).toBe(1);
      expect(g.out, key).toContain(`必須キー "${key}"`);
    }
  });

  it('★ 知らないキーワード・読めない宣言は落ちる (黙って読み飛ばさない)', () => {
    const v = subset.validateAgainstSchema;
    expect(v({ type: 'string', format: 'email' }, 'x').join()).toContain('未対応のキーワード "format"');
    expect(v({ type: ['string', 'null'] }, 'x').join()).toContain('未対応');
    expect(v({ type: 'array', items: [{ type: 'string' }] }, ['x']).join()).toContain('組の配列は未対応');
    expect(v({ type: 'string', maxLength: '3' }, 'x').join()).toContain('数ではありません');
    expect(v({ type: 'string', pattern: '(' }, 'x').join()).toContain('正規表現として読めません');
    // 標本: 知っているキーワードだけなら宣言の側は何も言わない。
    expect(v({ type: 'string', maxLength: 3, description: '注記' }, 'abc')).toEqual([]);
  });

  it('★ 長さは文字で数える (絵文字 1 字は 1 字)', () => {
    const v = subset.validateAgainstSchema;
    expect(v({ type: 'string', maxLength: 1 }, '😀')).toEqual([]);
    expect(v({ type: 'string', maxLength: 1 }, '😀😀')).toHaveLength(1);
    expect(v({ type: 'string', minLength: 1 }, '')).toHaveLength(1);
    // 標本: UTF-16 の単位で数えると 1 字の絵文字が上限 1 を超える (直す前の数え方の誤り)。
    expect('😀'.length).toBe(2);
  });

  it('★ 鍵は自分の属性として見る (prototype の名前を宣言や値と取り違えない)', () => {
    const v = subset.validateAgainstSchema;
    // 宣言に無い constructor を properties から引かない / 値に無い required を prototype で満たさない。
    expect(v({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false }, { constructor: 1 })).toEqual([
      '$: 宣言に無い "constructor" があります',
    ]);
    expect(v({ type: 'object', required: ['toString'] }, {})).toEqual(['$: 必須の "toString" がありません']);
  });
});

describe('題名の pattern と lint:charset の群 (+ 改行・タブ) は BMP の全域で一致する (パス 484)', () => {
  const titleSpec = ((((schema.properties as SchemaNode).backlog as SchemaNode).items as SchemaNode).properties as SchemaNode)
    .title as SchemaNode;
  const re = new RegExp(titleSpec.pattern as string, 'u');

  it('★ 0x0000〜0xFFFF のどの字でも、宣言が断る ⇔ 取り込み口が断る', () => {
    const mismatch: string[] = [];
    let unsafe = 0;
    for (let cp = 0; cp <= 0xffff; cp += 1) {
      const ch = String.fromCharCode(cp);
      const byUntrusted = untrusted.unsafeCharsIn(ch).length > 0;
      const bySchema = !re.test(ch);
      if (byUntrusted) unsafe += 1;
      if (byUntrusted !== bySchema) mismatch.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
    expect(mismatch).toEqual([]);
    // 断る字の数そのもの: C0 (Tab・LF・CR を含む) 32 + DEL 1 + C1 32
    // + 双方向制御 11 (U+200E/F・U+202A〜E・U+2066〜9) + 不可視 8 (U+00AD・U+200B・U+2060〜4・U+FEFF) = 84。
    // ZWJ / ZWNJ (U+200C/D) は絵文字の連結に要るので数えない (lint:charset と同じ判断)。
    expect(unsafe).toBe(84);
  });

  it('標本: 絵文字の連結 (ZWJ) と普通の文は通り、ESC・RLO・タブは断る', () => {
    for (const ok of ['PDF で書き出したい', 'A|B の切替', '👨‍👩‍👧 の家計簿', 'C:\\Users', '<b>太字</b>']) {
      expect(re.test(ok), ok).toBe(true);
      expect(untrusted.unsafeCharsIn(ok), ok).toEqual([]);
    }
    for (const bad of ['要望\u001b[2K', '逆\u202e転', 'タブ\tあり', '改\n行', '見えない\u200b字']) {
      expect(re.test(bad), JSON.stringify(bad)).toBe(false);
      expect(untrusted.unsafeCharsIn(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
});
