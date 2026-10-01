/**
 * **保存が断られたとき、その拒否を誰かが受け取る。** (2026-09-27 · パス 493o)
 *
 * `useCollection` の書き込み (`add` / `addMany` / `edit` / `remove` ほか —— 集合は定義から導く) は、断られると
 * 画面上端の知らせへ届けてから**投げ直す** (`useCollection.ts` の `reporting`)。
 * 投げ直すのは、自分の欄に理由を出す画面の契約を変えないためである。したがって
 * 呼び手は、その拒否を**必ずどこかで受け取らなければならない** —— try/catch か、
 * 「報せた失敗だけを落とす」`fireReported` か。受け取らない拒否は宙に浮き、
 * `unhandledrejection` として端末のコンソールにだけ出る (検査では未処理の拒否として鳴る)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 書き込みの呼び出しは **45 か所**。うち **10 か所**は拒否を誰も受け取っていなかった:
 *
 * | 画面 | 形 |
 * | --- | --- |
 * | KPI 実績 / 予算 / 貸借対照表 の × | `onClick={() => { …; return remove(r.id); }}` —— React はイベントの戻り値を捨てる |
 * | 売上集計・保有銘柄・物件 の削除 | `onClick={() => remove(id)}` |
 * | 売上集計・KPI 実績 の CSV 取り込み | `if (file) onImportFile(file);` —— 中の `await addMany(…)` の拒否が宙に浮く |
 * | メンバーの役割 | `onChange={(e) => onChangeRole(…)}` |
 * | メンバーの削除 | `void submit.run(() => onRemove(…))` —— `run` は拒否を握り潰さない (その docblock のとおり) |
 *
 * ★ **売上集計の取り込みはもう 1 段重かった** —— 失敗した瞬間に関数を抜けるので、
 * ファイルの欄が空にならない。**同じファイルを選び直しても変更が起きず、何も走らない**
 * (やり直せない)。そのうえ取り込みの欄は 1 文も出さなかった。
 *
 * ★ **設定画面 (パス 493k の直し) は逆向きに誤っていた** —— 行の `run` が失敗を
 * **何でも**落としたので、保存の前に保管層を直に読む `mutate` の読みの失敗 (報せの経路を
 * 通っていない) が、**画面に 1 文も出ずに消えた**。`fireReported` の規則
 * (「落としてよいのは、既に報せてあるからである」) は注記に書いてあるだけで、
 * 破っても何も鳴らなかった。今は `reportDeviceStoreFailure` が印を付け、
 * `fireReported` は印の無い失敗を投げ直す (`deviceStoreFailure.ts`)。
 *
 * ★ **数を書いていた注記は 2 つとも古びていた** —— `useCollection.ts` は「呼び出し側
 * 13 か所」、`deviceStoreFailure.ts` は 2026-09-06 に 13 か所を数えた。数は散文に置かない。
 *
 * ## この検査がすること
 *
 * 構文木 (TypeScript の compiler API —— 依存は増えない、`tsc` の本体) で、書き込みの
 * 呼び出しから**拒否の行き先を辿る**:
 *
 * - `await` の中なら、そこで投げる → 同じ関数の `try { … } catch` の中なら受け取った
 *   (catch が投げ直すなら、受け取っていない)
 * - `fireReported(…)` の引数なら受け取った / `.catch(…)` なら受け取った
 * - `return` / 矢印関数の本体なら、関数の返す約束が拒否される → その関数の使われ方を辿る:
 *   呼ばれた所・`run(…)` / `submit.run(…)` に渡された所 (どちらも拒否をそのまま返す)・
 *   JSX の属性 —— **小文字の要素** (`<button onClick>`) なら React が戻り値を捨てるので
 *   **受け取られない**。**部品** (`<Row onSave>`) なら、部品の中でその prop がどう呼ばれるかを辿る
 *   (同じファイルか、相対の import 先)
 * - `void` / 式文 (投げっぱなし) は受け取られない
 *
 * 辿れない形は `unresolved` として**理由つきの台帳**に載せる (両方向)。
 * 書き込みの**源**も台帳である —— `useCollection` の書き込みと、それを包んで返す hook
 * (`useParameters` の `set` / `reset` / `resetAll`・`useLatestForm` の `save` / `applyToLatest`)。
 * 包む側の中の呼び出しは「hook の外で辿る」ので `wrapper` として台帳に載る。
 *
 * ## パス 500 で広げた物 (実測)
 *
 * - **源の台帳が 2 パス分古びていた** —— `useCollection` の行は `add` / `addMany` / `edit` / `remove` の
 *   ままで、パス 499 の `editIfUnchanged` とパス 500 の `addIfLatest` / `applyToLatest` の呼び出しは
 *   **1 つも辿られていなかった** (実測: 同じ木を直す前の走査は 40 か所・直した後は 54 か所。増えた
 *   14 か所のうち画面の側は 9 か所で、どれも受け取られていた —— 欠陥は無かったが、
 *   `onClick={() => editIfUnchanged(…)}` と書いても鳴らない状態だった)。
 *   今は hook の定義から「拒否しうる関数」を導き、台帳と両方向に突き合わせる。
 * - **hook の結果が props で渡る** —— `useLatestForm` の結果は部品へ渡り、部品の中で `form.save(…)` が
 *   呼ばれる。束ねた名前だけを見る走査には映らないので、props の型が結果の型の欄を源として辿る。
 * - **`{...props}` で別の部品へ広げる** —— 名前で受けた props を広げた先まで辿る (広げる先を辿らないと、
 *   品目の変更 (`cropCol.applyToLatest`) の拒否が「辿れない」になった)。
 *
 * ★ **辿る規則そのものに標本を添える** (CLAUDE.md の規約) —— 下の「標本」の describe が、
 * 規則ごとに**受け取られない形と受け取られる形の両方**を合成の原文で確かめる。
 * 本物の木に当てた答えが「全部受け取っている」でも、それは規則が効いている証拠にならない。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

// ---------------------------------------------------------------------------
// 源の台帳
// ---------------------------------------------------------------------------

/**
 * 書き込みの源。**hook を呼んだ結果の関数**を呼ぶと、断られたとき拒否が返る。
 *
 * `useParameters` は `useCollection` を包み、`set` / `reset` / `resetAll` で書く
 * (`data/parameterOverrides.ts`)。`useLatestForm` も包み、`save` / `applyToLatest` で書く
 * (`data/useLatestForm.ts` · パス 500)。包む側の中の呼び出しは `WRAPPER_SITES` に載り、
 * ここに挙げた関数の呼び出しが辿る対象になる。
 *
 * ★ **`methods` は手で並べるが、定義から導いた集合と両方向に突き合わせる** (パス 500) ——
 * パス 499 は `useCollection` に `editIfUnchanged` を足し、パス 500 は `addIfLatest` /
 * `applyToLatest` を足したのに、この行は `add` / `addMany` / `edit` / `remove` のまま
 * だった。**足した口の呼び出しは 1 つも辿られていなかった** (実測: 直す前の走査は
 * `parameterOverrides.ts` の中の書き込みを **0 件**と答えた —— そこは 2 本とも新しい口へ移っていた)。
 * 導き方: hook が返す物のうち、**`async` で、握り潰す try の外に `await` を持つ関数** ——
 * `reload` は失敗を報せに写して投げないので外れ、`records` / `loading` は関数でないので外れる。
 *
 * ★ **hook の結果は部品の props でも渡る** (`resultType`) —— 経営サマリーは `useLatestForm` の
 * 結果を 3 つの部品へ渡し、部品の中で `form.save(…)` を呼ぶ。束ねた名前だけを見る走査には
 * 部品の中の呼び出しが映らない。props の型にこの型の欄が在れば、その欄も源として辿る。
 */
interface WriteSource {
  readonly hook: string;
  /** hook の定義の在る道。返す関数のうち拒否しうる物をここから導き、`methods` と突き合わせる。 */
  readonly definedIn: string;
  /** hook が返す型の名前。部品の第 1 引数の型にこの型の欄が在れば、その欄も源になる。 */
  readonly resultType: string;
  readonly methods: readonly string[];
}

const WRITE_SOURCES: readonly WriteSource[] = [
  {
    hook: 'useCollection',
    definedIn: 'src/renderer/data/useCollection.ts',
    resultType: 'UseCollection',
    methods: ['add', 'addIfLatest', 'addMany', 'applyToLatest', 'edit', 'editIfUnchanged', 'remove', 'replaceLatest'],
  },
  {
    hook: 'useParameters',
    definedIn: 'src/renderer/data/parameterOverrides.ts',
    resultType: 'UseParameters',
    methods: ['reset', 'resetAll', 'set'],
  },
  {
    hook: 'useLatestForm',
    definedIn: 'src/renderer/data/useLatestForm.ts',
    resultType: 'LatestForm',
    methods: ['applyToLatest', 'save'],
  },
];

/**
 * 包む hook の中の書き込み。ここでは辿らず、包んだ関数の呼び出しを源として辿る。
 * 鍵は `道 :: 呼び出しの字面`。両方向 —— 包む側の中の呼び出しが増えても減っても落ちる。
 */
const WRAPPER_SITES: Readonly<Record<string, string>> = {
  'src/renderer/data/parameterOverrides.ts :: col.addIfLatest(null, { values: next })':
    'useParameters の mutate が書く (まだ 1 件も無いときの枝 · パス 500)。拒否は mutate → set / reset / resetAll の' +
    '約束へそのまま返るので、WRITE_SOURCES の useParameters の行が、それを呼ぶ所 (設定画面) を辿る。',
  'src/renderer/data/parameterOverrides.ts :: col.replaceLatest({ id: latest.id, updatedAt: latest.updatedAt }, { values: next })':
    '同じ mutate の、最新がまだ読んだ行のその版なら置き換える枝 (パス 500)。拒否の返り方は上と同じ。',
  'src/renderer/data/parameterOverrides.ts :: col.addIfLatest(latestTokenOf(latest), { values: next })':
    '同じ mutate の、試みを使い切った後に新しい行として書く枝 (パス 498 / 500)。拒否の返り方は上と同じ。',
  'src/renderer/data/useLatestForm.ts :: col.addIfLatest(latestTokenOf(st.base), data)':
    'useLatestForm の save が書く (パス 500)。拒否は save の約束へそのまま返るので、WRITE_SOURCES の ' +
    'useLatestForm の行が、それを呼ぶ所 (経営サマリーの 3 つの欄・運転の設定) を辿る。',
  'src/renderer/data/useLatestForm.ts :: col.applyToLatest(change)':
    'useLatestForm の applyToLatest が書く (書式を選んだ瞬間の保存 · パス 500)。拒否の返り方は save と同じ。',
};

/**
 * 辿れない形の台帳。今日は **0 件**。
 *
 * 鍵は `道 :: 呼び出しの字面 :: 辿れなかった理由`。行を足すなら、なぜ受け取られると
 * 言えるのかを書く。両方向 —— 辿れるようになったら台帳から消せと落ちる。
 */
const UNRESOLVED_LEDGER: Readonly<Record<string, string>> = {};

// ---------------------------------------------------------------------------
// 辿る仕組み
// ---------------------------------------------------------------------------

type Verdict =
  | { readonly kind: 'caught' | 'fire-reported' | 'catch-chain'; readonly at: string }
  | { readonly kind: 'unhandled'; readonly at: string; readonly why: string }
  | { readonly kind: 'unresolved'; readonly at: string; readonly why: string };

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly verdicts: readonly Verdict[];
}

type FunctionLike =
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.FunctionDeclaration
  | ts.MethodDeclaration;

function isFunctionLike(n: ts.Node): n is FunctionLike {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
}

/** 型の付け足しや括弧は値を変えない —— 辿るときは飛ばす。 */
function skipTransparentUp(n: ts.Node): ts.Node {
  let cur = n;
  while (
    cur.parent &&
    (ts.isParenthesizedExpression(cur.parent) ||
      ts.isAsExpression(cur.parent) ||
      ts.isNonNullExpression(cur.parent) ||
      ts.isSatisfiesExpression(cur.parent) ||
      ts.isTypeAssertionExpression(cur.parent))
  ) {
    cur = cur.parent;
  }
  return cur;
}

/** 呼び出しの結果として拒否された約束をそのまま返す関数 (`useSubmitGuard.run` と画面の `run`)。 */
function isPropagatingRunner(callee: ts.Expression): boolean {
  const t = callee.getText();
  return /(^|\.)run$/.test(t);
}

/** 解析する原文の集まり。道 → 原文。import の解決もこの中で行う (合成の標本にも使う)。 */
interface Corpus {
  readonly sources: ReadonlyMap<string, string>;
}

class Analyzer {
  private readonly parsed = new Map<string, ts.SourceFile>();

  constructor(private readonly corpus: Corpus) {}

  sourceFile(file: string): ts.SourceFile | null {
    const hit = this.parsed.get(file);
    if (hit) return hit;
    const text = this.corpus.sources.get(file);
    if (text === undefined) return null;
    const sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    this.parsed.set(file, sf);
    return sf;
  }

  /** 書き込みの呼び出しを全部拾い、拒否の行き先を辿る。 */
  sites(): Site[] {
    const out: Site[] = [];
    for (const file of this.corpus.sources.keys()) {
      const sf = this.sourceFile(file)!;
      for (const call of this.writeCalls(sf)) {
        const { line } = sf.getLineAndCharacterOfPosition(call.getStart(sf));
        out.push({ file, line: line + 1, text: call.getText(sf), verdicts: this.follow(call, new Set<unknown>(), 0) });
      }
    }
    return out;
  }

  /**
   * 書き込みの呼び出しを返す。源は 3 つの形で束ねられる:
   *
   * 1. `const x = hook(…)` / `const { m } = hook(…)` —— 束ねた名前の呼び出し (ファイルの中どこでも)
   * 2. 部品の第 1 引数を分割代入し、その欄の型が hook の結果の型 (`{ form }: { form: LatestForm<…> }`)
   *    —— **その部品の本体の中の** `form.m(…)` (パス 500)
   * 3. 部品の第 1 引数を分割代入しない (`props: Props`) —— 本体の中の `props.form.m(…)` (パス 500)
   *
   * 引数そのものの型が結果の型 (`(form: LatestForm<…>) => …`) も 3 と同じ形で辿る。
   */
  private writeCalls(sf: ts.SourceFile): ts.CallExpression[] {
    const fnNames = new Set<string>();
    const objNames = new Map<string, readonly string[]>();
    const visitDecl = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)) {
        const callee = n.initializer.expression;
        const src = ts.isIdentifier(callee) ? WRITE_SOURCES.find((s) => s.hook === callee.text) : undefined;
        if (src) {
          if (ts.isObjectBindingPattern(n.name)) {
            for (const el of n.name.elements) {
              const prop = (el.propertyName ?? el.name).getText(sf);
              if (src.methods.includes(prop) && ts.isIdentifier(el.name)) fnNames.add(el.name.text);
            }
          } else if (ts.isIdentifier(n.name)) {
            objNames.set(n.name.text, src.methods);
          }
        }
      }
      ts.forEachChild(n, visitDecl);
    };
    visitDecl(sf);
    const calls: ts.CallExpression[] = [];
    const visitCall = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const c = n.expression;
        if (ts.isIdentifier(c) && fnNames.has(c.text)) calls.push(n);
        else if (
          ts.isPropertyAccessExpression(c) &&
          ts.isIdentifier(c.expression) &&
          objNames.get(c.expression.text)?.includes(c.name.text)
        ) {
          calls.push(n);
        } else if (ts.isPropertyAccessExpression(c) && propSourceMethods(c.expression, sf)?.includes(c.name.text)) {
          calls.push(n);
        }
      }
      ts.forEachChild(n, visitCall);
    };
    visitCall(sf);
    return calls;
  }

  private at(n: ts.Node): string {
    const sf = n.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    return `${sf.fileName}:${line + 1}`;
  }

  /** `expr` の値 (断られると拒否される約束) の行き先。 */
  follow(expr: ts.Node, seen: Set<unknown>, depth: number): Verdict[] {
    if (depth > 16) return [{ kind: 'unresolved', at: this.at(expr), why: '辿る段が深すぎる' }];
    const node = skipTransparentUp(expr);
    const parent = node.parent;
    if (!parent) return [{ kind: 'unresolved', at: this.at(expr), why: '親が無い' }];
    if (ts.isAwaitExpression(parent)) return this.throwAt(parent, seen, depth);
    if (ts.isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
      if (parent.expression.getText() === 'fireReported') return [{ kind: 'fire-reported', at: this.at(parent) }];
      return [{ kind: 'unresolved', at: this.at(parent), why: `約束が ${parent.expression.getText()}(…) の引数になる` }];
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      const call = parent.parent;
      const name = parent.name.text;
      if (call && ts.isCallExpression(call) && call.expression === parent) {
        if (name === 'catch') return [{ kind: 'catch-chain', at: this.at(call) }];
        if (name === 'then' && call.arguments.length >= 2) return [{ kind: 'catch-chain', at: this.at(call) }];
        if (name === 'then' || name === 'finally') return this.follow(call, seen, depth + 1);
      }
      return [{ kind: 'unresolved', at: this.at(parent), why: `.${name} で読まれる` }];
    }
    if (ts.isReturnStatement(parent)) {
      const fn = this.enclosingFunction(parent);
      return fn ? this.functionRejects(fn, seen, depth + 1) : [{ kind: 'unresolved', at: this.at(parent), why: '関数の外の return' }];
    }
    if (ts.isArrowFunction(parent) && parent.body === node) return this.functionRejects(parent, seen, depth + 1);
    if (ts.isVoidExpression(parent)) {
      return [{ kind: 'unhandled', at: this.at(parent), why: 'void で捨てた (拒否は誰にも受け取られない)' }];
    }
    if (ts.isExpressionStatement(parent)) {
      return [{ kind: 'unhandled', at: this.at(parent), why: '投げっぱなし (await も return も受け取る関数も無い)' }];
    }
    if (ts.isConditionalExpression(parent) && (parent.whenTrue === node || parent.whenFalse === node)) {
      return this.follow(parent, seen, depth + 1);
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === node &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        parent.operatorToken.kind,
      )
    ) {
      return this.follow(parent, seen, depth + 1);
    }
    return [{ kind: 'unresolved', at: this.at(parent), why: `${ts.SyntaxKind[parent.kind]} の中` }];
  }

  /** `await` がそこで投げる。同じ関数の try/catch の中なら受け取った (catch が投げ直さない限り)。 */
  private throwAt(awaitExpr: ts.Node, seen: Set<unknown>, depth: number): Verdict[] {
    let prev: ts.Node = awaitExpr;
    let p: ts.Node | undefined = awaitExpr.parent;
    while (p && !isFunctionLike(p)) {
      if (ts.isTryStatement(p) && p.tryBlock === prev && p.catchClause && !rethrows(p.catchClause.block)) {
        return [{ kind: 'caught', at: this.at(p.catchClause) }];
      }
      prev = p;
      p = p.parent;
    }
    if (!p) return [{ kind: 'unresolved', at: this.at(awaitExpr), why: '関数の外の await' }];
    return this.functionRejects(p, seen, depth + 1);
  }

  private enclosingFunction(n: ts.Node): FunctionLike | null {
    let p: ts.Node | undefined = n.parent;
    while (p && !isFunctionLike(p)) p = p.parent;
    return p ?? null;
  }

  /** 関数 `fn` の返す約束が拒否される —— その関数がどう使われるかを辿る。 */
  private functionRejects(fn: FunctionLike, seen: Set<unknown>, depth: number): Verdict[] {
    if (seen.has(fn)) return [];
    seen.add(fn);
    const holder = skipTransparentUp(fn);
    const parent = holder.parent;
    // 名前のある関数宣言: 名前の参照を辿る。
    if (ts.isFunctionDeclaration(fn) && fn.name) return this.references(fn.name, seen, depth);
    // const x = async () => …
    if (parent && ts.isVariableDeclaration(parent) && parent.initializer === holder && ts.isIdentifier(parent.name)) {
      return this.references(parent.name, seen, depth);
    }
    // run(() => …) / submit.run(() => …)
    if (parent && ts.isCallExpression(parent) && parent.arguments.some((a) => a === holder)) {
      if (isPropagatingRunner(parent.expression)) return this.follow(parent, seen, depth + 1);
      return [{ kind: 'unresolved', at: this.at(parent), why: `関数として ${parent.expression.getText()}(…) に渡る` }];
    }
    // onClick={() => …}
    if (parent && ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
      return this.jsxAttribute(parent.parent, seen, depth);
    }
    return [{ kind: 'unresolved', at: this.at(fn), why: `関数が ${parent ? ts.SyntaxKind[parent.kind] : '?'} に置かれる` }];
  }

  /** 名前 `name` (関数・部品の prop) の参照を、宣言の範囲の中で全部辿る。 */
  private references(name: ts.Identifier, seen: Set<unknown>, depth: number, scopeOverride?: ts.Node): Verdict[] {
    const scope = scopeOverride ?? this.scopeOf(name);
    const refs: ts.Identifier[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n !== name && n.text === name.text && isValueReference(n)) refs.push(n);
      ts.forEachChild(n, visit);
    };
    visit(scope);
    if (refs.length === 0) return [];
    return refs.flatMap((r) => this.reference(r, seen, depth));
  }

  /** 宣言が見える範囲 (いちばん内側の関数、無ければファイル)。 */
  private scopeOf(name: ts.Node): ts.Node {
    let p: ts.Node | undefined = name.parent;
    // 関数宣言そのものの名前なら、その宣言を含む範囲。
    if (p && isFunctionLike(p)) p = p.parent;
    while (p && !isFunctionLike(p) && !ts.isSourceFile(p)) p = p.parent;
    return p ?? name.getSourceFile();
  }

  private reference(ref: ts.Expression, seen: Set<unknown>, depth: number): Verdict[] {
    const node = skipTransparentUp(ref);
    const parent = node.parent;
    if (parent && ts.isCallExpression(parent) && parent.expression === node) return this.follow(parent, seen, depth + 1);
    if (parent && ts.isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
      if (isPropagatingRunner(parent.expression)) return this.follow(parent, seen, depth + 1);
      return [{ kind: 'unresolved', at: this.at(parent), why: `関数として ${parent.expression.getText()}(…) に渡る` }];
    }
    if (parent && ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
      return this.jsxAttribute(parent.parent, seen, depth);
    }
    return [{ kind: 'unresolved', at: this.at(ref), why: `参照が ${parent ? ts.SyntaxKind[parent.kind] : '?'} に置かれる` }];
  }

  /** JSX の属性に置かれた関数。小文字の要素なら React が戻り値を捨てる。部品なら中で辿る。 */
  private jsxAttribute(attr: ts.JsxAttribute, seen: Set<unknown>, depth: number): Verdict[] {
    const element = attr.parent.parent; // JsxAttributes → JsxOpeningElement / JsxSelfClosingElement
    const tag = element.tagName.getText();
    const prop = attr.name.getText();
    if (/^[a-z]/.test(tag)) {
      return [{ kind: 'unhandled', at: this.at(attr), why: `<${tag} ${prop}> —— React はイベントの戻り値を捨てる` }];
    }
    return this.componentProp(tag, prop, attr, seen, depth);
  }

  /**
   * 部品 `<tag>` が prop `prop` をどう使うかを辿る。受け方は 3 つ:
   *
   * - 第 1 引数の分割代入 (`{ onSave }`) —— 束ねた名前の参照を辿る
   * - 第 1 引数の名前 (`props`) —— 本体の中の `props.onSave` を辿る
   * - その名前をそのまま別の部品へ広げる (`<Inner {...props} />`) —— 同じ prop を `<Inner>` の中で辿る
   *   (パス 500: 経営サマリーの水耕栽培の欄は、保管層が答えるまで待つ外側の部品が `{...props}` で
   *   内側へ渡す。広げた先を辿らないと、品目の変更の拒否が「辿れない」になる)
   */
  private componentProp(tag: string, prop: string, from: ts.Node, seen: Set<unknown>, depth: number): Verdict[] {
    if (depth > 16) return [{ kind: 'unresolved', at: this.at(from), why: '辿る段が深すぎる' }];
    const comp = this.resolveComponent(tag, from.getSourceFile());
    if (!comp) return [{ kind: 'unresolved', at: this.at(from), why: `部品 <${tag}> の定義が見つからない` }];
    const body = comp.body;
    if (!body) return [{ kind: 'unresolved', at: this.at(from), why: `部品 <${tag}> に本体が無い` }];
    const visitKey = `${comp.getSourceFile().fileName}:${comp.pos}:${prop}`;
    if (seen.has(visitKey)) return [];
    seen.add(visitKey);
    const first = comp.parameters[0];
    let verdicts: Verdict[];
    if (first && ts.isObjectBindingPattern(first.name)) {
      const binding = propBinding(comp, prop);
      if (!binding) {
        return [{ kind: 'unresolved', at: this.at(from), why: `部品 <${tag}> が prop ${prop} を分割代入で受けていない` }];
      }
      verdicts = this.references(binding, seen, depth + 1, body);
    } else if (first && ts.isIdentifier(first.name)) {
      const propsName = first.name.text;
      verdicts = [];
      const visit = (n: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === propsName &&
          n.name.text === prop
        ) {
          verdicts.push(...this.reference(n, seen, depth + 1));
        } else if (ts.isJsxSpreadAttribute(n) && ts.isIdentifier(n.expression) && n.expression.text === propsName) {
          const inner = n.parent.parent; // JsxAttributes → JsxOpeningElement / JsxSelfClosingElement
          const innerTag = inner.tagName.getText();
          if (/^[a-z]/.test(innerTag)) {
            verdicts.push({
              kind: 'unhandled',
              at: this.at(n),
              why: `<${innerTag} {...${propsName}}> —— React はイベントの戻り値を捨てる`,
            });
          } else {
            verdicts.push(...this.componentProp(innerTag, prop, n, seen, depth + 1));
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(body);
    } else {
      return [{ kind: 'unresolved', at: this.at(from), why: `部品 <${tag}> の第 1 引数が分割代入でも名前でもない` }];
    }
    if (verdicts.length === 0) {
      return [{ kind: 'unresolved', at: this.at(from), why: `部品 <${tag}> が prop ${prop} を 1 度も使わない` }];
    }
    return verdicts;
  }

  /** 部品の定義を、同じファイルか相対の import 先から探す。 */
  private resolveComponent(tag: string, sf: ts.SourceFile): FunctionLike | null {
    const local = findFunctionNamed(sf, tag);
    if (local) return local;
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      const spec = stmt.moduleSpecifier.text;
      if (!spec.startsWith('.')) continue;
      const named = stmt.importClause?.namedBindings;
      if (!named || !ts.isNamedImports(named)) continue;
      const hit = named.elements.find((e) => e.name.text === tag);
      if (!hit) continue;
      const importedName = (hit.propertyName ?? hit.name).text;
      const base = path.posix.join(path.posix.dirname(sf.fileName), spec);
      for (const cand of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
        const other = this.sourceFile(cand);
        if (other) return findFunctionNamed(other, importedName);
      }
    }
    return null;
  }
}

/** 結果の型の名前 → その型の書き込みの関数。 */
const RESULT_TYPE_METHODS: ReadonlyMap<string, readonly string[]> = new Map(
  WRITE_SOURCES.map((w) => [w.resultType, w.methods] as const),
);

/** 型が hook の結果の型か (`LatestForm<…>` / `UseCollection<…>` / `UseParameters`)。 */
function resultTypeOf(t: ts.TypeNode | undefined): string | null {
  if (!t || !ts.isTypeReferenceNode(t) || !ts.isIdentifier(t.typeName)) return null;
  return RESULT_TYPE_METHODS.has(t.typeName.text) ? t.typeName.text : null;
}

/** 型の欄 (型の字面、または同じファイルの interface / type)。 */
function membersOfType(t: ts.TypeNode | undefined, sf: ts.SourceFile): readonly ts.TypeElement[] | null {
  if (!t) return null;
  if (ts.isTypeLiteralNode(t)) return t.members;
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
    const name = t.typeName.text;
    for (const st of sf.statements) {
      if (ts.isInterfaceDeclaration(st) && st.name.text === name) return st.members;
      if (ts.isTypeAliasDeclaration(st) && st.name.text === name && ts.isTypeLiteralNode(st.type)) return st.type.members;
    }
  }
  return null;
}

/** 欄 `key` の型が結果の型なら、その型の名前。 */
function resultTypedMember(members: readonly ts.TypeElement[], key: string): string | null {
  for (const m of members) {
    if (ts.isPropertySignature(m) && m.name.getText() === key) return resultTypeOf(m.type);
  }
  return null;
}

/**
 * 受け手 `recv` が、関数の引数として渡った hook の結果なら、その型の書き込みの関数。
 *
 * - `form` —— 囲む関数の第 1 引数が分割代入で `form` を束ね、その欄の型が結果の型
 * - `form` —— 囲む関数の引数 `form` そのものの型が結果の型
 * - `props.form` —— 囲む関数の第 1 引数 `props` の型の欄 `form` が結果の型
 *
 * 内側の関数から外へ向かって探し、**最初に名前を束ねた引数**で決める (影に入った名前を外の引数と取り違えない)。
 */
function propSourceMethods(recv: ts.Expression, sf: ts.SourceFile): readonly string[] | null {
  const direct = ts.isIdentifier(recv) ? recv.text : null;
  const viaProps =
    ts.isPropertyAccessExpression(recv) && ts.isIdentifier(recv.expression)
      ? { param: recv.expression.text, key: recv.name.text }
      : null;
  if (direct === null && viaProps === null) return null;
  for (let p: ts.Node | undefined = recv.parent; p; p = p.parent) {
    if (!isFunctionLike(p)) continue;
    for (const param of p.parameters) {
      if (direct !== null && ts.isObjectBindingPattern(param.name)) {
        for (const el of param.name.elements) {
          if (!ts.isIdentifier(el.name) || el.name.text !== direct) continue;
          const members = membersOfType(param.type, sf);
          const t = members ? resultTypedMember(members, (el.propertyName ?? el.name).getText(sf)) : null;
          return t === null ? null : RESULT_TYPE_METHODS.get(t)!;
        }
      }
      if (ts.isIdentifier(param.name)) {
        if (direct !== null && param.name.text === direct) {
          const t = resultTypeOf(param.type);
          return t === null ? null : RESULT_TYPE_METHODS.get(t)!;
        }
        if (viaProps !== null && param.name.text === viaProps.param) {
          const members = membersOfType(param.type, sf);
          const t = members ? resultTypedMember(members, viaProps.key) : null;
          return t === null ? null : RESULT_TYPE_METHODS.get(t)!;
        }
      }
    }
  }
  return null;
}

/** catch の本体が (入れ子の関数の外で) 投げ直すか。 */
function rethrows(block: ts.Block): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found || isFunctionLike(n)) return;
    if (ts.isThrowStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(block, visit);
  return found;
}

/** 値としての参照か (宣言の名前・属性名・メンバー名・型の中は除く)。 */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isJsxAttribute(p) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return false;
  if (ts.isVariableDeclaration(p) && p.name === id) return false;
  if (ts.isFunctionDeclaration(p) && p.name === id) return false;
  if (ts.isParameter(p) && p.name === id) return false;
  if (ts.isPropertySignature(p) || ts.isMethodSignature(p)) return false;
  if (ts.isTypeReferenceNode(p) || ts.isQualifiedName(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  return true;
}

function findFunctionNamed(sf: ts.SourceFile, name: string): FunctionLike | null {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return stmt;
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
          const init = skipDownTransparent(d.initializer);
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
        }
      }
    }
  }
  return null;
}

function skipDownTransparent(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
  return cur;
}

/** 部品の第 1 引数が分割代入なら、その prop の束ね先の名前。 */
function propBinding(comp: FunctionLike, prop: string): ts.Identifier | null {
  const first = comp.parameters[0];
  if (!first || !ts.isObjectBindingPattern(first.name)) return null;
  for (const el of first.name.elements) {
    const key = (el.propertyName ?? el.name).getText();
    if (key === prop && ts.isIdentifier(el.name)) return el.name;
  }
  return null;
}

/**
 * hook が返す物のうち、**拒否しうる関数**の名前 (定義の原文から導く · パス 500)。
 *
 * 拒否しうる = `async` で、握り潰す try (catch が投げ直さない) の外に `await` か `throw` を持つ
 * (入れ子の関数の中は数えない —— それはその関数の拒否である)。返す物は hook の本体の最後の
 * `return { … }` の欄: 短縮形 (`add`) は本体の中の `const add = useCallback(fn, …)` /
 * `const add = fn` / `function add` を、メソッドの形 (`async save() {…}`) はそれ自身を見る。
 */
function rejectingMembers(sf: ts.SourceFile, hook: string): string[] {
  const decl = sf.statements.find(
    (st): st is ts.FunctionDeclaration => ts.isFunctionDeclaration(st) && st.name?.text === hook,
  );
  if (!decl?.body) throw new Error(`${sf.fileName}: hook ${hook} の定義が見つからない`);
  const locals = new Map<string, FunctionLike>();
  for (const st of decl.body.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) locals.set(st.name.text, st);
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      let init = skipDownTransparent(d.initializer);
      if (ts.isCallExpression(init) && init.expression.getText(sf) === 'useCallback' && init.arguments[0]) {
        init = skipDownTransparent(init.arguments[0]);
      }
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) locals.set(d.name.text, init);
    }
  }
  const ret = [...decl.body.statements].reverse().find(
    (st): st is ts.ReturnStatement => ts.isReturnStatement(st) && st.expression !== undefined,
  );
  const obj = ret?.expression ? skipDownTransparent(ret.expression) : undefined;
  if (!obj || !ts.isObjectLiteralExpression(obj)) throw new Error(`${sf.fileName}: hook ${hook} が物の字面を返していない`);
  const out: string[] = [];
  for (const prop of obj.properties) {
    let fn: FunctionLike | undefined;
    if (ts.isShorthandPropertyAssignment(prop)) fn = locals.get(prop.name.text);
    else if (ts.isMethodDeclaration(prop)) fn = prop;
    else if (ts.isPropertyAssignment(prop)) {
      const init = skipDownTransparent(prop.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) fn = init;
      else if (ts.isIdentifier(init)) fn = locals.get(init.text);
    }
    if (fn && canReject(fn)) out.push(prop.name!.getText(sf));
  }
  return out.sort();
}

/** 関数が拒否しうるか (上の定義)。 */
function canReject(fn: FunctionLike): boolean {
  if (!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) || !fn.body) return false;
  let found = false;
  const visit = (n: ts.Node, guarded: boolean): void => {
    if (found || isFunctionLike(n)) return;
    if ((ts.isAwaitExpression(n) || ts.isThrowStatement(n)) && !guarded) {
      found = true;
      return;
    }
    if (ts.isTryStatement(n)) {
      const swallows = n.catchClause !== undefined && !rethrows(n.catchClause.block);
      visit(n.tryBlock, guarded || swallows);
      if (n.catchClause) visit(n.catchClause.block, guarded);
      if (n.finallyBlock) visit(n.finallyBlock, guarded);
      return;
    }
    ts.forEachChild(n, (c) => visit(c, guarded));
  };
  ts.forEachChild(fn.body, (c) => visit(c, false));
  return found;
}

/**
 * hook の結果の型が書かれた所のうち、**走査が源として辿れない形**を返す (パス 500)。
 *
 * 辿れる形は 2 つ —— 部品の第 1 引数の型 (型の字面か、同じファイルの interface / type) の欄、
 * または引数そのものの型。変数の注釈・戻り値・`typeof hook` などは、そこから呼ばれる書き込みを
 * 走査が見ない。黙って見落とさず、形を足すまで落とす。
 */
function unrecognizedResultTypes(sf: ts.SourceFile): string[] {
  const hooks = new Set(WRITE_SOURCES.map((w) => w.hook));
  // 第 1 引数の型として使われている型 (字面はそのもの・名前は宣言へ)。
  const paramTypes = new Set<ts.Node>();
  const paramTypeNames = new Set<string>();
  const collect = (n: ts.Node): void => {
    if (isFunctionLike(n)) {
      const t = n.parameters[0]?.type;
      if (t && ts.isTypeLiteralNode(t)) paramTypes.add(t);
      if (t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) paramTypeNames.add(t.typeName.text);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const bad: string[] = [];
  const at = (n: ts.Node): string => `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node): void => {
    if (ts.isTypeQueryNode(n) && hooks.has(n.exprName.getText(sf))) bad.push(`${at(n)} typeof ${n.exprName.getText(sf)}`);
    if (ts.isTypeReferenceNode(n) && resultTypeOf(n) !== null) {
      const p = n.parent;
      let ok = false;
      if (ts.isParameter(p) && p.type === n) ok = true;
      if (ts.isPropertySignature(p) && p.type === n) {
        const holder = p.parent;
        if (ts.isTypeLiteralNode(holder)) ok = paramTypes.has(holder) || (ts.isTypeAliasDeclaration(holder.parent) && paramTypeNames.has(holder.parent.name.text));
        if (ts.isInterfaceDeclaration(holder)) ok = paramTypeNames.has(holder.name.text);
      }
      if (!ok) bad.push(`${at(n)} ${n.getText(sf)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

// ---------------------------------------------------------------------------
// 本物の木
// ---------------------------------------------------------------------------

const REPO = path.resolve(__dirname, '../../..');
const RENDERER = path.join(REPO, 'src/renderer');

function rendererSources(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== '__audits__') walk(abs);
      } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.set(path.relative(REPO, abs).split(path.sep).join('/'), readOriginalSource(abs));
      }
    }
  };
  walk(RENDERER);
  return out;
}

const REAL_SOURCES = rendererSources();
const REAL_FILES: readonly string[] = [...REAL_SOURCES.keys()];
const REAL = new Analyzer({ sources: REAL_SOURCES });
const SITES = REAL.sites();

const siteKey = (s: Site): string => `${s.file} :: ${s.text}`;
/** 源の hook を定義するファイル。その中の書き込みは包む側の書き込みで、包んだ関数の呼び出しを辿る。 */
const WRAPPER_FILES: ReadonlySet<string> = new Set(WRITE_SOURCES.map((w) => w.definedIn));
const isWrapperSite = (s: Site): boolean => Object.hasOwn(WRAPPER_SITES, siteKey(s));

describe('保存が断られたとき、その拒否を誰かが受け取る (パス 493o)', () => {
  it('★ 走査が木を歩いた —— 書き込みの呼び出しは 40 か所以上', () => {
    // 実数は題名に書かない (2026-09-27 に「実測 50」と書いたが、測ると 48 だった —— 散文の数は古びる)。
    // 床は実測に張り付けない (減るのは正しい向きでありうる)。針が死んで 0 件で緑になる形だけを止める。
    expect(SITES.length).toBeGreaterThanOrEqual(40);
    // 3 つの受け止め方がどれも実物に現れている (規則が 1 つでも死ねば、その種類が 0 になる)
    const kinds = new Set(SITES.flatMap((s) => s.verdicts.map((v) => v.kind)));
    expect([...kinds].sort()).toEqual(expect.arrayContaining(['caught', 'fire-reported']));
  });

  it('★ 受け取られない拒否は 0 件 (直す前は 10 件)', () => {
    const bad = SITES.filter((s) => !isWrapperSite(s)).flatMap((s) =>
      s.verdicts
        .filter((v): v is Extract<Verdict, { kind: 'unhandled' }> => v.kind === 'unhandled')
        .map((v) => `${s.file}:${s.line} ${s.text} → ${v.at} ${v.why}`),
    );
    expect(bad, `拒否を誰も受け取らない書き込み:\n${bad.join('\n')}`).toEqual([]);
  });

  it('★ どの書き込みも、少なくとも 1 つの行き先を持つ (辿った結果が空の所は無い)', () => {
    const empty = SITES.filter((s) => !isWrapperSite(s) && s.verdicts.length === 0).map((s) => `${s.file}:${s.line} ${s.text}`);
    expect(empty).toEqual([]);
  });

  it('★ 辿れない形は台帳のとおり (両方向・今日は 0 件)', () => {
    const found = new Set(
      SITES.filter((s) => !isWrapperSite(s)).flatMap((s) =>
        s.verdicts
          .filter((v): v is Extract<Verdict, { kind: 'unresolved' }> => v.kind === 'unresolved')
          .map((v) => `${s.file} :: ${s.text} :: ${v.why}`),
      ),
    );
    const missing = [...found].filter((k) => !Object.hasOwn(UNRESOLVED_LEDGER, k));
    expect(missing, `辿れないのに台帳に無い (受け取られると言える理由を台帳に書くこと):\n${missing.join('\n')}`).toEqual([]);
    const stale = Object.keys(UNRESOLVED_LEDGER).filter((k) => !found.has(k));
    expect(stale, '台帳に在るのに、もう辿れない形ではない (台帳から消すこと)').toEqual([]);
  });

  it('★ 包む hook の中の書き込みは台帳のとおり (両方向)', () => {
    const inWrapperFile = SITES.filter((s) => WRAPPER_FILES.has(s.file)).map(siteKey).sort();
    expect(inWrapperFile).toEqual(Object.keys(WRAPPER_SITES).sort());
    for (const why of Object.values(WRAPPER_SITES)) expect(why.length).toBeGreaterThanOrEqual(15);
  });

  it('★ 源の関数は定義から導いた「拒否しうる関数」と一致する (両方向 · パス 500)', () => {
    for (const w of WRITE_SOURCES) {
      const sf = REAL.sourceFile(w.definedIn);
      expect(sf, w.definedIn).not.toBeNull();
      expect(rejectingMembers(sf!, w.hook), `${w.hook} の methods が定義とずれている`).toEqual([...w.methods].sort());
    }
  });

  it('★ hook の結果が props で渡る所は、走査が辿れる形だけ (パス 500)', () => {
    const bad = [...REAL_FILES]
      .filter((f) => !WRAPPER_FILES.has(f))
      .flatMap((f) => unrecognizedResultTypes(REAL.sourceFile(f)!));
    expect(bad, `hook の結果の型が、走査が辿れない形で書かれている:\n${bad.join('\n')}`).toEqual([]);
    // 床: 今日 props で渡る所 (しきい値・水耕栽培・提出者情報) が実際に源として辿られている
    const viaProps = SITES.filter((s) => /^(form|setup)\.(save|applyToLatest)\(/.test(s.text)).map((s) => s.file);
    expect(new Set(viaProps)).toEqual(new Set(['src/renderer/pages/OverviewPage.tsx', 'src/renderer/components/BankSubmissionSheet.tsx']));
  });

  it('★ 包む hook の関数も源として辿られている (設定画面の set / reset / resetAll)', () => {
    const viaParams = SITES.filter((s) => s.file === 'src/renderer/components/ParametersPanel.tsx').map((s) => s.text).sort();
    expect(viaParams).toEqual(['params.reset(id)', 'params.resetAll()', 'params.set(id, v)']);
    for (const s of SITES.filter((x) => x.file === 'src/renderer/components/ParametersPanel.tsx')) {
      expect(s.verdicts.map((v) => v.kind), s.text).toEqual(['fire-reported']);
    }
  });
});

// ---------------------------------------------------------------------------
// 標本 —— 規則ごとに、受け取られない形と受け取られる形を合成の原文で確かめる
// ---------------------------------------------------------------------------

function analyzeSample(files: Record<string, string>): Site[] {
  return new Analyzer({ sources: new Map(Object.entries(files)) }).sites();
}

const HEAD = `import { useCollection } from './useCollection';\nimport { fireReported } from './deviceStoreFailure';\n`;

function kindsOf(body: string): string[] {
  const sites = analyzeSample({
    'x/Page.tsx': `${HEAD}export function Page() {\n  const { add, remove } = useCollection('c');\n${body}\n}\n`,
  });
  expect(sites.length, '標本に書き込みが無い (標本が的に当たっていない)').toBeGreaterThan(0);
  return sites.flatMap((s) => s.verdicts.map((v) => v.kind));
}

describe('標本: 辿る規則はそれぞれ両向きに効く', () => {
  it('ボタンの戻り値に置いた書き込みは受け取られない / fireReported で包めば受け取られる', () => {
    expect(kindsOf(`  return <button onClick={() => remove('1')}>x</button>;`)).toEqual(['unhandled']);
    expect(kindsOf(`  return <button onClick={() => { return remove('1'); }}>x</button>;`)).toEqual(['unhandled']);
    expect(kindsOf(`  return <button onClick={() => fireReported(remove('1'))}>x</button>;`)).toEqual(['fire-reported']);
  });

  it('await の拒否は try/catch が受け取る —— catch が投げ直すなら受け取っていない', () => {
    const caught = `  async function f() { try { await add({}); } catch { return; } }\n  return <button onClick={() => void f()}>x</button>;`;
    expect(kindsOf(caught)).toEqual(['caught']);
    const rethrown = `  async function f() { try { await add({}); } catch (e) { throw e; } }\n  return <button onClick={() => void f()}>x</button>;`;
    expect(kindsOf(rethrown)).toEqual(['unhandled']);
    const finallyOnly = `  async function f() { try { await add({}); } finally { } }\n  return <button onClick={() => void f()}>x</button>;`;
    expect(kindsOf(finallyOnly)).toEqual(['unhandled']);
  });

  it('関数の拒否は呼んだ所まで辿る (式文・void は受け取らない / fireReported は受け取る)', () => {
    const floating = `  async function onImport() { await add({}); }\n  return <input onChange={() => { onImport(); }} />;`;
    expect(kindsOf(floating)).toEqual(['unhandled']);
    const voided = `  async function onImport() { await add({}); }\n  return <input onChange={() => void onImport()} />;`;
    expect(kindsOf(voided)).toEqual(['unhandled']);
    const fired = `  async function onImport() { await add({}); }\n  return <input onChange={() => fireReported(onImport())} />;`;
    expect(kindsOf(fired)).toEqual(['fire-reported']);
  });

  it('run(…) は拒否をそのまま返す —— void で捨てれば受け取られない / fireReported なら受け取られる', () => {
    const voided = `  const submit = useSubmitGuard();\n  async function onRemove() { await remove('1'); }\n  return <button onClick={() => void submit.run(() => onRemove())}>x</button>;`;
    expect(kindsOf(voided)).toEqual(['unhandled']);
    const fired = `  const submit = useSubmitGuard();\n  async function onRemove() { await remove('1'); }\n  return <button onClick={() => fireReported(submit.run(onRemove))}>x</button>;`;
    expect(kindsOf(fired)).toEqual(['fire-reported']);
  });

  it('.catch(…) は受け取る / .then(…) だけなら受け取らない', () => {
    expect(kindsOf(`  return <button onClick={() => { remove('1').catch(() => undefined); }}>x</button>;`)).toEqual(['catch-chain']);
    expect(kindsOf(`  return <button onClick={() => { remove('1').then(() => undefined); }}>x</button>;`)).toEqual(['unhandled']);
  });

  it('部品へ渡した関数は、部品の中でどう呼ばれるかまで辿る (同じファイル・相対の import 先)', () => {
    const child = (use: string) =>
      `export function Row({ onSave }: { onSave: () => Promise<void> }) {\n  return <button onClick={() => ${use}}>x</button>;\n}\n`;
    const page = `${HEAD}import { Row } from './Row';\nexport function Page() {\n  const { add } = useCollection('c');\n  return <Row onSave={() => add({})} />;\n}\n`;
    const bad = analyzeSample({ 'x/Page.tsx': page, 'x/Row.tsx': child('onSave()') });
    expect(bad.flatMap((s) => s.verdicts.map((v) => v.kind))).toEqual(['unhandled']);
    const good = analyzeSample({ 'x/Page.tsx': page, 'x/Row.tsx': `import { fireReported } from './deviceStoreFailure';\n${child('fireReported(onSave())')}` });
    expect(good.flatMap((s) => s.verdicts.map((v) => v.kind))).toEqual(['fire-reported']);
    // 部品が見つからない形は「辿れない」と言う (黙って受け取ったことにしない)
    const missing = analyzeSample({ 'x/Page.tsx': page });
    expect(missing.flatMap((s) => s.verdicts.map((v) => v.kind))).toEqual(['unresolved']);
  });

  it('包む hook の関数も源になる (変数に束ねた形・分割代入の形)', () => {
    const src = `import { useParameters } from './parameterOverrides';\nexport function P() {\n  const params = useParameters();\n  const { resetAll } = useParameters();\n  return <><button onClick={() => params.set('a', 1)}>x</button><button onClick={() => fireReported(resetAll())}>y</button></>;\n}\n`;
    const sites = analyzeSample({ 'x/P.tsx': src });
    expect(sites.map((s) => [s.text, s.verdicts.map((v) => v.kind)])).toEqual([
      ["params.set('a', 1)", ['unhandled']],
      ['resetAll()', ['fire-reported']],
    ]);
  });

  it('props で渡った hook の結果も源になる (分割代入・名前のまま・引数そのもの · パス 500)', () => {
    const head = `import type { LatestForm } from './useLatestForm';\nimport { fireReported } from './deviceStoreFailure';\n`;
    const destructured = (use: string) =>
      `${head}export function Panel({ form }: { form: LatestForm<A, B> }) {\n  return <button onClick={() => ${use}}>x</button>;\n}\n`;
    const kinds = (files: Record<string, string>) => analyzeSample(files).map((s) => [s.text, s.verdicts.map((v) => v.kind)]);
    expect(kinds({ 'x/Panel.tsx': destructured('form.save(d)') })).toEqual([['form.save(d)', ['unhandled']]]);
    expect(kinds({ 'x/Panel.tsx': destructured('fireReported(form.save(d))') })).toEqual([['form.save(d)', ['fire-reported']]]);
    // 名前のまま受ける (interface で型を書く)
    const named = `${head}interface Props { setup: LatestForm<A, B>; label: string }\nexport function Panel(props: Props) {\n  return <button onClick={() => props.setup.applyToLatest(f)}>x</button>;\n}\n`;
    expect(kinds({ 'x/Panel.tsx': named })).toEqual([['props.setup.applyToLatest(f)', ['unhandled']]]);
    // 引数そのものの型が結果の型
    const arg = `${head}export async function persist(form: LatestForm<A, B>) {\n  await form.save(d);\n}\nexport function Btn() {\n  return <button onClick={() => fireReported(persist(x))}>x</button>;\n}\n`;
    expect(kinds({ 'x/Panel.tsx': arg })).toEqual([['form.save(d)', ['fire-reported']]]);
    // ★ 結果の型ではない欄 (同じ名前 `form` でも) は源にしない —— 名前ではなく型で決めている
    const notResult = `${head}export function Panel({ form }: { form: { save(d: unknown): Promise<void> } }) {\n  return <button onClick={() => form.save(d)}>x</button>;\n}\n`;
    expect(kinds({ 'x/Panel.tsx': notResult })).toEqual([]);
    // ★ 影に入った名前は、内側の引数で決める (外の props を取り違えない)
    const shadow = `${head}export function Panel({ form }: { form: LatestForm<A, B> }) {\n  const inner = (form: { save(d: unknown): Promise<void> }) => form.save(d);\n  return <button onClick={() => fireReported(form.save(d))}>x</button>;\n}\n`;
    expect(kinds({ 'x/Panel.tsx': shadow })).toEqual([['form.save(d)', ['fire-reported']]]);
  });

  it('名前で受けた props を {...props} で別の部品へ広げた先まで辿る (パス 500)', () => {
    const page = `${HEAD}import { Outer } from './Outer';\nexport function Page() {\n  const { add } = useCollection('c');\n  return <Outer onSave={() => add({})} ready />;\n}\n`;
    const outer = (inner: string) =>
      `import { fireReported } from './deviceStoreFailure';\ninterface P { onSave: () => Promise<void>; ready: boolean }\n` +
      `export function Outer(props: P) {\n  if (!props.ready) return null;\n  return <Inner {...props} />;\n}\n` +
      `function Inner({ onSave }: P) {\n  return <button onClick={() => ${inner}}>x</button>;\n}\n`;
    const kinds = (inner: string) =>
      analyzeSample({ 'x/Page.tsx': page, 'x/Outer.tsx': outer(inner) }).flatMap((s) => s.verdicts.map((v) => v.kind));
    expect(kinds('onSave()')).toEqual(['unhandled']);
    expect(kinds('fireReported(onSave())')).toEqual(['fire-reported']);
    // 小文字の要素へ広げた形は、React が戻り値を捨てる
    const toDom = `interface P { onSave: () => Promise<void> }\nexport function Outer(props: P) {\n  return <button {...props} />;\n}\n`;
    expect(analyzeSample({ 'x/Page.tsx': page, 'x/Outer.tsx': toDom }).flatMap((s) => s.verdicts.map((v) => v.kind))).toEqual(['unhandled']);
    // 名前で受けて 1 度も使わない形は「辿れない」と言う
    const unused = `interface P { onSave: () => Promise<void> }\nexport function Outer(props: P) {\n  return <div>{String(props)}</div>;\n}\n`;
    expect(analyzeSample({ 'x/Page.tsx': page, 'x/Outer.tsx': unused }).flatMap((s) => s.verdicts.map((v) => v.kind))).toEqual(['unresolved']);
  });

  it('拒否しうる関数の導き方: await / throw が握り潰す try の外に在る async 関数だけ (パス 500)', () => {
    const sf = ts.createSourceFile(
      'x/useThing.ts',
      [
        'export function useThing() {',
        '  const a = useCallback(async () => { await w(); }, []);',
        '  const b = useCallback(async () => { try { await w(); } catch (e) { report(e); } }, []);',
        '  const c = async () => { try { await w(); } catch (e) { throw e; } };',
        '  const d = () => w();',
        '  const e = async () => { if (x) throw new Error("x"); };',
        '  const f = async () => { const g = async () => { await w(); }; void g; };',
        '  const values = useMemo(() => 1, []);',
        '  return { a, b, c, d, e, f, values, loading: col.loading, async h() { await w(); }, i() { return w(); } };',
        '}',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    // b: 握り潰す try の中 / d・i: async でない / f: await は入れ子の関数の中 / values・loading: 関数でない
    expect(rejectingMembers(sf, 'useThing')).toEqual(['a', 'c', 'e', 'h']);
  });

  it('hook の結果の型は、走査が辿れる形だけに書かれる (変数の注釈・typeof は落とす · パス 500)', () => {
    const src = (body: string) =>
      ts.createSourceFile('x/Page.tsx', `import type { LatestForm } from './useLatestForm';\n${body}\n`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(unrecognizedResultTypes(src('interface P { form: LatestForm<A, B> }\nexport function Q(props: P) { return null; }'))).toEqual([]);
    expect(unrecognizedResultTypes(src('export function Q({ form }: { form: LatestForm<A, B> }) { return null; }'))).toEqual([]);
    expect(unrecognizedResultTypes(src('export function Q(form: LatestForm<A, B>) { return null; }'))).toEqual([]);
    expect(unrecognizedResultTypes(src('interface P { form: LatestForm<A, B> }\nexport const x = 1;'))).toEqual(['x/Page.tsx:2 LatestForm<A, B>']);
    expect(unrecognizedResultTypes(src('export function Q() { const f: LatestForm<A, B> = g(); return f; }'))).toEqual(['x/Page.tsx:2 LatestForm<A, B>']);
    expect(unrecognizedResultTypes(src('type R = ReturnType<typeof useLatestForm>;'))).toEqual(['x/Page.tsx:2 typeof useLatestForm']);
  });
});
