import { describe, expect, it } from 'vitest';
import { join, relative, resolve, sep } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **「main はこの問いを 1 度も発しない」の根拠を、機械に持たせる。** (2026-09-15 · パス 281)
 *
 * `scripts/shared-judgement-census.cjs` は「述語は共有したが、no と言われたあとの
 * 動作が両ビルドで違う」の**母集団**を数え、行ごとの判断は `VERDICTS` の散文が持つ。
 * その 31 行のうち 6 行は「**到達の鎖を端まで辿った結果、main 側は否定で答える関数を
 * 1 度も呼ばない**」と述べている —— つまり散文が到達の事実を主張している。
 *
 * ## パス 281 で見つけた欠陥 —— 1 ホップで測って閉包について述べていた
 *
 * `depreciation` の行はこう書いてあった:
 *
 *     到達の鎖は `taxCalc.ts` 1 本だけで、**`taxCalc.ts` を import する
 *     main / preload のファイルは 0 件** (実測)。税の計算は画面 (renderer) だけが読む。
 *
 * 前半は**真**である (`src/main` / `src/preload` の中に `taxCalc` を直に import する
 * ファイルは無い)。ところが後半は**偽**だった —— 実測した鎖は
 *
 *     src/main/clients/funding.ts → src/shared/funding.ts
 *       → src/shared/taxCalc.ts → src/shared/depreciation.ts
 *
 * で、`shared/funding.ts` を 1 枚はさんで main へ繋がっている。**census 自身は
 * 閉包で到達を測る** (パス 268 でそう直した) ので、この行が母集団に入っている
 * こと自体がその証拠である —— 到達していなければ行は存在しない。
 * 散文は自分をここへ載せた計算と矛盾していた。
 *
 * 結論 (「非対称は起きない」) は**今も正しい**。ただし理由が違う ——
 * 鎖の辺がどれも**定数だけ**で、`taxCalc` は `depreciation` の関数を 1 つも呼ばない。
 * `controlChars` (パス 280) と同じ形: **読まれてはいたが、足りなかった。**
 *
 * ## この検査が留めるもの
 *
 * 散文が引く到達の事実を、**両方向**に鳴る形で置く:
 *
 *   ① main から対象モジュールへの閉包の最短路が、台帳の鎖と一致する
 *      (経路が変われば鳴る —— 増えても減っても)
 *   ② 鎖の各辺が持ち出す名前が、台帳の集合と一致する
 *      (`taxCalc` が `isSchedulableLife` を取り始めれば鳴る)
 *   ③ 「定数だけ」と台帳が言う辺は、名前が実際に `export const` である
 *      (定数が関数に化ければ鳴る)
 *
 * 到達の**call** の辺までは証明しない (AST を入れない約束)。留めるのは
 * **散文が引いている事実**であって、散文の結論ではない ——
 * 事実が動いたら人が読み直す、という所までを機械が受け持つ。
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** 走査から外す枝。`shared-judgement-census.cjs` の `sourceFiles` と同じ考え。 */
const SKIP_DIRS: ReadonlySet<string> = new Set(['__tests__', 'node_modules']);

/** repo 相対の道 (POSIX 区切り)。 */
type Rel = string;

interface PinnedEdge {
  /** 取り込む側 (repo 相対)。 */
  readonly from: Rel;
  /** 取り込まれる側 (repo 相対)。 */
  readonly to: Rel;
  /** 値として持ち出す名前 (型だけの import は数えない)。 */
  readonly values: readonly string[];
  /** 真なら `values` はすべて `export const` でなければならない。 */
  readonly constantsOnly: boolean;
}

interface PinnedReach {
  /** `VERDICTS` の鍵。 */
  readonly verdict: string;
  /** main 側の入口から対象モジュールまでの閉包の最短路 (repo 相対・両端を含む)。 */
  readonly chain: readonly Rel[];
  /** 鎖の辺のうち、名前を留める物。 */
  readonly edges: readonly PinnedEdge[];
  /** 散文の中に必ず現れる語 (行と pin を結ぶ)。 */
  readonly quotes: readonly string[];
}

/**
 * 散文が引いている到達の事実。
 *
 * **6 行ぶんを 3 本の鎖が支える** —— `hydroponicCrops` / `hydroponics` /
 * `readNumeric` は同じ 1 本の鎖 (水耕栽培) の上に在り、
 * `mutualFundsMetrics` / `savingsPlanning` は同じ 1 本 (助言) の上に在る。
 */
const PINNED: readonly PinnedReach[] = [
  {
    verdict: 'depreciation',
    chain: [
      'src/main/clients/funding.ts',
      'src/shared/funding.ts',
      'src/shared/taxCalc.ts',
      'src/shared/depreciation.ts',
    ],
    edges: [
      {
        from: 'src/shared/funding.ts',
        to: 'src/shared/taxCalc.ts',
        values: ['CONSUMPTION_TAX_STANDARD'],
        constantsOnly: true,
      },
      {
        from: 'src/shared/taxCalc.ts',
        to: 'src/shared/depreciation.ts',
        values: [
          'SME_ANNUAL_CAP',
          'SME_MEASURE_END',
          'SME_UNIT_LIMIT',
          'SME_UNIT_LIMIT_BEFORE_STEP',
          'SME_UNIT_LIMIT_STEP_DATE',
        ],
        constantsOnly: true,
      },
    ],
    // パス 281 で書き直した行。**古い偽の理由に戻っていないこと**も見る。
    quotes: ['funding.ts', '定数'],
  },
  {
    verdict: 'hydroponicCrops',
    chain: [
      'src/main/clients/hydroponics.ts',
      'src/shared/hydroponicsControl.ts',
      'src/shared/hydroponicCrops.ts',
    ],
    edges: [
      {
        from: 'src/main/clients/hydroponics.ts',
        to: 'src/shared/hydroponicsControl.ts',
        values: ['buildHydroponicsSnapshot'],
        constantsOnly: false,
      },
    ],
    quotes: ['buildHydroponicsSnapshot'],
  },
  {
    verdict: 'readNumeric',
    chain: [
      'src/main/clients/hydroponics.ts',
      'src/shared/hydroponicsControl.ts',
      'src/shared/hydroponicCrops.ts',
      'src/shared/readNumeric.ts',
    ],
    edges: [
      {
        from: 'src/shared/hydroponicCrops.ts',
        to: 'src/shared/readNumeric.ts',
        values: ['readNumeric'],
        constantsOnly: false,
      },
    ],
    quotes: ['buildHydroponicsSnapshot'],
  },
  {
    verdict: 'mutualFundsMetrics',
    chain: [
      'src/main/clients/demae-can.ts',
      'src/shared/serviceAdvisor.ts',
      'src/shared/mutualFundsMetrics.ts',
    ],
    edges: [
      {
        from: 'src/shared/serviceAdvisor.ts',
        to: 'src/shared/mutualFundsMetrics.ts',
        values: ['RETURN_FLOOR_PCT', 'isImpossibleReturnPct'],
        constantsOnly: false,
      },
    ],
    quotes: ['RETURN_FLOOR_PCT', 'isImpossibleReturnPct'],
  },
  {
    verdict: 'savingsPlanning',
    chain: [
      'src/main/clients/demae-can.ts',
      'src/shared/serviceAdvisor.ts',
      'src/shared/mutualFundsMetrics.ts',
      'src/shared/savingsPlanning.ts',
    ],
    edges: [
      {
        from: 'src/shared/mutualFundsMetrics.ts',
        to: 'src/shared/savingsPlanning.ts',
        values: ['isPlannableRate', 'isPlannableYears'],
        constantsOnly: false,
      },
    ],
    quotes: ['isPlannableRate', 'isPlannableYears'],
  },
];

/** repo の中の .ts / .tsx (検査と型定義を除く)。 */
function sourceFiles(): Rel[] {
  const found: Rel[] = [];
  const walk = (absDir: string): void => {
    for (const e of readOriginalDirEntries(absDir)) {
      const p = join(absDir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || /\.d\.ts$/.test(e.name)) continue;
      found.push(relative(REPO_ROOT, p).split(sep).join('/'));
    }
  };
  walk(join(REPO_ROOT, 'src'));
  return found;
}

/**
 * コメントだけ落とす (文字列は残す)。module specifier は文字列そのものなので、
 * 文字列を潰すと綴りが消える (census の `stripComments` と同じ理由)。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `from` の相対 specifier を repo 相対の道へ。解けなければ `null`。 */
function resolveSpec(from: Rel, spec: string, known: ReadonlySet<Rel>): Rel | null {
  if (!spec.startsWith('.')) return null;
  const dir = from.split('/').slice(0, -1).join('/');
  const parts = `${dir}/${spec}`.split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  const base = stack.join('/');
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(cand)) return cand;
  }
  return null;
}

/** import / re-export の辺 (module の到達。値か型かは問わない)。 */
function moduleEdges(files: readonly Rel[]): Map<Rel, Rel[]> {
  const known = new Set(files);
  const out = new Map<Rel, Rel[]>();
  for (const f of files) {
    const src = stripComments(readOriginalSource(join(REPO_ROOT, f)));
    const to = new Set<Rel>();
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveSpec(f, m[1]!, known);
      if (r !== null) to.add(r);
    }
    out.set(f, [...to]);
  }
  return out;
}

/** `src/main` / `src/preload` の入口から `target` への閉包の最短路。 */
function shortestChainFromMain(target: Rel, files: readonly Rel[], edges: Map<Rel, Rel[]>): Rel[] | null {
  const prev = new Map<Rel, Rel | null>();
  const queue: Rel[] = [];
  for (const f of files) {
    if (f.startsWith('src/main/') || f.startsWith('src/preload/')) {
      prev.set(f, null);
      queue.push(f);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) break;
    for (const n of edges.get(cur) ?? []) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        queue.push(n);
      }
    }
  }
  if (!prev.has(target)) return null;
  const chain: Rel[] = [];
  let c: Rel | null = target;
  while (c !== null && c !== undefined) {
    chain.unshift(c);
    c = prev.get(c) ?? null;
  }
  return chain;
}

/** `from` が `to` から**値として**持ち出す名前 (型だけの import / specifier は除く)。 */
export function valueNamesImported(fromSrc: string, toSpecMatches: (spec: string) => boolean): string[] {
  const code = stripComments(fromSrc);
  const names = new Set<string>();
  for (const m of code.matchAll(/(?:import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    if (m[1] !== undefined) continue; // `import type { … }` は値を持ち出さない
    if (!toSpecMatches(m[3]!)) continue;
    for (const raw of m[2]!.split(',')) {
      const name = raw.trim();
      if (name.length === 0) continue;
      if (name.startsWith('type ')) continue; // `{ type Foo }` も値ではない
      names.add(name.split(/\s+as\s+/)[0]!.trim());
    }
  }
  return [...names].sort();
}

/** `module` が `name` を `export const` として宣言しているか。 */
function isExportedConst(moduleRel: Rel, name: string): boolean {
  const src = stripComments(readOriginalSource(join(REPO_ROOT, moduleRel)));
  return new RegExp(String.raw`export const ${name}\b`).test(src);
}

/** census の `VERDICTS` を鍵 → 散文で読む。 */
function verdicts(): Map<string, string> {
  const src = readOriginalSource(join(REPO_ROOT, 'scripts', 'shared-judgement-census.cjs'));
  const block = /const VERDICTS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  expect(block, 'census の VERDICTS が読めない (この検査が空になっている)').not.toBeNull();
  const out = new Map<string, string>();
  // 行頭 2 スペース + 鍵 で 1 項が始まる。次の項の頭までを散文として取る。
  const entries = (block?.[1] ?? '').split(/\n {2}(?=['"]?[A-Za-z_])/);
  for (const e of entries) {
    const km = /^['"]?([A-Za-z0-9_\-/.]+)['"]?\s*:/.exec(e);
    if (km === null) continue;
    out.set(km[1]!, e.slice(km[0].length));
  }
  return out;
}

describe('判断の台帳が引く到達の事実', () => {
  const files = sourceFiles();
  const edges = moduleEdges(files);

  it('走査は生きている (母集団と辺が読めている)', () => {
    // 実測 501 件 (2026-09-15)。`__tests__` と `.d.ts` を外した数なので、
    // `typecheckCoverage.test.ts` の 1,252 件 (検査を含む全域) とは母集団が違う。
    // 読めなくなったら「問題なし」に見えてはいけない。
    expect(files.length, '走査が死んでいる (.ts が見つからない)').toBeGreaterThanOrEqual(400);
    expect(files, 'src/main のファイルが母集団に無い').toContain('src/main/clients/funding.ts');
    const fundingEdges = edges.get('src/shared/funding.ts') ?? [];
    expect(fundingEdges, 'funding.ts → taxCalc.ts の辺が読めていない').toContain('src/shared/taxCalc.ts');
  });

  it.each(PINNED.map((p) => [p.verdict, p] as const))(
    '★ %s — main からの閉包の最短路が台帳の鎖と一致する',
    (_name, pinned) => {
      const target = pinned.chain[pinned.chain.length - 1]!;
      const actual = shortestChainFromMain(target, files, edges);
      expect(
        actual,
        `${target} が main / preload から到達しなくなった —— 台帳の行を読み直すこと`,
      ).not.toBeNull();
      expect(
        actual,
        `到達の鎖が変わった:\n  台帳: ${pinned.chain.join(' → ')}\n  実物: ${(actual ?? []).join(' → ')}`,
      ).toEqual([...pinned.chain]);
    },
  );

  it.each(
    PINNED.flatMap((p) => p.edges.map((e) => [`${p.verdict}: ${e.from} → ${e.to}`, p.verdict, e] as const)),
  )('★ %s — 持ち出す名前が台帳と一致する', (_label, verdict, edge) => {
    const src = readOriginalSource(join(REPO_ROOT, edge.from));
    const toBase = edge.to.replace(/\.tsx?$/, '');
    const names = valueNamesImported(src, (spec) => {
      const r = resolveSpec(edge.from, spec, new Set(files));
      return r !== null && r.replace(/\.tsx?$/, '') === toBase;
    });
    expect(
      names,
      `${verdict}: ${edge.from} が ${edge.to} から持ち出す名前が変わった —— 台帳の行を読み直すこと`,
    ).toEqual([...edge.values].sort());
  });

  it.each(
    PINNED.flatMap((p) => p.edges.filter((e) => e.constantsOnly).map((e) => [`${e.from} → ${e.to}`, e] as const)),
  )('★ %s — 「定数だけ」の辺は実際に export const である', (_label, edge) => {
    for (const name of edge.values) {
      expect(
        isExportedConst(edge.to, name),
        `${edge.to} の ${name} が export const ではなくなった (関数になれば call の辺が生える)`,
      ).toBe(true);
    }
  });

  it('★ 台帳の行は今も census に在り、pin と同じ語を引いている (両方向)', () => {
    const table = verdicts();
    expect(table.size, 'VERDICTS の項が読めない (走査が壊れた)').toBeGreaterThanOrEqual(24);
    for (const p of PINNED) {
      const prose = table.get(p.verdict);
      expect(prose, `census に ${p.verdict} の行が無い —— pin が孤児になっている`).toBeDefined();
      for (const q of p.quotes) {
        expect(prose ?? '', `${p.verdict} の散文が「${q}」を引いていない (pin と行が離れた)`).toContain(q);
      }
    }
  });

  /*
   * `hydroponicCrops` / `hydroponics` / `readNumeric` の 3 行はどれも
   * 「main 側の入口 `buildHydroponicsSnapshot` は 2 つの定数表を射影するだけで、
   * 否定で答える関数を 1 つも呼ばない」に依っている。**その本体を留める。**
   */
  it('★ buildHydroponicsSnapshot の本体は射影だけで、関数を 1 つも呼ばない', () => {
    const src = readOriginalSource(join(REPO_ROOT, 'src/shared/hydroponicsControl.ts'));
    const start = src.indexOf('export function buildHydroponicsSnapshot');
    expect(start, 'buildHydroponicsSnapshot が見つからない (走査の死)').toBeGreaterThanOrEqual(0);
    // 波括弧を数えて本体を切り出す。
    let depth = 0;
    let i = src.indexOf('{', start);
    expect(i, '本体の始まりが読めない').toBeGreaterThan(start);
    const from = i;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = stripComments(src.slice(from, i + 1));
    // 呼び出しの形すべて (`f(` / `x.f(`) を拾い、`.map(` だけを許す。
    const calls = [...body.matchAll(/(\.?)([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => `${m[1]}${m[2]}`);
    expect(calls.length, '呼び出しが 1 つも見つからない (切り出しが壊れた)').toBeGreaterThanOrEqual(2);
    expect(
      [...new Set(calls)].sort(),
      'buildHydroponicsSnapshot が `.map` 以外を呼び始めた —— 3 行の判断を読み直すこと',
    ).toEqual(['.map']);
  });

  it('判定は台帳から外れた形に対して落ちる (空の検査になっていない)', () => {
    const known = new Set(files);
    // ① 名前が増えた辺 —— 実物ではなく標本の文字列に当てる。
    const widened = "import { CONSUMPTION_TAX_STANDARD, isSchedulableLife } from './taxCalc';";
    expect(
      valueNamesImported(widened, (spec) => spec === './taxCalc'),
      '規則が widened な import 一覧に当たらない',
    ).toEqual(['CONSUMPTION_TAX_STANDARD', 'isSchedulableLife']);
    // ② `import type { … }` は値として数えない
    expect(valueNamesImported("import type { Foo } from './taxCalc';", (s) => s === './taxCalc')).toEqual([]);
    // ③ `{ type Foo }` も値ではない
    expect(
      valueNamesImported("import { A, type Foo } from './taxCalc';", (s) => s === './taxCalc'),
    ).toEqual(['A']);
    // ④ コメントアウトした import は数えない
    expect(valueNamesImported("// import { A } from './taxCalc';", (s) => s === './taxCalc')).toEqual([]);
    // ⑤ specifier の解決: 実在しない道は null
    expect(resolveSpec('src/shared/funding.ts', './nope-does-not-exist', known)).toBeNull();
    expect(resolveSpec('src/shared/funding.ts', './taxCalc', known)).toBe('src/shared/taxCalc.ts');
    // ⑥ 定数の判定は関数を通さない
    expect(isExportedConst('src/shared/depreciation.ts', 'SME_UNIT_LIMIT')).toBe(true);
    expect(isExportedConst('src/shared/depreciation.ts', 'isSchedulableLife')).toBe(false);
  });
});
