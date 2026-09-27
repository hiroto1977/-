/**
 * **検査の中でモジュールを初めて評価しない。** (2026-09-27 · パス 495)
 *
 * ## なぜ —— 変異検査の「偽の生存」の出どころ
 *
 * Stryker の vitest の足場は `beforeEach` で「いまどの検査か」を立て、`afterEach` で下ろす。
 * だから**検査の中で**モジュールを評価すると、その直下の値 (定数・表・既定の文 = static な
 * 変異体) は「この検査が覆った」と数えられる。`stryker.config.json` は `ignoreStatic: true`
 * なので、覆われていない static な変異体は測らない (Ignored) 側へ落ちるが、**覆われた**物は
 * 覆った検査だけで走る。覆った検査がその値を主張していなければ、変異体は生き残る。
 *
 * 2026-09-27 の全掃引で出た static な生存 **1,150 件**の正体がこれだった
 * (`docs/REMAINING_WORK.md` パス 494 / 495)。直したのは 2 つの形である:
 *
 * | 形 | 何が起きていたか | 直し |
 * | --- | --- | --- |
 * | `vi.resetModules()` + 動的 `import()` (意図した読み直し) | 対象の**依存先まで**検査の中で評価し直す | `rereadModule` (対象だけを読み直す) |
 * | 検査の中の動的 `import()` (偶発的) | そのファイルで初めて読むモジュールが、検査の中で評価される | 先頭の静的 import (または `beforeAll`) |
 *
 * 直す前の実測: コードとしての `vi.resetModules()` は **167 か所**、直した後は **1 か所**
 * (`rereadModule.test.ts` の対照 —— 標本しか読まない)。
 *
 * ## この検査が数える物 (規則)
 *
 * 母集団は `src/**\/__tests__/**` の `.ts` 全部 (検査と、検査が読む helper)。構文木は
 * TypeScript の compiler API (依存は増えない —— `tsc` の本体)。
 *
 * 1. **`vi.resetModules()` は台帳だけ** (両方向)。
 * 2. **検査の中の相対の動的 `import()`** は、対象が次のどれかであること ——
 *    ① 同じファイルが**読み込みの時点で**読んでいる (先頭の静的 import・先頭の
 *    `await import()`・`beforeAll` の中の `import()`)
 *    ② 同じファイルが `vi.mock` / `vi.doMock` で**工場つき**に置き換えている
 *    (工場が本物を読む `importOriginal` / `vi.importActual` を持たないこと)
 *    ③ 製品のコードを 1 行も読まない (対象とその静的な依存がすべて `__tests__` の中)
 *    どれでもなければ台帳 (理由つき・両方向)。
 * 3. **`rereadModule` の対象は、同じファイルが読み込みの時点で読んでいる** —— そうでないと
 *    最初の読み直しで依存先が検査の中で初めて評価される。第 1 引数は `import.meta.url`、
 *    第 2 引数は文字列の直書き。例外は台帳 (理由つき・両方向)。
 * 4. **`?reread=` を組み立てるのは `rereadModule.ts` だけ** —— 読み直しの道は 1 つに保つ。
 *
 * ★ **静的 import が「実際に残るか」は TypeScript 自身に訊く** (`transpileModule`)。
 * 型としてしか使わない import は変換で消えるので、書いてあっても何も読まない
 * (esbuild も同じ規則で消す)。綴りで数えると、消える import を「読んでいる」と誤る。
 *
 * ★ **不在の主張には標本を添える** (CLAUDE.md の規約) —— 下の「標本」の describe が、
 * 規則ごとに**合成の原文**で「その形なら数える / その形なら数えない」を確かめる。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

// ---------------------------------------------------------------------------
// 台帳
// ---------------------------------------------------------------------------

/** `vi.resetModules()` を持ってよいファイル (件数つき)。**両方向**。 */
const RESET_LEDGER: Readonly<Record<string, { readonly count: number; readonly why: string }>> = {
  'src/shared/__tests__/rereadModule.test.ts': {
    count: 1,
    why:
      '対照 —— `rereadModule` が避けている形 (依存先まで評価し直す) が実際にそうなることを見せる。' +
      'このファイルが読むのは `rereadFixture/` の標本 2 本と helper だけで、製品のコードを 1 行も読まないので、' +
      '台帳を空にしても変異検査の被覆は 1 つも動かない。ファイルの最後の検査に置いてある。',
  },
};

/**
 * 検査の中の相対の動的 `import()` のうち、規則 2 の ①〜③ のどれにも当たらない物。
 * 鍵は `ファイル → 道` (行番号は編集で動くので鍵にしない)。**両方向**。
 */
const DYNAMIC_IMPORT_LEDGER: Readonly<Record<string, string>> = {
  'src/shared/__tests__/rereadModule.ts → (式)':
    '読み直しの道そのもの (`${path}?reread=${seq}`)。対象が先に読まれていることは規則 3 が呼び手の側で見る。',
  'src/renderer/network/__tests__/proxyWorkerParity.test.ts → (式)':
    '読むのは `docs/PROXY_EXAMPLE.md` (利用者が自分の Cloudflare へ貼る Worker) から切り出して一時ディレクトリに' +
    '書いた `.mjs` で、`src` の外に在り import を 1 つも持たない (関数を切り出して `export` を足しただけ)。' +
    '変異検査が計器を入れるのは `src` の `mutate` のファイルだけなので、検査の中で評価しても被覆は動かない。',
};

/** 規則 3 の例外 —— 読み込みの時点で読めない対象を読み直す所。鍵は `ファイル → 道`。**両方向**。 */
const REREAD_LEDGER: Readonly<Record<string, string>> = {
  'src/shared/__tests__/rereadModule.test.ts → node:path':
    '`rereadModule` 自身の検査の標本 —— 相対でない道を**断る**ことを確かめる (読み込む前に投げるので何も評価しない)。',
  'src/shared/__tests__/rereadModule.test.ts → vitest':
    '同上の 2 つ目の標本 (パッケージ名の形)。こちらも読み込む前に投げるので何も評価しない。',
  'src/renderer/__tests__/browserEntry.test.ts → ../main':
    'ブラウザ版の入口 (`renderer/main.tsx`) は読み込んだ瞬間に React の木を据え付けるので、' +
    '先頭で読むと検査の前提 (据え付け先の要素・見本の橋) が整う前に走る。' +
    '代わりに入口が読む物のうち差し替えない物 (`../theme` ほか) を先頭で読み、残りは `vi.mock` で置き換えている。',
};

/**
 * `?reread=` を組み立ててよいファイル (規則 4)。**両方向**。読み直しの道は `rereadModule.ts`
 * の 1 つに保つ —— 同じことを手で書く所が増えると、規則 3 (対象を先に読む) の外で読み直せる。
 */
const REREAD_QUERY_LEDGER: Readonly<Record<string, string>> = {
  'src/shared/__tests__/rereadModule.ts': '読み直しの道そのもの。',
  'src/shared/__tests__/inTestModuleLoadCensus.test.ts':
    'この検査の標本 —— 合成の原文の中の `?reread=` を解析が拾うことを確かめる (文字列の中であって、読み込みではない)。',
};

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

/** 動的 `import()` が評価される時点。 */
type Context = 'top-level' | 'beforeAll' | 'in-test';

interface DynamicImport {
  readonly line: number;
  /** 文字列の直書きでなければ `null`。 */
  readonly spec: string | null;
  readonly context: Context;
}

interface MockSite {
  readonly spec: string;
  readonly factory: boolean;
  /** 工場が本物を読む (`importOriginal` / `vi.importActual`)。 */
  readonly readsOriginal: boolean;
}

interface Reread {
  readonly line: number;
  readonly spec: string | null;
  /** 第 1 引数が `import.meta.url`。 */
  readonly urlIsImportMeta: boolean;
}

interface FileFacts {
  readonly resets: readonly number[];
  readonly dynamicImports: readonly DynamicImport[];
  readonly mocks: readonly MockSite[];
  readonly rereads: readonly Reread[];
  /** `?reread=` を含む文字列の行。 */
  readonly rereadQueryLines: readonly number[];
}

const FUNCTION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

/** `a.b.c` の形の呼び出し先を綴りにする (それ以外は `null`)。 */
function calleeName(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    const left = calleeName(e.expression);
    return left === null ? null : `${left}.${e.name.text}`;
  }
  return null;
}

function literalText(e: ts.Expression | undefined): string | null {
  if (e !== undefined && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return e.text;
  return null;
}

/** いちばん内側の関数が、どの呼び出しの引数として渡されているか。 */
function contextOf(node: ts.Node): Context {
  let n: ts.Node | undefined = node.parent;
  while (n !== undefined && !FUNCTION_KINDS.has(n.kind)) n = n.parent;
  if (n === undefined) return 'top-level';
  const call = n.parent;
  if (call !== undefined && ts.isCallExpression(call) && call.arguments.some((a) => a === n)) {
    if (calleeName(call.expression) === 'beforeAll') return 'beforeAll';
  }
  return 'in-test';
}

function isImportMetaUrl(e: ts.Expression | undefined): boolean {
  return (
    e !== undefined &&
    ts.isPropertyAccessExpression(e) &&
    e.name.text === 'url' &&
    ts.isMetaProperty(e.expression) &&
    e.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

function containsCall(node: ts.Node, names: readonly string[]): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const c = calleeName(n.expression);
      if (c !== null && names.includes(c)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function analyze(fileName: string, text: string): FileFacts {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const resets: number[] = [];
  const dynamicImports: DynamicImport[] = [];
  const mocks: MockSite[] = [];
  const rereads: Reread[] = [];
  const rereadQueryLines: number[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        dynamicImports.push({ line: lineOf(n), spec: literalText(n.arguments[0]), context: contextOf(n) });
      } else {
        const callee = calleeName(n.expression);
        if (callee === 'vi.resetModules') resets.push(lineOf(n));
        if (callee === 'vi.mock' || callee === 'vi.doMock') {
          const spec = literalText(n.arguments[0]);
          const factory = n.arguments[1];
          if (spec !== null) {
            mocks.push({
              spec,
              factory: factory !== undefined,
              readsOriginal: factory !== undefined && containsCall(factory, ['importOriginal', 'vi.importActual']),
            });
          }
        }
        if (callee === 'rereadModule') {
          rereads.push({
            line: lineOf(n),
            spec: literalText(n.arguments[1]),
            urlIsImportMeta: isImportMetaUrl(n.arguments[0]),
          });
        }
      }
    }
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateHead(n) ||
        ts.isTemplateMiddle(n) ||
        ts.isTemplateTail(n)) &&
      n.text.includes('?reread=')
    ) {
      rereadQueryLines.push(lineOf(n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { resets, dynamicImports, mocks, rereads, rereadQueryLines };
}

/**
 * 変換した後に**残る**静的 import の道。型としてしか使わない import は TypeScript が
 * 消す (esbuild も同じ規則で消す) ので、書いてあっても読み込まない。
 */
function loadedStaticSpecs(fileName: string, text: string): string[] {
  const js = ts.transpileModule(text, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const sf = ts.createSourceFile(`${fileName}.js`, js, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) out.push(st.moduleSpecifier.text);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 道の解き方
// ---------------------------------------------------------------------------

const CODE_EXT = /\.(ts|tsx)$/;

/**
 * 相対の道を、知っているファイルの repo からの道へ解く。パッケージは `null`、
 * コードでない物 (`.json` / `?url` の画像ほか) は `'asset'`、解けなければ `'unresolved'`。
 */
function resolveSpec(
  fromRel: string,
  spec: string,
  known: ReadonlySet<string>,
): string | 'asset' | 'unresolved' | null {
  if (!spec.startsWith('.')) return null;
  const bare = spec.replace(/\?.*$/, '');
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), bare));
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(cand)) return CODE_EXT.test(cand) ? cand : 'asset';
  }
  // 知らない場所 (repo の `src` の外の JSON ほか) で、拡張子がコードでない物は資産。
  if (/\.[a-z0-9]+$/i.test(bare) && !CODE_EXT.test(bare)) return 'asset';
  return 'unresolved';
}

const isTestSide = (rel: string): boolean => rel.includes('/__tests__/');

// ---------------------------------------------------------------------------
// 本物の木
// ---------------------------------------------------------------------------

const REPO = path.resolve(__dirname, '../../..');

interface Tree {
  /** `src` の中の全ファイル (repo からの道)。 */
  readonly known: ReadonlySet<string>;
  /** 検査側 (`__tests__` の中) の `.ts` の原文。 */
  readonly testSide: ReadonlyMap<string, string>;
}

function readTree(): Tree {
  const known = new Set<string>();
  const testSide = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs);
        continue;
      }
      const rel = path.relative(REPO, abs).split(path.sep).join('/');
      known.add(rel);
      if (isTestSide(rel) && rel.endsWith('.ts') && !rel.endsWith('.d.ts')) {
        testSide.set(rel, readOriginalSource(abs));
      }
    }
  };
  walk(path.join(REPO, 'src'));
  return { known, testSide };
}

interface Violation {
  readonly key: string;
  readonly where: string;
}

interface Census {
  readonly files: number;
  /** 篩を通って構文木を作ったファイル。 */
  readonly parsed: number;
  readonly dynamicImports: number;
  readonly rereads: number;
  readonly resets: ReadonlyMap<string, number>;
  readonly dynamicViolations: readonly Violation[];
  readonly rereadViolations: readonly Violation[];
  readonly rereadQueryFiles: readonly string[];
}

/**
 * 構文木を作る前の篩。**上位集合であること** —— 規則が見る形 (動的 import・読み直し・
 * `vi.resetModules`・`?reread=`) はどれもこの綴りを含むので、篩で落ちたファイルには
 * 数える物が無い (型の位置の `import(` も通すが、構文木の側で落ちる)。
 */
const NEEDS_PARSE = /\bimport\s*\(|resetModules|rereadModule|\?reread=/;

function census(tree: Tree): Census {
  const facts = new Map<string, FileFacts>();
  for (const [rel, text] of tree.testSide) if (NEEDS_PARSE.test(text)) facts.set(rel, analyze(rel, text));
  const staticCache = new Map<string, ReadonlySet<string>>();

  /** 読み込みの時点で読むモジュール (repo からの道)。 */
  const loadedAtFileLoad = (rel: string): ReadonlySet<string> => {
    const hit = staticCache.get(rel);
    if (hit !== undefined) return hit;
    const text = tree.testSide.get(rel) ?? '';
    const out = new Set<string>();
    const add = (spec: string): void => {
      const r = resolveSpec(rel, spec, tree.known);
      if (r !== null && r !== 'asset' && r !== 'unresolved') out.add(r);
    };
    for (const spec of loadedStaticSpecs(rel, text)) add(spec);
    for (const d of facts.get(rel)?.dynamicImports ?? []) {
      if (d.context !== 'in-test' && d.spec !== null) add(d.spec);
    }
    staticCache.set(rel, out);
    return out;
  };

  /** 製品のコードを読むか (対象とその静的な依存を辿る)。 */
  const pullsProduct = (rel: string, seen = new Set<string>()): boolean => {
    if (!isTestSide(rel)) return true;
    if (seen.has(rel)) return false;
    seen.add(rel);
    for (const dep of loadedAtFileLoad(rel)) if (pullsProduct(dep, seen)) return true;
    return false;
  };

  const resets = new Map<string, number>();
  const dynamicViolations: Violation[] = [];
  const rereadViolations: Violation[] = [];
  const rereadQueryFiles: string[] = [];
  let dynamicImports = 0;
  let rereads = 0;
  for (const [rel, f] of facts) {
    if (f.resets.length > 0) resets.set(rel, f.resets.length);
    if (f.rereadQueryLines.length > 0) rereadQueryFiles.push(rel);
    // 変換 (transpileModule) は重いので、要るファイルでだけ行う。
    let loadedMemo: ReadonlySet<string> | null = null;
    const loaded = {
      has: (r: string): boolean => (loadedMemo ??= loadedAtFileLoad(rel)).has(r),
    };
    const mocked = new Set<string>();
    for (const m of f.mocks) {
      const r = resolveSpec(rel, m.spec, tree.known);
      if (m.factory && !m.readsOriginal && typeof r === 'string' && CODE_EXT.test(r)) mocked.add(r);
    }
    for (const d of f.dynamicImports) {
      dynamicImports += 1;
      if (d.context !== 'in-test') continue;
      if (d.spec === null) {
        dynamicViolations.push({ key: `${rel} → (式)`, where: `${rel}:${d.line}` });
        continue;
      }
      const r = resolveSpec(rel, d.spec, tree.known);
      if (r === null || r === 'asset') continue;
      if (r !== 'unresolved' && (loaded.has(r) || mocked.has(r) || !pullsProduct(r))) continue;
      dynamicViolations.push({ key: `${rel} → ${d.spec}`, where: `${rel}:${d.line}` });
    }
    for (const rr of f.rereads) {
      rereads += 1;
      const r = rr.spec === null ? 'unresolved' : resolveSpec(rel, rr.spec, tree.known);
      const ok = rr.urlIsImportMeta && typeof r === 'string' && CODE_EXT.test(r) && loaded.has(r);
      if (!ok) rereadViolations.push({ key: `${rel} → ${rr.spec ?? '(式)'}`, where: `${rel}:${rr.line}` });
    }
  }
  return {
    files: tree.testSide.size,
    parsed: facts.size,
    dynamicImports,
    rereads,
    resets,
    dynamicViolations,
    rereadViolations,
    rereadQueryFiles,
  };
}

// ---------------------------------------------------------------------------
// 検査
// ---------------------------------------------------------------------------

const TREE = readTree();
const CENSUS = census(TREE);

const keysOf = (vs: readonly Violation[]): string[] => [...new Set(vs.map((v) => v.key))].sort();

describe('検査の中でモジュールを初めて評価しない (母集団の census)', () => {
  it('走査が生きている (床)', () => {
    // 床は「走査が死んでいない」ことだけを言う —— 実測に張り付けると、直した日に落ちる門になる。
    expect(CENSUS.files).toBeGreaterThanOrEqual(500);
    expect(CENSUS.parsed).toBeGreaterThanOrEqual(50);
    expect(CENSUS.dynamicImports).toBeGreaterThanOrEqual(20);
    expect(CENSUS.rereads).toBeGreaterThanOrEqual(50);
  });

  it('★ 規則 1: vi.resetModules() は台帳のファイルに、台帳の件数だけ在る (両方向)', () => {
    const live = Object.fromEntries([...CENSUS.resets].sort());
    const ledger = Object.fromEntries(Object.entries(RESET_LEDGER).map(([k, v]) => [k, v.count]));
    expect(
      live,
      'vi.resetModules() は依存先まで検査の中で評価し直す。読み直したいなら rereadModule を使うこと ' +
        '(どうしても要るなら RESET_LEDGER に理由を書く)。消したなら台帳からも消す',
    ).toEqual(ledger);
  });

  it('★ 規則 2: 検査の中の相対の動的 import は、先に読まれている・置き換えられている・製品を読まない のどれか (両方向)', () => {
    const live = keysOf(CENSUS.dynamicViolations);
    expect(
      live,
      '検査の中で初めて読むモジュールは、その直下の値が「その検査が覆った」と数えられる。' +
        '先頭の静的 import (または beforeAll) で読んでおくこと。' +
        `どうしても要るなら DYNAMIC_IMPORT_LEDGER に理由を書く: ${JSON.stringify(CENSUS.dynamicViolations)}`,
    ).toEqual(Object.keys(DYNAMIC_IMPORT_LEDGER).sort());
  });

  it('★ 規則 3: rereadModule の対象は、同じファイルが読み込みの時点で読んでいる (両方向)', () => {
    const live = keysOf(CENSUS.rereadViolations);
    expect(
      live,
      '読み直す対象を先頭で読んでいないと、最初の読み直しで依存先が検査の中で初めて評価される。' +
        `第 1 引数は import.meta.url、第 2 引数は文字列の直書きで: ${JSON.stringify(CENSUS.rereadViolations)}`,
    ).toEqual(Object.keys(REREAD_LEDGER).sort());
  });

  it('★ 規則 4: ?reread= を組み立てるのは台帳のファイルだけ (両方向)', () => {
    expect(
      [...CENSUS.rereadQueryFiles].sort(),
      '読み直しは rereadModule を通すこと (同じ道を手で組むと、規則 3 の外で読み直せる)',
    ).toEqual(Object.keys(REREAD_QUERY_LEDGER).sort());
  });

  it('台帳の理由は省略しない (同上・TBD を書かない)', () => {
    const whys = [
      ...Object.values(RESET_LEDGER).map((v) => v.why),
      ...Object.values(DYNAMIC_IMPORT_LEDGER),
      ...Object.values(REREAD_LEDGER),
      ...Object.values(REREAD_QUERY_LEDGER),
    ];
    for (const why of whys) expect(why.length, why).toBeGreaterThanOrEqual(10);
    // 「同上」だけの理由は書かない —— 次に読む人は何について同じなのかを確かめ直すことになる。
    const lazy = /^(同上|TBD|要確認)[。.]?$/;
    expect(lazy.test('同上。'), '針が禁じたい文面に当たる (標本)').toBe(true);
    expect(whys.filter((w) => lazy.test(w))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 標本 —— 規則が実際にその形へ当たることを、合成の原文で確かめる
// ---------------------------------------------------------------------------

describe('標本: 解析の規則', () => {
  const contexts = (src: string): Context[] => analyze('x.test.ts', src).dynamicImports.map((d) => d.context);

  it('動的 import の時点を見分ける (先頭 / beforeAll / 検査の中)', () => {
    expect(contexts("const m = await import('./a');")).toEqual(['top-level']);
    expect(contexts("beforeAll(async () => { await import('./a'); });")).toEqual(['beforeAll']);
    expect(contexts("it('x', async () => { await import('./a'); });")).toEqual(['in-test']);
    expect(contexts("beforeEach(async () => { await import('./a'); });")).toEqual(['in-test']);
    // 先頭で定義した関数の中は、呼ばれた所 (検査の中) で評価される
    expect(contexts("async function load() { return import('./a'); }")).toEqual(['in-test']);
    // vi.mock の工場は、置き換えた物が初めて読まれた所で走る (検査の中でありうる)
    expect(contexts("vi.mock('./b', async () => (await import('./c')).x);")).toEqual(['in-test']);
    // beforeAll の中でも、さらに内側の関数は呼ばれた所で評価される
    expect(contexts("beforeAll(() => { later = () => import('./a'); });")).toEqual(['in-test']);
  });

  it('型の位置の import() は数えない (値の位置だけ)', () => {
    expect(contexts("type M = typeof import('./a'); let x: import('./a').T;")).toEqual([]);
  });

  it('vi.resetModules() は構文木で数える (注記と文字列の中は数えない)', () => {
    expect(analyze('x.test.ts', 'vi.resetModules();').resets).toEqual([1]);
    expect(analyze('x.test.ts', "// vi.resetModules();\nconst s = 'vi.resetModules()';").resets).toEqual([]);
  });

  it('vi.mock の工場が本物を読むかを見分ける', () => {
    const m = (src: string): MockSite[] => [...analyze('x.test.ts', src).mocks];
    expect(m("vi.mock('./a', () => ({ f: 1 }));")).toEqual([{ spec: './a', factory: true, readsOriginal: false }]);
    expect(m("vi.mock('./a', async (importOriginal) => ({ ...(await importOriginal()) }));")[0]?.readsOriginal).toBe(true);
    expect(m("vi.doMock('./a', async () => ({ ...(await vi.importActual('./a')) }));")[0]?.readsOriginal).toBe(true);
    expect(m("vi.mock('./a');")).toEqual([{ spec: './a', factory: false, readsOriginal: false }]);
  });

  it('rereadModule の呼び出しは、道と第 1 引数の形を拾う', () => {
    const r = (src: string): Reread[] => [...analyze('x.test.ts', src).rereads];
    expect(r("await rereadModule<M>(import.meta.url, '../a');")).toEqual([
      { line: 1, spec: '../a', urlIsImportMeta: true },
    ]);
    expect(r('await rereadModule(someUrl, spec);')).toEqual([{ line: 1, spec: null, urlIsImportMeta: false }]);
  });

  it('?reread= を含む文字列を拾う (テンプレートの途中でも)', () => {
    expect(analyze('x.ts', 'const u = `${p}?reread=${n}`;').rereadQueryLines).toEqual([1]);
    expect(analyze('x.ts', "const u = '?reread=1';").rereadQueryLines).toEqual([1]);
    expect(analyze('x.ts', '// ?reread=1\nconst u = 1;').rereadQueryLines).toEqual([]);
  });

  it('★ 静的 import は「変換の後に残る物」だけを数える (型としてしか使わない import は消える)', () => {
    expect(loadedStaticSpecs('x.ts', "import './a';")).toEqual(['./a']);
    expect(loadedStaticSpecs('x.ts', "import { f } from './a'; f();")).toEqual(['./a']);
    expect(loadedStaticSpecs('x.ts', "import * as m from './a'; m.f();")).toEqual(['./a']);
    // 型としてしか使わない —— 変換で消えるので読まない
    expect(loadedStaticSpecs('x.ts', "import type { T } from './a'; let x: T;")).toEqual([]);
    expect(loadedStaticSpecs('x.ts', "import { T } from './a'; let x: T;")).toEqual([]);
    expect(loadedStaticSpecs('x.ts', "import { f } from './a'; let x: typeof f;")).toEqual([]);
  });

  it('道の解き方: 拡張子と index を補い、コードでない物とパッケージを分ける', () => {
    const known = new Set(['src/a/b.ts', 'src/a/c/index.ts', 'src/a/d.tsx', 'src/a/e.json']);
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../b', known)).toBe('src/a/b.ts');
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../c', known)).toBe('src/a/c/index.ts');
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../d', known)).toBe('src/a/d.tsx');
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../e.json', known)).toBe('asset');
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../../../x/y.txt?url', known)).toBe('asset');
    expect(resolveSpec('src/a/__tests__/t.test.ts', '../zz', known)).toBe('unresolved');
    expect(resolveSpec('src/a/__tests__/t.test.ts', 'react', known)).toBeNull();
  });
});

describe('標本: 規則を合成の木に当てる', () => {
  const tree = (files: Record<string, string>): Tree => ({
    known: new Set([...Object.keys(files), 'src/p/prod.ts', 'src/p/other.ts']),
    testSide: new Map(Object.entries(files)),
  });

  it('★ 検査の中で初めて読む製品のモジュールは、違反として数える', () => {
    const c = census(tree({ 'src/p/__tests__/t.test.ts': "it('x', async () => { await import('../prod'); });" }));
    expect(keysOf(c.dynamicViolations)).toEqual(['src/p/__tests__/t.test.ts → ../prod']);
  });

  it('対照: 先頭で読んでいれば・beforeAll で読んでいれば・工場つきで置き換えていれば違反ではない', () => {
    const cases = [
      "import '../prod';\nit('x', async () => { await import('../prod'); });",
      "import { f } from '../prod'; f();\nit('x', async () => { await import('../prod'); });",
      "const m = await import('../prod');\nit('x', async () => { await import('../prod'); });",
      "beforeAll(async () => { await import('../prod'); });\nit('x', async () => { await import('../prod'); });",
      "vi.mock('../prod', () => ({ f: 1 }));\nit('x', async () => { await import('../prod'); });",
    ];
    for (const src of cases) {
      const c = census(tree({ 'src/p/__tests__/t.test.ts': src }));
      expect(keysOf(c.dynamicViolations), src).toEqual([]);
    }
  });

  it('★ 型としてしか使わない import は「先に読んだ」にならない / 本物を読む工場は置き換えにならない', () => {
    const typeOnly = census(
      tree({
        'src/p/__tests__/t.test.ts': "import { T } from '../prod'; let x: T;\nit('x', async () => { await import('../prod'); });",
      }),
    );
    expect(keysOf(typeOnly.dynamicViolations)).toEqual(['src/p/__tests__/t.test.ts → ../prod']);
    const original = census(
      tree({
        'src/p/__tests__/t.test.ts':
          "vi.mock('../prod', async (importOriginal) => ({ ...(await importOriginal()) }));\n" +
          "it('x', async () => { await import('../prod'); });",
      }),
    );
    expect(keysOf(original.dynamicViolations)).toEqual(['src/p/__tests__/t.test.ts → ../prod']);
  });

  it('★ 製品を読まない helper は検査の中で読んでよい / 製品を読む helper は違反', () => {
    const pure = census(
      tree({
        'src/p/__tests__/t.test.ts': "it('x', async () => { await import('./helper'); });",
        'src/p/__tests__/helper.ts': 'export const h = 1;',
      }),
    );
    expect(keysOf(pure.dynamicViolations)).toEqual([]);
    const pulls = census(
      tree({
        'src/p/__tests__/t.test.ts': "it('x', async () => { await import('./helper'); });",
        'src/p/__tests__/helper.ts': "import { f } from '../prod';\nexport const h = f();",
      }),
    );
    expect(keysOf(pulls.dynamicViolations)).toEqual(['src/p/__tests__/t.test.ts → ./helper']);
  });

  it('★ rereadModule の対象を先頭で読んでいなければ違反 / 読んでいれば違反ではない', () => {
    const bare = census(
      tree({ 'src/p/__tests__/t.test.ts': "it('x', async () => { await rereadModule(import.meta.url, '../prod'); });" }),
    );
    expect(keysOf(bare.rereadViolations)).toEqual(['src/p/__tests__/t.test.ts → ../prod']);
    const loaded = census(
      tree({
        'src/p/__tests__/t.test.ts':
          "import '../prod';\nit('x', async () => { await rereadModule(import.meta.url, '../prod'); });",
      }),
    );
    expect(keysOf(loaded.rereadViolations)).toEqual([]);
    const wrongUrl = census(
      tree({
        'src/p/__tests__/t.test.ts': "import '../prod';\nit('x', async () => { await rereadModule(u, '../prod'); });",
      }),
    );
    expect(keysOf(wrongUrl.rereadViolations)).toEqual(['src/p/__tests__/t.test.ts → ../prod']);
  });
});
