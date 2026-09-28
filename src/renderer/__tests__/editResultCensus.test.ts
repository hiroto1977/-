/**
 * **`useCollection` の `edit` の答えは、必ず読む。** (2026-09-27 · パス 498)
 *
 * `edit` は相手の行が保管層に無ければ**何も書かずに `false`** を返す (`store.update` は行が無いとき
 * 投げずに `null` を返す)。2026-09-27 まではここが `Promise<void>` で、その `null` を捨てていた。
 * 呼び手はどれも「書けた」前提で次へ進むので、**別のタブで消された行**を編集した保存は何も書かない
 * まま「済んだ」形になった —— 直す前の実測:
 *
 * | 画面 | 保存の後 |
 * | --- | --- |
 * | 投資信託・不動産・士業の連絡先 | 編集の欄が**空になり**、打ち込んだ値は痕跡なく失われる (行も一覧から消える) |
 * | 士業の相談の状態 | 選んだ状態は入らず、行が一覧から消える。断りは 0 文 |
 * | チームの役割 | 判定の読み直し (パス 497) の後・書く前に消えると、何も入らず断りも 0 文 |
 * | 手入力の置き換え・数値パラメータ | 保存した値が保管層のどこにも入らない (印も件数も変わらず、押せていないのと見分けが付かない) |
 *
 * 振る舞いは `pages/__tests__/editVanishedRecord.test.ts` と `data/__tests__/parameterOverrides.test.ts`
 * が実物で押す。**ここは母集団を持つ** —— 次に `edit` を呼ぶ画面が答えを捨てれば、ここで落ちる。
 *
 * ## 綴りではなく束縛で数える
 *
 * `edit` は別名で受けられる (`const { edit: editHolding } = useCollection(…)`) し、丸ごと受けた
 * 変数からも呼べる (`contactsCol.edit(…)`)。名前で数えると別名が映らず、`edit` という綴りの
 * 別の関数 (配列の要素・部品の prop) を拾う。パス 497 の census と同じく、1 ファイルの program の
 * 型検査器に**どの宣言を指すか**を訊く (`noResolve` / `noLib` —— 依存を解かない)。
 *
 * ## ここで留めること
 *
 * ① 母集団: renderer (検査・監査を除く) の `useCollection(…)` の束縛から `edit` を導く ——
 *    丸ごと (`col.edit`)・分割 (`{ edit }`)・別名 (`{ edit: 別名 }`)。
 * ② どの呼び出しも **`await` し、答えを読む** —— 式文 (`await edit(…);`)・`void`・
 *    `fireReported(edit(…))` (待たない)・値としての受け渡し (`onSave={edit}`) は捨てる形。
 *    答えを変数に受けたら、その変数が読まれること。
 * ③ `useCollection` の戻り値を丸ごと束ねた変数は、`x.名前` の形でだけ使う —— 丸ごと外へ渡すと、
 *    その先で呼ばれる `edit` をここでは数えられない。
 * ④ 床: 実物の呼び出しが数件は見つかる (走査が死んでいない)。
 * ⑤ 標本: 捨てる形は数え、読む形は数えない (不在の主張には標本 —— CLAUDE.md の規約)。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const ROOT = 'src/renderer';
const SKIP_DIRS = new Set(['__tests__', '__audits__']);

/** renderer の `.ts` / `.tsx` (検査と監査を除く) のうち `useCollection(` を呼ぶ物。 */
function filesCallingUseCollection(): string[] {
  const out: string[] = [];
  (function walk(rel: string): void {
    for (const e of readOriginalDirEntries(join(REPO, rel))) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(child);
        continue;
      }
      if (!e.isFile() || !/\.tsx?$/.test(e.name) || e.name.endsWith('.d.ts')) continue;
      if (child === `${ROOT}/data/useCollection.ts`) continue; // 定義そのもの
      if (/\buseCollection\s*[<(]/.test(readOriginalSource(join(REPO, child)))) out.push(child);
    }
  })(ROOT);
  return out.sort();
}

/** 1 ファイルだけの program —— 束縛 (どの宣言を指すか) を型検査器に訊くため。 */
function bindOne(file: string, src: string): { sf: ts.SourceFile; checker: ts.TypeChecker } {
  const path = `/${file}`;
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, kind);
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

const isUseCollectionCall = (n: ts.Node | undefined): n is ts.CallExpression =>
  n !== undefined && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useCollection';

/** 括弧を外した親 (`(await x)` の括弧は形を変えない)。 */
function outer(n: ts.Node): ts.Node {
  let p = n.parent;
  while (p !== undefined && ts.isParenthesizedExpression(p)) p = p.parent;
  return p;
}

/** 名前の出現が**値として読む所**か (宣言の名前・`a.b` の `b`・`{ k: … }` の `k` は除く)。 */
function isValuePosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.propertyName === id || p.name === id)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return false;
  if (ts.isJsxAttribute(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p)) return false;
  return true;
}

function symbolAt(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
    return checker.getShorthandAssignmentValueSymbol(id.parent);
  }
  return checker.getSymbolAtLocation(id);
}

/**
 * 答えを**読む**二項の演算子 (比較と論理)。代入 (`x = await edit()`) とカンマは読まない —— 代入した先が
 * 読まれるかはここからは分からないので、捨てる形として名指しする (今日 0 件)。
 */
const READING_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** 答えの扱い。`read` だけが正しい。 */
export type EditUse = 'read' | 'discarded' | 'not-awaited' | 'passed-as-value' | 'unread-variable' | 'escaped';

/** 数える書き込みの口 (パス 499 で `editIfUnchanged` が加わった)。 */
export type EditMethod = 'edit' | 'editIfUnchanged';

/**
 * `edit` の patch の形 (パス 499)。`fields` = 欄を名指しするオブジェクトリテラル (spread なし)、
 * `whole` = それ以外 (解析した実体を丸ごと渡す形)。丸ごとの実体を `edit` で書くと、欄を開いた後に
 * 別のタブが直した欄まで開いた時の値へ戻す —— そういう書き込みは `editIfUnchanged` を通る。
 * `editIfUnchanged` の行は常に `fields` と数える (比較が守るので形を問わない)。
 */
export type PatchShape = 'fields' | 'whole';

export interface EditSite {
  readonly file: string;
  readonly line: number;
  readonly method: EditMethod;
  readonly use: EditUse;
  readonly patch: PatchShape;
  readonly text: string;
}

const METHODS: ReadonlySet<string> = new Set<EditMethod>(['edit', 'editIfUnchanged']);

/** 1 ファイルの `edit` の出現を、答えの扱いつきで返す。 */
export function editSites(file: string, src: string): EditSite[] {
  const { sf, checker } = bindOne(file, src);
  const whole = new Set<ts.Symbol>();
  const editFns = new Map<ts.Symbol, EditMethod>();
  const escapes: ts.Node[] = [];

  // ① 束縛を集める。
  (function walk(n: ts.Node): void {
    if (isUseCollectionCall(n)) {
      const p = outer(n);
      if (ts.isVariableDeclaration(p) && p.initializer !== undefined) {
        if (ts.isIdentifier(p.name)) {
          const s = checker.getSymbolAtLocation(p.name);
          if (s !== undefined) whole.add(s);
        } else if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) {
            if (el.dotDotDotToken !== undefined && ts.isIdentifier(el.name)) {
              // `{ records, ...rest }` —— rest は `edit` を運びうる丸ごとの物。
              const s = checker.getSymbolAtLocation(el.name);
              if (s !== undefined) whole.add(s);
              continue;
            }
            const key = el.propertyName ?? el.name;
            if (ts.isIdentifier(key) && METHODS.has(key.text) && ts.isIdentifier(el.name)) {
              const s = checker.getSymbolAtLocation(el.name);
              if (s !== undefined) editFns.set(s, key.text as EditMethod);
            }
          }
        } else {
          escapes.push(n);
        }
      } else if (ts.isPropertyAccessExpression(p) && p.expression === n) {
        // `useCollection(…).x` —— `edit` なら下の ② で数える (ここでは束縛を持たない)。
      } else {
        escapes.push(n);
      }
    }
    ts.forEachChild(n, walk);
  })(sf);

  // ② `edit` の出現と、丸ごとの束縛の漏れを集める。
  const refs: { node: ts.Expression; method: EditMethod }[] = [];
  (function walk(n: ts.Node): void {
    if (ts.isPropertyAccessExpression(n) && METHODS.has(n.name.text)) {
      const method = n.name.text as EditMethod;
      const target = n.expression;
      if (ts.isIdentifier(target)) {
        const s = symbolAt(checker, target);
        if (s !== undefined && whole.has(s)) refs.push({ node: n, method });
      } else if (isUseCollectionCall(target)) {
        refs.push({ node: n, method });
      }
    }
    if (ts.isIdentifier(n) && isValuePosition(n)) {
      const s = symbolAt(checker, n);
      const method = s === undefined ? undefined : editFns.get(s);
      if (method !== undefined) refs.push({ node: n, method });
      if (s !== undefined && whole.has(s)) {
        const p = n.parent;
        const memberAccess = ts.isPropertyAccessExpression(p) && p.expression === n;
        if (!memberAccess) escapes.push(n);
      }
    }
    ts.forEachChild(n, walk);
  })(sf);

  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const out: EditSite[] = [];

  for (const { node: r, method } of refs) {
    const call = outer(r);
    const text = (ts.isCallExpression(call) ? call : r).getText(sf).replace(/\s+/g, ' ').slice(0, 120);
    const patch: PatchShape =
      method === 'edit' && ts.isCallExpression(call) && call.expression === r ? patchShape(call.arguments[1]) : 'fields';
    const at = (use: EditUse): void => {
      out.push({ file, line: lineOf(r), method, use, patch, text });
    };
    if (!ts.isCallExpression(call) || call.expression !== r) {
      at('passed-as-value');
      continue;
    }
    const awaited = outer(call);
    if (!ts.isAwaitExpression(awaited)) {
      at('not-awaited');
      continue;
    }
    const user = outer(awaited);
    if (ts.isExpressionStatement(user) || ts.isVoidExpression(user)) {
      at('discarded');
      continue;
    }
    if (ts.isVariableDeclaration(user) && user.initializer !== undefined) {
      if (!ts.isIdentifier(user.name)) {
        at('unread-variable');
        continue;
      }
      const s = checker.getSymbolAtLocation(user.name);
      let reads = 0;
      (function walk(n: ts.Node): void {
        if (ts.isIdentifier(n) && n !== user.name && isValuePosition(n) && s !== undefined && symbolAt(checker, n) === s) {
          reads += 1;
        }
        ts.forEachChild(n, walk);
      })(sf);
      at(reads > 0 ? 'read' : 'unread-variable');
      continue;
    }
    if (
      (ts.isPrefixUnaryExpression(user) && user.operator === ts.SyntaxKind.ExclamationToken) ||
      (ts.isIfStatement(user) && user.expression !== undefined) ||
      (ts.isConditionalExpression(user) && outerCondition(user, awaited)) ||
      (ts.isBinaryExpression(user) && READING_OPERATORS.has(user.operatorToken.kind))
    ) {
      at('read');
      continue;
    }
    // 返す・引数へ渡す・配列に入れる… —— 答えはここで読まれず、呼び手の先はここから数えられない。
    at('discarded');
  }
  for (const e of escapes) {
    out.push({ file, line: lineOf(e), method: 'edit', use: 'escaped', patch: 'fields', text: e.getText(sf).replace(/\s+/g, ' ').slice(0, 120) });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** `edit` の第 2 引数が、欄を名指しするオブジェクトリテラル (spread なし) か。 */
function patchShape(arg: ts.Expression | undefined): PatchShape {
  let n: ts.Node | undefined = arg;
  while (n !== undefined && ts.isParenthesizedExpression(n)) n = n.expression;
  if (n === undefined || !ts.isObjectLiteralExpression(n)) return 'whole';
  return n.properties.some((p) => ts.isSpreadAssignment(p)) ? 'whole' : 'fields';
}

/** 三項の**条件**として読んだか (結果の枝に置いただけでは読んでいない)。 */
function outerCondition(c: ts.ConditionalExpression, awaited: ts.Node): boolean {
  let n: ts.Node = c.condition;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n === awaited;
}

function realSites(): EditSite[] {
  return filesCallingUseCollection().flatMap((rel) => editSites(rel, readOriginalSource(join(REPO, rel))));
}

describe('useCollection の edit の答え —— 実物 (パス 498)', () => {
  it('★ どの呼び出しも await して答えを読む (捨てる形・待たない形・値として渡す形が 0 件)', () => {
    const bad = realSites().filter((s) => s.use !== 'read');
    expect(
      bad.map((s) => `${s.file}:${s.line} [${s.use}] ${s.text}`),
      '相手の行が消えていたら edit は false を返す —— 捨てると、何も書いていないのに保存が済んだ形になる (パス 498)',
    ).toEqual([]);
  });

  it('★ edit は欄を名指しして書く —— 解析した実体を丸ごと渡す書き込みは editIfUnchanged を通る (パス 499)', () => {
    const whole = realSites().filter((s) => s.method === 'edit' && s.patch === 'whole');
    expect(
      whole.map((s) => `${s.file}:${s.line} ${s.text}`),
      '丸ごとの実体を edit で書くと、欄を開いた後に別のタブが直した欄まで開いた時の値へ黙って戻す (lost update・パス 499)',
    ).toEqual([]);
  });

  it('床: 実物の呼び出しが見つかる (走査が死んでいない)', () => {
    const files = filesCallingUseCollection();
    expect(files.length, 'useCollection を呼ぶファイルが見つからない').toBeGreaterThanOrEqual(10);
    const read = realSites().filter((s) => s.use === 'read');
    expect(read.filter((s) => s.method === 'edit').length, 'edit の呼び出しが見つからない (束縛を辿れていない)').toBeGreaterThanOrEqual(3);
    // 実体を編集する 3 画面 (投資信託・不動産・士業の連絡先)。
    expect(read.filter((s) => s.method === 'editIfUnchanged').length, 'editIfUnchanged の呼び出しが見つからない').toBeGreaterThanOrEqual(3);
  });
});

describe('useCollection の edit の答え —— 標本 (数える形 / 数えない形)', () => {
  const HEAD = "import { useCollection } from './useCollection';\n";
  const uses = (body: string): EditUse[] => editSites('x/Sample.tsx', `${HEAD}${body}`).map((s) => s.use);

  it('捨てる形は数える (式文・void・待たない・値として渡す・読まない変数)', () => {
    expect(uses("export function A() { const { edit } = useCollection('c'); async function f() { await edit('1', {}); } return f; }\n")).toEqual(['discarded']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { void (await col.edit('1', {})); } return f; }\n")).toEqual(['discarded']);
    expect(uses("export function A() { const { edit: e2 } = useCollection('c'); function f() { fireReported(e2('1', {})); } return f; }\n")).toEqual(['not-awaited']);
    expect(uses("export function A() { const { edit } = useCollection('c'); return <Row onSave={edit} />; }\n")).toEqual(['passed-as-value']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { const ok = await col.edit('1', {}); } return f; }\n")).toEqual(['unread-variable']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { return await col.edit('1', {}); } return f; }\n")).toEqual(['discarded']);
    expect(uses("export function A() { const col = useCollection('c'); let ok = true; async function f() { ok = await col.edit('1', {}); } return [f, ok]; }\n")).toEqual(['discarded']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { g(), await col.edit('1', {}); } return f; }\n")).toEqual(['discarded']);
  });

  it('読む形は数えない (否定・if・変数を読む・比較・三項の条件)', () => {
    expect(uses("export function A() { const { edit } = useCollection('c'); async function f() { if (!(await edit('1', {}))) g(); } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { if (await col.edit('1', {})) return; } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const { edit: eh } = useCollection('c'); async function f() { const saved = await eh('1', {}); if (!saved) g(); } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { return (await col.edit('1', {})) === true; } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { g((await col.edit('1', {})) ? 'a' : 'b'); } return f; }\n")).toEqual(['read']);
  });

  it('束縛で数える —— 同じ綴りの別の関数は拾わず、別名と丸ごとの束縛は拾う', () => {
    // `edit` という名前の prop・配列の要素・別の hook の `edit` は useCollection の edit ではない。
    expect(uses("export function A({ edit }: { edit: (x: string) => void }) { const col = useCollection('c'); edit('x'); return col.records; }\n")).toEqual([]);
    expect(uses("export function A() { const other = useOther(); other.edit('1'); return null; }\n")).toEqual([]);
    // 別名の束縛は、元の綴りが無くても拾う。
    expect(uses("export function A() { const { edit: saveRow } = useCollection('c'); async function f() { await saveRow('1', {}); } return f; }\n")).toEqual(['discarded']);
    // 三項の**結果の枝**に置いただけでは読んでいない。
    expect(uses("export function A() { const col = useCollection('c'); async function f(b: boolean) { return b ? await col.edit('1', {}) : null; } return f; }\n")).toEqual(['discarded']);
  });

  it('editIfUnchanged も同じく答えを読む形を要求する (束縛・別名・丸ごと)', () => {
    expect(uses("export function A() { const { editIfUnchanged } = useCollection('c'); async function f() { await editIfUnchanged('1', {}, {}); } return f; }\n")).toEqual(['discarded']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { const r = await col.editIfUnchanged('1', {}, {}); if (r.status === 'changed') g(); } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const { editIfUnchanged: save } = useCollection('c'); function f() { fireReported(save('1', {}, {})); } return f; }\n")).toEqual(['not-awaited']);
  });

  it('edit の patch の形 —— 欄のリテラルは fields、実体を丸ごと・spread・変数は whole', () => {
    const shapes = (body: string): PatchShape[] => editSites('x/Sample.tsx', `${HEAD}${body}`).map((s) => s.patch);
    const wrap = (arg: string): string =>
      `export function A() { const col = useCollection('c'); async function f(parsed: object) { if (await col.edit('1', ${arg})) g(); } return f; }\n`;
    expect(shapes(wrap('{ status }'))).toEqual(['fields']);
    expect(shapes(wrap("{ role: 'admin', note: x }"))).toEqual(['fields']);
    expect(shapes(wrap('({ values: next })'))).toEqual(['fields']);
    expect(shapes(wrap('parsed'))).toEqual(['whole']);
    expect(shapes(wrap('{ ...parsed }'))).toEqual(['whole']);
    expect(shapes(wrap('{ ...parsed, name: x }'))).toEqual(['whole']);
    expect(shapes(wrap('build(parsed)'))).toEqual(['whole']);
    // editIfUnchanged は比較が守るので、実体を丸ごと渡してよい。
    expect(
      shapes("export function A() { const col = useCollection('c'); async function f(p: object) { const r = await col.editIfUnchanged('1', {}, p); if (r) g(); } return f; }\n"),
    ).toEqual(['fields']);
  });

  it('丸ごとの束縛を外へ渡す・rest で受けると、その先を数えられないので名指しする', () => {
    expect(uses("export function A() { const col = useCollection('c'); return <Row col={col} />; }\n")).toEqual(['escaped']);
    expect(uses("export function A() { const { records, ...rest } = useCollection('c'); return <Row rest={rest} n={records.length} />; }\n")).toEqual(['escaped']);
    // `x.名前` の形は漏れではない。
    expect(uses("export function A() { const col = useCollection('c'); return <Row n={col.records.length} busy={col.loading} />; }\n")).toEqual([]);
  });
});
