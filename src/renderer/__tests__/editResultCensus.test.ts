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
 *
 * ## パス 500 で広げた物
 *
 * - **口が 2 → 5 つ** —— `useCollection` の `addIfLatest` / `applyToLatest` と、それを包む `useLatestForm`
 *   の `save` / `applyToLatest`。どれも**断ったときは何も書かずに答えで言う**ので、捨てると「保存しました」を
 *   出したまま何も書いていない形になる (対照: しきい値の保存で答えを捨てて `setSaved(true)` にすると鳴る)。
 *   一覧 (`ANSWER_SOURCES`) は hook の返す型から「`Promise<void>` でない約束を返す欄」を導いて両方向に突き合わせる
 *   —— 口を足した日に一覧が古びれば、ここが鳴る。
 * - **props で渡った結果** —— 経営サマリーは `useLatestForm` の結果を 3 つの部品へ渡す。丸ごとの束縛を渡すのは
 *   ③ の漏れだったが、受け取る部品の props の型が結果の型なら、その部品の中の呼び出しをここが数える
 *   (`resultTypedProps` が実物の木から「部品名.欄名」を集め、渡してよい所だけを漏れから外す)。
 * - **読んだ形を 2 つ足した** —— 答えの欄を読む (`(await x).status`) と、画面の状態へ置く (`setSaved(await x)` ——
 *   `useState` の 2 つ目の要素)。代入 (`saved = await x`) は、代入した変数が別の所で読まれれば読んだと数える
 *   (運転の設定の保存は try の中で受け、try の外で読む)。
 * - **残る死角 (正直に書く)**: 名前で受けた props (`props`) をそのまま型の無い関数へ渡すと、その先の呼び出しは
 *   数えられない (今日 0 件)。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const ROOT = 'src/renderer';
const SKIP_DIRS = new Set(['__tests__', '__audits__']);

/**
 * 答えで「書けたか」を言う書き込みの源 (パス 500 で広げた)。
 *
 * - `useCollection` —— `edit` / `editIfUnchanged` (パス 498 / 499) に加え、`addIfLatest` / `applyToLatest`
 *   (パス 500)。どれも**断ったときは何も書かずに答えで言う** (投げない)。
 * - `useLatestForm` —— `save` (書けたら `true`・開いた後に保存し直されていたら `false`) と
 *   `applyToLatest` (パス 500)。
 *
 * `methods` は手で並べるが、hook の返す型 (`interface`) から「`Promise<void>` でない約束を返す欄」を
 * 導いて両方向に突き合わせる —— パス 500 で `addIfLatest` を足したとき、この一覧は `edit` /
 * `editIfUnchanged` のままで、新しい口の答えを捨てても鳴らなかった。
 */
interface AnswerSource {
  readonly hook: string;
  readonly definedIn: string;
  /** hook の返す型。部品の props にこの型の欄が在れば、その欄も源になる。 */
  readonly resultType: string;
  readonly methods: readonly EditMethod[];
}

export const ANSWER_SOURCES: readonly AnswerSource[] = [
  {
    hook: 'useCollection',
    definedIn: `${ROOT}/data/useCollection.ts`,
    resultType: 'UseCollection',
    methods: ['addIfLatest', 'applyToLatest', 'edit', 'editIfUnchanged', 'replaceLatest'],
  },
  {
    hook: 'useLatestForm',
    definedIn: `${ROOT}/data/useLatestForm.ts`,
    resultType: 'LatestForm',
    methods: ['applyToLatest', 'save'],
  },
];

const RESULT_TYPE_METHODS: ReadonlyMap<string, ReadonlySet<EditMethod>> = new Map(
  ANSWER_SOURCES.map((a) => [a.resultType, new Set(a.methods)] as const),
);

/** 源に触れうるファイルの印 (hook の呼び出しか、結果の型の名前)。 */
const SOURCE_MENTION = new RegExp(
  `\\b(?:${ANSWER_SOURCES.map((a) => a.hook).join('|')})\\s*[<(]|\\b(?:${ANSWER_SOURCES.map((a) => a.resultType).join('|')})\\s*<`,
);

/** renderer の `.ts` / `.tsx` (検査と監査を除く) のうち、源に触れうる物。 */
function filesTouchingSources(): string[] {
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
      if (SOURCE_MENTION.test(readOriginalSource(join(REPO, child)))) out.push(child);
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

/** 源の hook の呼び出しなら、その源。 */
function sourceOfCall(n: ts.Node | undefined): AnswerSource | null {
  if (n === undefined || !ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return null;
  const name = n.expression.text;
  return ANSWER_SOURCES.find((a) => a.hook === name) ?? null;
}

/** 型が結果の型なら、その型の答えを返す関数。 */
function resultMethodsOf(t: ts.TypeNode | undefined): ReadonlySet<EditMethod> | null {
  if (t === undefined || !ts.isTypeReferenceNode(t) || !ts.isIdentifier(t.typeName)) return null;
  return RESULT_TYPE_METHODS.get(t.typeName.text) ?? null;
}

/** 型の欄 (型の字面、または同じファイルの interface / type)。 */
function membersOfType(t: ts.TypeNode | undefined, sf: ts.SourceFile): readonly ts.TypeElement[] | null {
  if (t === undefined) return null;
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

function resultMember(members: readonly ts.TypeElement[], key: string): ReadonlySet<EditMethod> | null {
  for (const m of members) {
    if (ts.isPropertySignature(m) && m.name.getText() === key) return resultMethodsOf(m.type);
  }
  return null;
}

/** 関数の名前 (宣言の名前か、`const 名前 = …` の名前)。 */
function functionName(fn: ts.SignatureDeclaration): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

const isFnLike = (n: ts.Node): n is ts.SignatureDeclaration & { parameters: ts.NodeArray<ts.ParameterDeclaration> } =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

/**
 * 部品の props の欄のうち、結果の型の物 (`部品名.欄名`)。丸ごとの束縛をこの欄へ渡すのは漏れではない ——
 * 受け取る部品の中の呼び出しを、ここが props の型から源として数える (パス 500)。
 */
export function resultTypedProps(file: string, src: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(`/${file}`, src, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  (function walk(n: ts.Node): void {
    if (isFnLike(n)) {
      const name = functionName(n);
      const first = n.parameters[0];
      const members = first === undefined ? null : membersOfType(first.type, sf);
      if (name !== null && members !== null) {
        for (const m of members) {
          if (ts.isPropertySignature(m) && resultMethodsOf(m.type) !== null) out.push(`${name}.${m.name.getText(sf)}`);
        }
      }
    }
    ts.forEachChild(n, walk);
  })(sf);
  return out.sort();
}

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

/**
 * 数える書き込みの口 (パス 499 で `editIfUnchanged`、パス 500 で `addIfLatest` / `applyToLatest` /
 * `useLatestForm` の `save` が加わった)。
 */
export type EditMethod = 'edit' | 'editIfUnchanged' | 'addIfLatest' | 'applyToLatest' | 'replaceLatest' | 'save';

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


/**
 * 1 ファイルの書き込みの口の出現を、答えの扱いつきで返す。
 *
 * `knownProps` は、丸ごとの束縛を渡してよい部品の props (`部品名.欄名` —— `resultTypedProps` が
 * 実物の木から集める)。そこへ渡した束縛は、受け取る部品の側で props の型から数えるので漏れではない。
 */
export function editSites(file: string, src: string, knownProps: ReadonlySet<string> = new Set()): EditSite[] {
  const { sf, checker } = bindOne(file, src);
  /** 丸ごと受けた束縛 → 答えを返す関数。 */
  const whole = new Map<ts.Symbol, ReadonlySet<EditMethod>>();
  /** 分割代入で受けた関数 → どの口か。 */
  const editFns = new Map<ts.Symbol, EditMethod>();
  /** 名前で受けた props (`props: P`) → 結果の型の欄 → 答えを返す関数 (`props.form.save(…)` の形)。 */
  const holders = new Map<ts.Symbol, ReadonlyMap<string, ReadonlySet<EditMethod>>>();
  const escapes: ts.Node[] = [];
  const symOf = (id: ts.Identifier): ts.Symbol | undefined => checker.getSymbolAtLocation(id);

  // ① 束縛を集める —— hook の呼び出しと、props の型。
  (function walk(n: ts.Node): void {
    const source = sourceOfCall(n);
    if (source !== null) {
      const methods = new Set(source.methods);
      const p = outer(n);
      if (ts.isVariableDeclaration(p) && p.initializer !== undefined) {
        if (ts.isIdentifier(p.name)) {
          const s = symOf(p.name);
          if (s !== undefined) whole.set(s, methods);
        } else if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) {
            if (el.dotDotDotToken !== undefined && ts.isIdentifier(el.name)) {
              // `{ records, ...rest }` —— rest は書き込みの口を運びうる丸ごとの物。
              const s = symOf(el.name);
              if (s !== undefined) whole.set(s, methods);
              continue;
            }
            const key = el.propertyName ?? el.name;
            if (ts.isIdentifier(key) && methods.has(key.text as EditMethod) && ts.isIdentifier(el.name)) {
              const s = symOf(el.name);
              if (s !== undefined) editFns.set(s, key.text as EditMethod);
            }
          }
        } else {
          escapes.push(n);
        }
      } else if (ts.isPropertyAccessExpression(p) && p.expression === n) {
        // `useCollection(…).x` —— 書き込みの口なら下の ② で数える (ここでは束縛を持たない)。
      } else {
        escapes.push(n);
      }
    }
    if (isFnLike(n)) {
      for (const param of n.parameters) {
        if (ts.isObjectBindingPattern(param.name)) {
          const members = membersOfType(param.type, sf);
          if (members === null) continue;
          for (const el of param.name.elements) {
            if (!ts.isIdentifier(el.name)) continue;
            const key = (el.propertyName ?? el.name).getText(sf);
            const methods = resultMember(members, key);
            const s = methods === null ? undefined : symOf(el.name);
            if (methods !== null && s !== undefined) whole.set(s, methods);
          }
        } else if (ts.isIdentifier(param.name)) {
          const s = symOf(param.name);
          if (s === undefined) continue;
          const direct = resultMethodsOf(param.type);
          if (direct !== null) {
            whole.set(s, direct);
            continue;
          }
          const members = membersOfType(param.type, sf);
          if (members === null) continue;
          const byKey = new Map<string, ReadonlySet<EditMethod>>();
          for (const m of members) {
            if (!ts.isPropertySignature(m)) continue;
            const methods = resultMethodsOf(m.type);
            if (methods !== null) byKey.set(m.name.getText(sf), methods);
          }
          if (byKey.size > 0) holders.set(s, byKey);
        }
      }
    }
    ts.forEachChild(n, walk);
  })(sf);

  // ② 口の出現と、丸ごとの束縛の漏れを集める。
  const refs: { node: ts.Expression; method: EditMethod }[] = [];
  (function walk(n: ts.Node): void {
    if (ts.isPropertyAccessExpression(n)) {
      const method = n.name.text as EditMethod;
      const target = n.expression;
      if (ts.isIdentifier(target)) {
        const s = symbolAt(checker, target);
        if (s !== undefined && whole.get(s)?.has(method)) refs.push({ node: n, method });
      } else if (sourceOfCall(target)?.methods.includes(method)) {
        refs.push({ node: n, method });
      } else if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
        const s = symbolAt(checker, target.expression);
        const methods = s === undefined ? undefined : holders.get(s)?.get(target.name.text);
        if (methods?.has(method)) refs.push({ node: n, method });
      }
    }
    if (ts.isIdentifier(n) && isValuePosition(n)) {
      const s = symbolAt(checker, n);
      const method = s === undefined ? undefined : editFns.get(s);
      if (method !== undefined) refs.push({ node: n, method });
      if (s !== undefined && whole.has(s)) {
        const p = n.parent;
        const memberAccess = ts.isPropertyAccessExpression(p) && p.expression === n;
        if (!memberAccess && !passedToKnownProp(n, knownProps)) escapes.push(n);
      }
    }
    ts.forEachChild(n, walk);
  })(sf);

  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const out: EditSite[] = [];

  /** 変数 `id` が、`id` 自身の宣言・代入の左辺の外で読まれるか。 */
  const isReadElsewhere = (id: ts.Identifier): boolean => {
    const s = checker.getSymbolAtLocation(id);
    if (s === undefined) return false;
    let reads = 0;
    (function walk(n: ts.Node): void {
      if (ts.isIdentifier(n) && n !== id && isValuePosition(n) && symbolAt(checker, n) === s) {
        const p = outer(n);
        const assignedTo =
          ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && skipParensDown(p.left) === n;
        if (!assignedTo) reads += 1;
      }
      ts.forEachChild(n, walk);
    })(sf);
    return reads > 0;
  };

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
      at(isReadElsewhere(user.name) ? 'read' : 'unread-variable');
      continue;
    }
    // `saved = await form.save(…)` —— 代入した変数が別の所で読まれれば読んだ (パス 500 · 運転の設定の
    // 保存は try の中で答えを受け、try の外で読む)。
    if (ts.isBinaryExpression(user) && user.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = skipParensDown(user.left);
      at(ts.isIdentifier(left) && isReadElsewhere(left) ? 'read' : 'unread-variable');
      continue;
    }
    if (
      (ts.isPrefixUnaryExpression(user) && user.operator === ts.SyntaxKind.ExclamationToken) ||
      (ts.isIfStatement(user) && user.expression !== undefined) ||
      (ts.isConditionalExpression(user) && outerCondition(user, awaited)) ||
      (ts.isBinaryExpression(user) && READING_OPERATORS.has(user.operatorToken.kind)) ||
      // `(await col.addIfLatest(…)).status` —— 答えの欄を読んだ (パス 500)
      (ts.isPropertyAccessExpression(user) && skipParensDown(user.expression) === awaited) ||
      // `setSaved(await form.save(…))` —— 答えを画面の状態に置いた (パス 500)
      (ts.isCallExpression(user) && user.arguments.length === 1 && isStateSetter(user.expression, checker))
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

function skipParensDown(n: ts.Expression): ts.Expression {
  let cur = n;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

/**
 * 呼ばれた関数が `useState` の更新関数か (`const [x, setX] = useState(…)` の 2 つ目)。
 * 答えを画面の状態に置くのは読んだことになる —— 「保存しました」が答えに従って出る。
 */
function isStateSetter(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(callee)) return false;
  const decl = checker.getSymbolAtLocation(callee)?.declarations?.[0];
  if (decl === undefined || !ts.isBindingElement(decl)) return false;
  const pattern = decl.parent;
  if (!ts.isArrayBindingPattern(pattern) || pattern.elements.indexOf(decl) !== 1) return false;
  const holder = pattern.parent;
  return (
    ts.isVariableDeclaration(holder) &&
    holder.initializer !== undefined &&
    ts.isCallExpression(holder.initializer) &&
    ts.isIdentifier(holder.initializer.expression) &&
    holder.initializer.expression.text === 'useState'
  );
}

/** 丸ごとの束縛を、props の型が結果の型の欄へそのまま渡したか (`<Panel form={form} />`)。 */
function passedToKnownProp(id: ts.Identifier, knownProps: ReadonlySet<string>): boolean {
  const expr = id.parent;
  if (!expr || !ts.isJsxExpression(expr) || expr.expression !== id) return false;
  const attr = expr.parent;
  if (!attr || !ts.isJsxAttribute(attr)) return false;
  const element = attr.parent.parent;
  return knownProps.has(`${element.tagName.getText()}.${attr.name.getText()}`);
}

/**
 * 返す型の欄のうち、**答えを返す約束** (`Promise<X>` で X が `void` でない) の名前。
 * `(…) => Promise<X>` の欄とメソッドの形 (`save(d): Promise<X>`) の両方を見る。
 */
export function answerBearingMembers(iface: ts.InterfaceDeclaration, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const m of iface.members) {
    let ret: ts.TypeNode | undefined;
    if (ts.isMethodSignature(m)) ret = m.type;
    else if (ts.isPropertySignature(m) && m.type !== undefined && ts.isFunctionTypeNode(m.type)) ret = m.type.type;
    if (
      ret !== undefined &&
      ts.isTypeReferenceNode(ret) &&
      ret.typeName.getText(sf) === 'Promise' &&
      ret.typeArguments?.[0] !== undefined &&
      ret.typeArguments[0].kind !== ts.SyntaxKind.VoidKeyword
    ) {
      out.push(m.name!.getText(sf));
    }
  }
  return out.sort();
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

/** 実物の木の、結果の型の props (`部品名.欄名`)。 */
function realKnownProps(): ReadonlySet<string> {
  return new Set(filesTouchingSources().flatMap((rel) => resultTypedProps(rel, readOriginalSource(join(REPO, rel)))));
}

function realSites(): EditSite[] {
  const known = realKnownProps();
  return filesTouchingSources().flatMap((rel) => editSites(rel, readOriginalSource(join(REPO, rel)), known));
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
    const files = filesTouchingSources();
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
    // 代入した変数が 1 度も読まれない (パス 500 から、代入は「代入した先が読まれるか」で決める)
    expect(uses("export function A() { const col = useCollection('c'); let ok = true; async function f() { ok = await col.edit('1', {}); } return f; }\n")).toEqual(['unread-variable']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { g(), await col.edit('1', {}); } return f; }\n")).toEqual(['discarded']);
  });

  it('読む形は数えない (否定・if・変数を読む・比較・三項の条件)', () => {
    expect(uses("export function A() { const { edit } = useCollection('c'); async function f() { if (!(await edit('1', {}))) g(); } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { if (await col.edit('1', {})) return; } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const { edit: eh } = useCollection('c'); async function f() { const saved = await eh('1', {}); if (!saved) g(); } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { return (await col.edit('1', {})) === true; } return f; }\n")).toEqual(['read']);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { g((await col.edit('1', {})) ? 'a' : 'b'); } return f; }\n")).toEqual(['read']);
    // 代入した変数を別の所で読む (パス 500 —— 運転の設定の保存は try の中で受けて外で読む)
    expect(uses("export function A() { const col = useCollection('c'); async function f() { let ok: boolean; try { ok = await col.edit('1', {}); } catch { return; } if (!ok) g(); } return f; }\n")).toEqual(['read']);
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

describe('答えで「書けたか」を言う口 —— パス 500 で広げた物', () => {
  const HEAD = "import { useCollection } from './useCollection';\nimport { useLatestForm, type LatestForm } from './useLatestForm';\n";
  const uses = (body: string, known: readonly string[] = []): [EditMethod, EditUse][] =>
    editSites('x/Sample.tsx', `${HEAD}${body}`, new Set(known)).map((s) => [s.method, s.use]);

  it('★ 源の口は hook の返す型から導いた「答えを返す欄」と一致する (両方向)', () => {
    for (const a of ANSWER_SOURCES) {
      const src = readOriginalSource(join(REPO, a.definedIn));
      const sf = ts.createSourceFile(a.definedIn, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const iface = sf.statements.find(
        (st): st is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(st) && st.name.text === a.resultType,
      );
      expect(iface, `${a.definedIn} に interface ${a.resultType} が無い`).toBeDefined();
      expect(answerBearingMembers(iface!, sf), `${a.hook} の methods が返す型とずれている`).toEqual([...a.methods].sort());
    }
  });

  it('導き方: 約束を返す欄のうち Promise<void> でない物 (関数でない欄・同期の関数は外れる)', () => {
    const sf = ts.createSourceFile(
      'x/t.ts',
      [
        'export interface R<T> {',
        '  records: readonly T[];',
        '  add: (d: T) => Promise<void>;',
        '  edit: (id: string) => Promise<boolean>;',
        '  apply(change: () => T): Promise<Result<T>>;',
        '  update(fn: () => T): void;',
        '  readonly ready: boolean;',
        '}',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const iface = sf.statements[0] as ts.InterfaceDeclaration;
    expect(answerBearingMembers(iface, sf)).toEqual(['apply', 'edit']);
  });

  it('addIfLatest / applyToLatest の答えも読む (捨てる形は数え、欄を読む形は数えない)', () => {
    expect(uses("export function A() { const col = useCollection('c'); async function f() { await col.addIfLatest(null, {}); } return f; }\n")).toEqual([['addIfLatest', 'discarded']]);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { if ((await col.addIfLatest(null, {})).status === 'saved') return; } return f; }\n")).toEqual([['addIfLatest', 'read']]);
    expect(uses("export function A() { const { applyToLatest } = useCollection('c'); function f() { fireReported(applyToLatest(() => null)); } return f; }\n")).toEqual([['applyToLatest', 'not-awaited']]);
    expect(uses("export function A() { const col = useCollection('c'); async function f() { const r = await col.applyToLatest(() => null); if (r.status === 'busy') g(); } return f; }\n")).toEqual([['applyToLatest', 'read']]);
  });

  it('useLatestForm の save も読む —— 画面の状態へ置くのは読んだ / 他の関数へ渡すのは捨てた', () => {
    const body = (use: string) =>
      `export function A() { const form = useLatestForm('c', f0); const [saved, setSaved] = useState(false); async function f() { ${use} } return [f, saved]; }\n`;
    expect(uses(body('setSaved(await form.save({}));'))).toEqual([['save', 'read']]);
    expect(uses(body('await form.save({});'))).toEqual([['save', 'discarded']]);
    expect(uses(body('g(await form.save({}));'))).toEqual([['save', 'discarded']]);
    // ★ 1 つ目の要素 (値) を関数のように呼ぶ形は更新関数ではない
    expect(uses("export function A() { const form = useLatestForm('c', f0); const [show] = useState(() => g); async function f() { show(await form.save({})); } return f; }\n")).toEqual([['save', 'discarded']]);
  });

  it('props で渡った結果も数える (分割代入・名前のまま・引数そのもの)', () => {
    expect(uses("export function P({ form }: { form: LatestForm<A, B> }) { async function f() { await form.save({}); } return f; }\n")).toEqual([['save', 'discarded']]);
    expect(uses("interface Props { setup: LatestForm<A, B> }\nexport function P(props: Props) { async function f() { await props.setup.applyToLatest(() => null); } return f; }\n")).toEqual([['applyToLatest', 'discarded']]);
    expect(uses("export async function persist(form: LatestForm<A, B>) { return (await form.save({})) === true; }\n")).toEqual([['save', 'read']]);
    // 同じ名前でも結果の型でない欄は数えない
    expect(uses("export function P({ form }: { form: { save(d: unknown): Promise<boolean> } }) { async function f() { await form.save({}); } return f; }\n")).toEqual([]);
  });

  it('丸ごとの束縛を結果の型の props へ渡すのは漏れではない / それ以外の所へ渡すのは漏れ', () => {
    const page = "export function Page() { const form = useLatestForm('c', f0); return <Panel form={form} />; }\n";
    expect(uses(page, ['Panel.form'])).toEqual([]);
    expect(uses(page)).toEqual([['edit', 'escaped']]);
    expect(uses("export function Page() { const form = useLatestForm('c', f0); return <Panel other={form} />; }\n", ['Panel.form'])).toEqual([['edit', 'escaped']]);
  });

  it('結果の型の props を実物の木から集める (部品名.欄名)', () => {
    expect(resultTypedProps('x/P.tsx', "interface Props { setup: LatestForm<A, B>; n: number }\nfunction Outer(props: Props) { return null; }\nconst Inner = ({ setup }: Props) => null;\n")).toEqual(['Inner.setup', 'Outer.setup']);
    expect(resultTypedProps('x/P.tsx', "function Panel({ form }: { form: LatestForm<A, B> }) { return null; }\n")).toEqual(['Panel.form']);
    // 実物: 経営サマリーの 3 つの欄の部品 (しきい値・水耕栽培・提出者情報)
    const real = realKnownProps();
    for (const k of ['HighlightSettingsPanel.form', 'HydroponicsPanel.setup', 'HydroponicsPanelForm.setup', 'BankSubmissionPanel.form']) {
      expect(real.has(k), k).toBe(true);
    }
  });

  it('床: 実物の新しい口の呼び出しが見つかり、どれも読まれている', () => {
    const sites = realSites();
    const count = (m: EditMethod): number => sites.filter((s) => s.method === m && s.use === 'read').length;
    expect(count('addIfLatest'), 'addIfLatest').toBeGreaterThanOrEqual(3);
    expect(count('applyToLatest'), 'applyToLatest').toBeGreaterThanOrEqual(3);
    expect(count('save'), 'save').toBeGreaterThanOrEqual(4);
  });
});
