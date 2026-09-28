/**
 * **購読の写しの束縛を、構文木とシンボルで追う** —— 検査が共有する道具 (2026-09-28 · パス 500 で
 * `snapshotJudgementCensus.test.ts` から切り出した)。
 *
 * 写し = `useCollection(c)` の `records` (と `useLatestForm(c)` の `latest`)。IndexedDB から**後で**
 * 届くので、最初の描画ではまだ空 (`latest` は `null`) である。ここは、その写しと写しから導いた値が
 * どの宣言に束ねられているかを、1 ファイルの program の型検査器に訊いて集める。
 *
 * 読み手は 2 本:
 * - `snapshotJudgementCensus.test.ts` (パス 384 / 497) —— handler の本体が写しで判定・書き込みを
 *   しないか。
 * - `latestAdoptionCensus.test.ts` (パス 500) —— **状態の初期値に写しを置かないか** (最初の描画の
 *   写しは空なので、初期値は保存値を 1 度も見ない)。
 *
 * 切り出したのは写しを作らないため (同じ算法を 2 つの検査に 1 つずつ書くと、片方だけが直る ——
 * このリポジトリが繰り返し直してきた形)。中身は元の census から 1 字も変えずに移し、`useLatestForm`
 * の束縛を足した (下の `SNAPSHOT_MEMBERS`)。
 */
import ts from 'typescript';

/** 1 ファイルだけの program —— 束縛 (どの宣言を指すか) を型検査器に訊くため。 */
export function bindOne(file: string, src: string): { sf: ts.SourceFile; checker: ts.TypeChecker } {
  const path = `/${file}`;
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === path ? sf : undefined),
    getDefaultLibFileName: () => '/lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => f === path,
    readFile: () => undefined,
  };
  const program = ts.createProgram([path], { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve, types: [] }, host);
  return { sf, checker: program.getTypeChecker() };
}

export const isFn = (e: ts.Node | undefined): e is ts.ArrowFunction | ts.FunctionExpression =>
  e !== undefined && (ts.isArrowFunction(e) || ts.isFunctionExpression(e));

export const callName = (n: ts.Expression): string =>
  ts.isIdentifier(n) ? n.text : ts.isPropertyAccessExpression(n) ? n.name.text : '';

/**
 * 写しを返す hook と、その戻り値のうち**写しである成員**。
 *
 * - `useCollection(c)` の `records` —— 一覧が届く前は空。
 * - `useLatestForm(c)` の `latest` (パス 500) —— 保管層が答える前は `null`。**`form` / `base` は写しでは
 *   ない** (欄の状態で、`useLatestForm` 自身が「答えてから開く・触っていなければ付いていく」を持つ)。
 */
export const SNAPSHOT_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['useCollection', new Set(['records'])],
  ['useLatestForm', new Set(['latest'])],
]);

/** 写しを返す hook の呼び出しか (戻り値のどの成員が写しかは `SNAPSHOT_MEMBERS`)。 */
export const snapshotHookOf = (n: ts.Node | undefined): ReadonlySet<string> | null => {
  if (n === undefined || !ts.isCallExpression(n)) return null;
  return SNAPSHOT_MEMBERS.get(callName(n.expression)) ?? null;
};

export const isUseCollection = (n: ts.Node | undefined): n is ts.CallExpression =>
  n !== undefined && ts.isCallExpression(n) && callName(n.expression) === 'useCollection';

export const ITERATE = new Set(['map', 'forEach', 'filter', 'find', 'findLast', 'findIndex', 'some', 'every', 'flatMap', 'reduce']);

/**
 * 状態の初期値は写しを運ばない —— `useState(() => draftFrom(row))` は**利用者が編集する下書き**を
 * 写しから作る形で、その下書きを保存する handler は判定ではなく入力を書く。ここを追うと、
 * 下書きを保存する handler がすべて映る (実測: 品目を足す handler が、欄の初期値に使った
 * 品目の写しを理由に映った)。
 *
 * ★ **ただし初期値に写しを置くこと自体は別の欠陥になりうる** —— 最初の描画の写しは空なので、
 * 初期値は保存値を 1 度も見ない (パス 500 の経営サマリーの欄はこれで既定値のまま開いた)。
 * そちらは `latestAdoptionCensus.test.ts` が、この集合の呼び出しの**引数**を数える。
 */
export const STATE_HOOKS = new Set(['useState', 'useReducer', 'useRef']);

/** 名前の出現が**値として読む所**か (宣言の名前・`a.b` の `b`・`{ k: … }` の `k`・属性名は除く)。 */
export function isValuePosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.propertyName === id || p.name === id)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return false;
  if (ts.isJsxAttribute(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p)) return false;
  return true;
}

export interface SnapshotModel {
  /** 写し (と、写しから導いた値・写しの行) を束ねる宣言のシンボル。 */
  readonly values: ReadonlySet<ts.Symbol>;
  /** 写しを返す hook の戻り値を丸ごと束ねたシンボル → 写しである成員 (`x.records` / `x.latest`)。 */
  readonly collections: ReadonlyMap<ts.Symbol, ReadonlySet<string>>;
  /** 部品の props を 1 つの名前で受けた所 —— `props.rows` が写し。 */
  readonly members: ReadonlyMap<ts.Symbol, ReadonlySet<string>>;
}

export function symbolAt(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
    return checker.getShorthandAssignmentValueSymbol(id.parent);
  }
  return checker.getSymbolAtLocation(id);
}

/** 写しを読む最初の出現 (無ければ null)。報せ (`set…` / `console.…`) の引数と行の同一性は数えない。 */
export function firstSnapshotRead(node: ts.Node, checker: ts.TypeChecker, m: SnapshotModel, ignore = true): ts.Node | null {
  let hit: ts.Node | null = null;
  (function walk(x: ts.Node): void {
    if (hit !== null) return;
    if (ignore && ts.isCallExpression(x)) {
      const callee = x.expression.getText();
      if (/^set[A-Z]/.test(callee) || /^console\./.test(callee)) return;
    }
    let found: ts.Node | null = null;
    if (ts.isIdentifier(x) && isValuePosition(x)) {
      const s = symbolAt(checker, x);
      if (s !== undefined && m.values.has(s)) found = x;
    }
    if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression)) {
      const s = symbolAt(checker, x.expression);
      if (s !== undefined) {
        if (m.collections.get(s)?.has(x.name.text) === true) found = x;
        if (m.members.get(s)?.has(x.name.text) === true) found = x;
      }
    }
    if (found !== null) {
      // 行の同一性 (`r.id` / `c.rowId`) は判定ではない —— 画面が見せた行を指す。
      const p = found.parent;
      const identityOnly = ignore && ts.isPropertyAccessExpression(p) && p.expression === found && (p.name.text === 'id' || p.name.text === 'rowId');
      if (!identityOnly) hit = found;
      return;
    }
    ts.forEachChild(x, walk);
  })(node);
  return hit;
}

/** 写しの束縛を、写しを返す hook から収束まで広げる。 */
export function snapshotModelOf(sf: ts.SourceFile, checker: ts.TypeChecker): SnapshotModel {
  const values = new Set<ts.Symbol>();
  const collections = new Map<ts.Symbol, ReadonlySet<string>>();
  const members = new Map<ts.Symbol, Set<string>>();
  const model: SnapshotModel = { values, collections, members };
  const addName = (name: ts.BindingName): boolean => {
    let grew = false;
    const visit = (b: ts.BindingName): void => {
      if (ts.isIdentifier(b)) {
        const s = checker.getSymbolAtLocation(b);
        if (s !== undefined && !values.has(s)) {
          values.add(s);
          grew = true;
        }
      } else {
        for (const el of b.elements) if (ts.isBindingElement(el)) visit(el.name);
      }
    };
    visit(name);
    return grew;
  };

  // 種: `const { records: x } = useCollection(…)` と `const col = useCollection(…)`
  // (パス 500 から `useLatestForm` の `latest` も —— `SNAPSHOT_MEMBERS`)。
  (function seed(n: ts.Node): void {
    const snap = ts.isVariableDeclaration(n) ? snapshotHookOf(n.initializer) : null;
    if (ts.isVariableDeclaration(n) && snap !== null) {
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          if (snap.has((el.propertyName ?? el.name).getText())) addName(el.name);
        }
      } else if (ts.isIdentifier(n.name)) {
        const s = checker.getSymbolAtLocation(n.name);
        if (s !== undefined) collections.set(s, snap);
      }
    }
    ts.forEachChild(n, seed);
  })(sf);

  let grew = true;
  while (grew) {
    grew = false;
    (function walk(n: ts.Node): void {
      // 導いた値: `const x = … 写し …` (関数そのもの・`useCallback` の handler は値ではない)。
      if (
        ts.isVariableDeclaration(n) && n.initializer !== undefined && snapshotHookOf(n.initializer) === null &&
        !isFn(n.initializer) &&
        !(ts.isCallExpression(n.initializer) && callName(n.initializer.expression) === 'useCallback') &&
        !(ts.isCallExpression(n.initializer) && STATE_HOOKS.has(callName(n.initializer.expression))) &&
        firstSnapshotRead(n.initializer, checker, model, false) !== null
      ) {
        if (addName(n.name)) grew = true;
      }
      // 行: `写し.map((r) => …)` の `r` は写しの 1 行 (`reduce` は 2 番目の引数)。
      if (
        ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        ITERATE.has(n.expression.name.text) && firstSnapshotRead(n.expression.expression, checker, model, false) !== null
      ) {
        const cb = n.arguments[0];
        if (isFn(cb)) {
          const p = cb.parameters[n.expression.name.text === 'reduce' ? 1 : 0];
          if (p !== undefined && addName(p.name)) grew = true;
        }
      }
      // `for (const r of 写し)`
      if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer) && firstSnapshotRead(n.expression, checker, model, false) !== null) {
        for (const d of n.initializer.declarations) if (addName(d.name)) grew = true;
      }
      // 同じファイルの部品へ渡した prop: `<Panel rows={写し}>` → Panel の `rows`。
      if (ts.isJsxAttribute(n) && n.initializer !== undefined && ts.isJsxExpression(n.initializer)) {
        const e = n.initializer.expression;
        const owner = n.parent.parent;
        if (
          e !== undefined && !isFn(e) && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) &&
          ts.isIdentifier(owner.tagName) && /^[A-Z]/.test(owner.tagName.text) &&
          firstSnapshotRead(e, checker, model, false) !== null
        ) {
          const attr = n.name.getText();
          const decl = checker.getSymbolAtLocation(owner.tagName)?.declarations?.[0];
          const fn = decl === undefined ? undefined
            : ts.isFunctionDeclaration(decl) ? decl
            : ts.isVariableDeclaration(decl) && isFn(decl.initializer) ? decl.initializer
            : undefined;
          const param = fn?.parameters[0];
          if (param !== undefined) {
            if (ts.isObjectBindingPattern(param.name)) {
              for (const el of param.name.elements) {
                if ((el.propertyName ?? el.name).getText() === attr && addName(el.name)) grew = true;
              }
            } else if (ts.isIdentifier(param.name)) {
              const s = checker.getSymbolAtLocation(param.name);
              if (s !== undefined) {
                const set = members.get(s) ?? new Set<string>();
                if (!set.has(attr)) {
                  set.add(attr);
                  members.set(s, set);
                  grew = true;
                }
              }
            }
          }
        }
      }
      ts.forEachChild(n, walk);
    })(sf);
  }
  return model;
}
