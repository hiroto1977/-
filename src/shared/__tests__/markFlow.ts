/**
 * 印 (関門を通った値の型) へ、関門を通らない値が流れ込む道を、TypeScript の型検査器で数える道具。
 *
 * ## なぜ要るか (2026-11-16 · MG-074 · 台帳の T-272 / T-273)
 *
 * 「危ない口は関門が作る印つきの型しか受けない」(T-220) は、`tsc` が素の `string` を断ることに
 * 頼っている。ところが `tsc` は次の形を**断らない** (実測 · TypeScript 5.9.3 · strict):
 *
 *   - 型の無い値 (`JSON.parse(…)`・その欄・`Array.isArray` の後の要素・それを返す関数) を、印の型の位置へ置く
 *   - 型引数を持つ関数・クラスの型引数が、呼び出しの文脈や明示で印に決まる (`open(f(s))` で `f<T>(): T`)
 *   - 印を欄に持つ型への型の言い換え (`x as Settings` —— 綴りに印の名前が出ない)・`x as never`
 *   - 本体の無い宣言 (多重定義・`declare`) と型の述語が印を名乗る
 *   - 型検査を黙らせる指示 (`@ts-expect-error` ほか) の下の行
 *   - 印を受ける関数を、印を受けない型の値として持ち出す (メソッドの引数は双変)・`.call` / `.apply` / `.bind` で呼ぶ
 *   - 印を入れた入れ物・印を欄に持つ物を、印の無い型の書き換えられる物として渡す
 *     (配列・Map・Set と欄は共変)・既に在るまま書き換える (`Object.assign`)・読みを横取りする (`new Proxy`)
 *
 * それまでの検査 (`vettedTypes.test.ts`) は綴り (`as Vetted…`) を数えていたので、どれも映らなかった。
 * ここでは型検査器に 1 つ 1 つの式の型と、その式が置かれた位置が求める型を訊く。
 *
 * ## 測れない物 (残る限界 —— `docs/REMAINING_WORK.md` の MG-074)
 *
 *   - 印を運ぶ引数を 1 つ渡したうえで、別の引数から値を作る型引数つきの関数 (`first([印], 生)`)。
 *     定義の側 (型の無い値を型引数の位置へ返す) は、Mamori の生成物についてだけ見る
 *   - 欄の型が `any` の物 (戻り値の型を書いていない class の getter) を、印の欄を持つ型として渡す形
 *   - 印を受ける関数を、欄に持つ物ごと型の無い位置へ渡してから呼ぶ形 (型の言い換えを経ない場合)
 *   - 型の上では区別できない写し (`印の配列.slice()` を `string[]` で受ける) は、違反として鳴る
 *     —— 受ける側を `readonly string[]` にする
 *
 * 検査ファイル (`__tests__` / `__audits__`) は数えない —— 対照のために型の守りを意図して外す。
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';

/** 見つけた 1 件。`rule` が違反の種類、`at` は `道:行:桁`。 */
export interface MarkFlowFinding {
  readonly rule: MarkFlowRule;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

/**
 * 違反の種類。`ok-` で始まる物は違反ではなく、走査が実物を見ていることの証拠 (床) として返す。
 */
export type MarkFlowRule =
  | 'any-to-mark'
  | 'generic-from-nothing'
  | 'cast-to-mark'
  | 'cast-to-never'
  | 'predicate-names-mark'
  | 'bodyless-names-mark'
  | 'dts-names-mark'
  | 'ts-directive'
  | 'any-to-type-param'
  | 'sink-widened'
  | 'container-widened'
  | 'ok-generic-arg-carries-mark'
  | 'ok-generic-lib-explicit'
  | 'ok-cast-from-mark';

export interface MarkFlowOptions {
  /** リポジトリの根 (絶対の道)。 */
  readonly root: string;
  /** これに入るファイルだけを数える (絶対の道)。省くと、根の下の検査でないファイル全部。 */
  readonly only?: readonly string[];
  /** Mamori の生成物として扱うか。省くと、隣に `.mamori` が在るか。 */
  readonly isGenerated?: (absPath: string) => boolean;
}

/** 検査ファイルか (数えない)。 */
export function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\/|(^|\/)__audits__\/|\.test\.tsx?$/.test(rel);
}

/**
 * tsconfig を読み、検査でないファイルと `extra` を根にしたプログラムを作る。
 * 検査ファイルを根から外すのは、型検査の費用を減らすため (検査は誰からも import されない)。
 */
export function loadMarkFlowProgram(root: string, tsconfig: string, extra: readonly string[] = []): ts.Program {
  const configPath = join(root, tsconfig);
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(`${tsconfig} を読めません: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    },
  });
  if (parsed === undefined) throw new Error(`${tsconfig} を読めません`);
  const rootNames = parsed.fileNames.filter((f) => !isTestPath(relative(root, f).split(sep).join('/')));
  return ts.createProgram({
    rootNames: [...rootNames, ...extra],
    options: { ...parsed.options, noEmit: true, composite: false, incremental: false, tsBuildInfoFile: undefined },
  });
}

/** 型を持たない式の種類 (リテラル・関数・JSX の要素)。`any` にならないので型を訊かない。 */
const NEVER_ANY: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ClassExpression,
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.JsxFragment,
  ts.SyntaxKind.OmittedExpression,
]);

const LOGICAL: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
]);

/** 式 `n` が、周りから型を求められる位置に在るか (代入の右・引数・返す値・欄の値 ほか)。 */
function inTypedPosition(n: ts.Node): boolean {
  const p = n.parent;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== n) return true;
  if (
    (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)
      || ts.isParameter(p) || ts.isBindingElement(p) || ts.isJsxAttribute(p))
    && p.initializer === n
  ) return true;
  if (ts.isConditionalExpression(p)) return p.condition !== n;
  if (ts.isBinaryExpression(p)) return p.right === n || LOGICAL.has(p.operatorToken.kind);
  return ts.isReturnStatement(p) || ts.isArrowFunction(p) || ts.isParenthesizedExpression(p)
    || ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p)
    || ts.isJsxExpression(p) || ts.isJsxSpreadAttribute(p) || ts.isYieldExpression(p)
    || ts.isSatisfiesExpression(p) || ts.isShorthandPropertyAssignment(p) || ts.isExportAssignment(p)
    || ts.isAwaitExpression(p) || ts.isNonNullExpression(p);
}

/** 型を訊かない識別子 (宣言される名前・欄の名前)。 */
function isNameOnly(n: ts.Node): boolean {
  if (!ts.isIdentifier(n)) return false;
  const p = n.parent;
  return (ts.isPropertyAssignment(p) && p.name === n) || (ts.isPropertyAccessExpression(p) && p.name === n)
    || ts.isJsxAttribute(p) || ts.isBindingElement(p) || (ts.isVariableDeclaration(p) && p.name === n)
    || ts.isParameter(p);
}

const PRIMITIVE = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.Void
  | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.BooleanLike | ts.TypeFlags.NumberLike
  | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.StringLike;

/** 入れ物を辿る深さ。印は入れ物の浅い所に在る (実測: 最深は欄 → 配列 → 印 の 2 段)。 */
const MAX_DEPTH = 4;

/**
 * プログラムを走査し、印へ流れ込む道を返す。
 */
export function scanMarkFlow(program: ts.Program, opts: MarkFlowOptions): MarkFlowFinding[] {
  const checker = program.getTypeChecker();
  const out: MarkFlowFinding[] = [];
  const generatedOf = opts.isGenerated ?? ((f: string) => existsSync(f.replace(/\.ts$/, '.mamori')));

  /** 印か —— 関門だけが作れる欄 (`unique symbol` の `VETTED`) を持つ型。 */
  const isMark = (t: ts.Type): boolean =>
    t.getProperties().some((s) => String(s.escapedName).startsWith('__@VETTED'));

  const markMemo = new Map<ts.Type, boolean>();
  /** 型のどこか (合併・入れ物の中身・関数の戻り値・欄) に印が在るか。 */
  const containsMark = (t: ts.Type): boolean => {
    const known = markMemo.get(t);
    if (known !== undefined) return known;
    const found = walkMark(t, 0, new Set());
    markMemo.set(t, found);
    return found;
  };
  const walkMark = (t: ts.Type, depth: number, seen: Set<ts.Type>): boolean => {
    if (depth > MAX_DEPTH || seen.has(t)) return false;
    seen.add(t);
    if (t.isUnion()) return t.types.some((x) => walkMark(x, depth + 1, seen));
    if ((t.flags & PRIMITIVE) !== 0) return false;
    if (isMark(t)) return true;
    if (t.isIntersection()) return t.types.some((x) => walkMark(x, depth + 1, seen));
    if ((t.flags & ts.TypeFlags.Object) === 0) return false;
    if (typeArgsOf(t).some((x) => walkMark(x, depth + 1, seen))) return true;
    if (t.getCallSignatures().some((sig) => walkMark(sig.getReturnType(), depth + 1, seen))) return true;
    const byString = t.getStringIndexType();
    if (byString !== undefined && walkMark(byString, depth + 1, seen)) return true;
    const byNumber = t.getNumberIndexType();
    if (byNumber !== undefined && walkMark(byNumber, depth + 1, seen)) return true;
    // 標準の宣言 (lib / node_modules) の型は欄を辿らない —— DOM の型は欄が数百あり、印を持たない。
    if (declaredInLibrary(t)) return false;
    return t.getProperties().some((p) => walkMark(checker.getTypeOfSymbol(p), depth + 1, seen));
  };
  /**
   * 標準の宣言の interface / class か。`Readonly<…>` / `Partial<…>` / `Pick<…>` のような写しの型
   * (mapped type) は宣言こそ標準の中に在るが、欄は元の型の物なので、ここでは標準に数えない
   * (数えると `x as Readonly<印を欄に持つ型>` が映らない)。
   */
  const declaredInLibrary = (t: ts.Type): boolean =>
    ((t as ts.ObjectType).objectFlags & ts.ObjectFlags.ClassOrInterface) !== 0
    && (t.getSymbol()?.declarations ?? []).some((d) => !inRepo(d.getSourceFile().fileName));
  const typeArgsOf = (t: ts.Type): readonly ts.Type[] =>
    (t.flags & ts.TypeFlags.Object) !== 0 && ((t as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
      ? checker.getTypeArguments(t as ts.TypeReference)
      : [];

  /** 型のどこかに型引数 (`T`) が在るか。 */
  const hasTypeParam = (t: ts.Type, depth = 0): boolean => {
    if (depth > MAX_DEPTH) return false;
    if ((t.flags & ts.TypeFlags.TypeParameter) !== 0) return true;
    if (t.isUnionOrIntersection()) return t.types.some((x) => hasTypeParam(x, depth + 1));
    return typeArgsOf(t).some((x) => hasTypeParam(x, depth + 1));
  };

  /** 型が `any` か、入れ物の中身に `any` を持つか (`any[]`・`Promise<any>`)。 */
  const anyMemo = new Map<ts.Type, boolean>();
  const anyish = (t: ts.Type): boolean => {
    const known = anyMemo.get(t);
    if (known !== undefined) return known;
    const found = walkAny(t, 0);
    anyMemo.set(t, found);
    return found;
  };
  const walkAny = (t: ts.Type, depth: number): boolean => {
    if (depth > MAX_DEPTH) return false;
    if ((t.flags & ts.TypeFlags.Any) !== 0) return true;
    if (t.isUnion()) return t.types.some((x) => walkAny(x, depth + 1));
    if (typeArgsOf(t).some((x) => walkAny(x, depth + 1))) return true;
    // 型の無い値を返す関数 (`JSON.parse` そのもの) も、印を返す関数の型の位置へ置ける。
    return t.getCallSignatures().some((sig) => walkAny(sig.getReturnType(), depth + 1));
  };

  /** `src` の `any` が、`dst` の `want` を満たす位置へ入るか。 */
  const anyInto = (src: ts.Type, dst: ts.Type, want: (t: ts.Type) => boolean, depth = 0): boolean => {
    if (depth > MAX_DEPTH) return false;
    if ((src.flags & ts.TypeFlags.Any) !== 0) return want(dst);
    if (dst.isUnion()) return dst.types.some((d) => anyInto(src, d, want, depth + 1));
    if (src.isUnion()) return src.types.some((s) => anyInto(s, dst, want, depth + 1));
    const a = typeArgsOf(src);
    const b = typeArgsOf(dst);
    if (a.length > 0 && a.length === b.length && a.some((x, i) => anyInto(x, b[i] as ts.Type, want, depth + 1))) return true;
    const returns = dst.getCallSignatures().map((sig) => sig.getReturnType());
    return src.getCallSignatures().some((sig) => returns.some((r) => anyInto(sig.getReturnType(), r, want, depth + 1)));
  };

  /** 印を受ける関数の型か (引数のどれかが印を含む)。返すのは、印を含む引数の位置。 */
  const paramMemo = new Map<ts.Type, readonly number[]>();
  const markParams = (t: ts.Type): readonly number[] => {
    const known = paramMemo.get(t);
    if (known !== undefined) return known;
    const found = computeMarkParams(t);
    paramMemo.set(t, found);
    return found;
  };
  const computeMarkParams = (t: ts.Type): number[] => {
    const hits: number[] = [];
    for (const sig of t.getCallSignatures()) {
      sig.getParameters().forEach((p, i) => {
        if (containsMark(checker.getTypeOfSymbol(p))) hits.push(i);
      });
    }
    return hits;
  };

  /** 印を受ける関数 `src` が、同じ位置で印を求めない型 `dst` として持ち出されるか。 */
  const sinkWidened = (src: ts.Type, dst: ts.Type): boolean => {
    const at = markParams(src);
    if (at.length === 0) return false;
    if ((dst.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return true;
    if (dst.isUnion()) return dst.types.some((d) => sinkWidened(src, d));
    const sigs = dst.getCallSignatures();
    if (sigs.length === 0) return dst.getSymbol()?.getName() === 'Function';
    return sigs.some((sig) => {
      const params = sig.getParameters();
      return at.some((i) => {
        const p = params[i];
        if (p === undefined) return false;
        // 引数が `never` の型も「印を求めない」に数える —— そこからもう 1 度言い換えれば何でも渡せる。
        return !containsMark(checker.getTypeOfSymbol(p));
      });
    });
  };
  /** 印を受ける関数を欄に持つ物か (`{ open }` や `import * as sinks`)。 */
  const holdsSink = (t: ts.Type): boolean =>
    (t.flags & ts.TypeFlags.Object) !== 0 && !declaredInLibrary(t)
    && t.getProperties().some((p) => markParams(checker.getTypeOfSymbol(p)).length > 0);

  /** 書き換えられる入れ物の名前 (共変なので、印の無い型として渡すと中へ生の値を書ける)。 */
  const MUTABLE = new Set(['Array', 'Map', 'Set', 'WeakMap', 'WeakSet']);
  /** 印を入れた入れ物 `src` が、同じ入れ物の、中身に印を求めない型 `dst` として渡されるか。 */
  const containerWidened = (src: ts.Type, dst: ts.Type): boolean => {
    // 印を 1 つも持たない物は、どこへ渡しても印の中身は書き換わらない (大半の式はここで終わる)。
    if (!containsMark(src)) return false;
    if (dst.isUnion()) return dst.types.some((d) => containerWidened(src, d));
    if (src.isUnion()) return src.types.some((s) => containerWidened(s, dst));
    const loose = (y: ts.Type): boolean => !containsMark(y) && (y.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) === 0;
    const a = typeArgsOf(src);
    const b = typeArgsOf(dst);
    const name = dst.getSymbol()?.getName();
    if (a.length > 0 && a.length === b.length && name !== undefined && MUTABLE.has(name)) {
      return a.some((x, i) => containsMark(x) && loose(b[i] as ts.Type));
    }
    // 欄の側: 印の欄を持つ物を、同じ名前の欄が印を求めない (書き換えられる) 型として渡す。
    if ((src.flags & ts.TypeFlags.Object) === 0 || (dst.flags & ts.TypeFlags.Object) === 0) return false;
    // 配列・組 (tuple)・Map などの入れ物は上で見た —— ここで欄を辿ると、`pop(): 印` のようなメソッドを欄として数えてしまう。
    if (a.length > 0 || b.length > 0 || declaredInLibrary(src) || declaredInLibrary(dst)) return false;
    const marked = src.getProperties().filter((p) => {
      const pt = checker.getTypeOfSymbol(p);
      return containsMark(pt) && pt.getCallSignatures().length === 0;
    });
    if (marked.length === 0) return false;
    const byString = dst.getStringIndexType();
    if (byString !== undefined && loose(byString) && !indexIsReadonly(dst)) return true;
    return marked.some((p) => {
      const q = dst.getProperty(p.getName());
      return q !== undefined && !isReadonlyProperty(q) && loose(checker.getTypeOfSymbol(q));
    });
  };
  const isReadonlyProperty = (p: ts.Symbol): boolean => {
    // 写しの型 (`Readonly<…>`) の欄は宣言に修飾子を持たないので、検査器の印 (CheckFlags.Readonly = 8) も見る。
    if ((((p as unknown as { links?: { checkFlags?: number } }).links?.checkFlags ?? 0) & 8) !== 0) return true;
    return (p.declarations ?? []).some((d) => (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Readonly) !== 0);
  };
  const indexIsReadonly = (t: ts.Type): boolean =>
    checker.getIndexInfosOfType(t).every((info) => info.isReadonly);
  /** 関数を借りて呼ぶメソッド (受け手と引数を、呼ぶ側が選び直す)。 */
  const BORROWED: ReadonlySet<string> = new Set(['call', 'apply', 'bind']);
  /** 既に在る物を書き換える標準の関数 (第 1 引数が書き換えられる)。 */
  const MUTATORS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ['Object', new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'])],
    ['Reflect', new Set(['set', 'defineProperty', 'setPrototypeOf'])],
  ]);
  const isMutatorCall = (n: ts.CallExpression): boolean => {
    const callee = n.expression;
    if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return false;
    return MUTATORS.get(callee.expression.text)?.has(callee.name.text) === true;
  };

  const mentionsAny = (node: ts.TypeNode | undefined, names: readonly string[]): boolean => {
    let hit = false;
    const visit = (n: ts.Node): void => {
      if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && names.includes(n.typeName.text)) hit = true;
      if (!hit) ts.forEachChild(n, visit);
    };
    if (node !== undefined) visit(node);
    return hit;
  };

  const inRepo = (fileName: string): boolean => {
    const rel = relative(opts.root, fileName).split(sep).join('/');
    return !rel.startsWith('..') && !rel.startsWith('node_modules/') && !rel.includes('/node_modules/');
  };
  const contextOf = (n: ts.Expression): ts.Type | undefined => {
    try {
      return checker.getContextualType(n);
    } catch {
      return undefined;
    }
  };

  for (const sf of program.getSourceFiles()) {
    if (!inRepo(sf.fileName)) continue;
    const rel = relative(opts.root, sf.fileName).split(sep).join('/');
    if (opts.only !== undefined ? !opts.only.includes(sf.fileName) : isTestPath(rel)) continue;
    const generated = generatedOf(sf.fileName);
    const push = (rule: MarkFlowRule, n: ts.Node): void => {
      const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      out.push({ rule, file: rel, line: line + 1, column: character + 1, text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 100) });
    };

    if (sf.isDeclarationFile) {
      // リポジトリの `.d.ts` が印を名乗ると、実体の無い宣言から印の値が生まれる。
      const visitDts = (n: ts.Node): void => {
        if (
          (ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isPropertySignature(n) || ts.isMethodSignature(n))
          && n.type !== undefined && containsMark(checker.getTypeFromTypeNode(n.type))
        ) push('dts-names-mark', n);
        ts.forEachChild(n, visitDts);
      };
      visitDts(sf);
      continue;
    }

    // 型検査を黙らせる指示。指示は注記の先頭に在るときだけ効く (TypeScript の読み方と同じ)。
    const directive = /(^|\n)[ \t]*(?:\/\/\/?|\/\*+)[ \t]*@ts-(?:ignore|expect-error|nocheck)\b/g;
    for (let m = directive.exec(sf.text); m !== null; m = directive.exec(sf.text)) {
      const pos = m.index + (m[1] as string).length;
      const { line, character } = sf.getLineAndCharacterOfPosition(pos);
      out.push({ rule: 'ts-directive', file: rel, line: line + 1, column: character + 1, text: m[0].trim() });
    }

    const visit = (n: ts.Node): void => {
      if (!generated) {
        if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && !ts.isConstTypeReference(n.type)) {
          if (containsMark(checker.getTypeFromTypeNode(n.type))) {
            push(containsMark(checker.getTypeAtLocation(n.expression)) ? 'ok-cast-from-mark' : 'cast-to-mark', n);
          }
        }
        if (ts.isTypePredicateNode(n) && n.type !== undefined && containsMark(checker.getTypeFromTypeNode(n.type))) {
          push('predicate-names-mark', n);
        }
        if (
          (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.body === undefined
          && n.type !== undefined && containsMark(checker.getTypeFromTypeNode(n.type))
        ) push('bodyless-names-mark', n);
        if (ts.isVariableDeclaration(n) && (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Ambient) !== 0
          && n.type !== undefined && containsMark(checker.getTypeFromTypeNode(n.type))) push('bodyless-names-mark', n);
      }

      // 欄の値は下で 1 つずつ見る。ここで見るのは、値を式で持たない欄 (getter・メソッド) が型の無い値を返す形。
      // データの表 (何十万個の `{ … }`) に位置の型を訊かないよう、その欄を持つ物だけを見る。
      if (
        ts.isObjectLiteralExpression(n) && inTypedPosition(n)
        && n.properties.some((m) => ts.isGetAccessorDeclaration(m) || ts.isMethodDeclaration(m))
      ) {
        const ctx = contextOf(n);
        if (ctx !== undefined && containsMark(ctx)) {
          for (const member of n.properties) {
            if (!ts.isGetAccessorDeclaration(member) && !ts.isMethodDeclaration(member)) continue;
            const sym = checker.getSymbolAtLocation(member.name);
            const want = sym === undefined ? undefined : ctx.getProperty(sym.getName());
            if (sym === undefined || want === undefined) continue;
            const given = checker.getTypeOfSymbolAtLocation(sym, member);
            if (anyish(given) && anyInto(given, checker.getTypeOfSymbol(want), containsMark)) push('any-to-mark', member);
          }
        }
      }
      if (ts.isExpression(n) && !NEVER_ANY.has(n.kind) && !isNameOnly(n)) {
        if (inTypedPosition(n)) {
          const t = checker.getTypeAtLocation(n);
          // 位置が求める型を訊くのは高い (走査の時間の半分だった) ので、式の型で先にふるう。
          if (anyish(t)) {
            const ctx = contextOf(n);
            if (ctx !== undefined) {
              if (anyInto(t, ctx, containsMark)) push('any-to-mark', n);
              else if (generated && anyInto(t, ctx, hasTypeParam)) push('any-to-type-param', n);
            }
          } else if (markParams(t).length > 0 || containsMark(t)) {
            const ctx = contextOf(n);
            if (ctx !== undefined) {
              if (sinkWidened(t, ctx)) push('sink-widened', n);
              // `{ ...物 }` / `[...配列]` は写しなので、元の物は書き換わらない。
              else if (!ts.isSpreadAssignment(n.parent) && !ts.isSpreadElement(n.parent) && containerWidened(t, ctx)) push('container-widened', n);
            }
          }
        }
        if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && !generated && !ts.isConstTypeReference(n.type)) {
          const from = checker.getTypeAtLocation(n.expression);
          const to = checker.getTypeFromTypeNode(n.type);
          // `x as never` はどの型の位置にも置ける (`never` は全ての型の部分型)。
          if ((to.flags & ts.TypeFlags.Never) !== 0) push('cast-to-never', n);
          // 印を受ける関数を、型の言い換えで印を受けない型にする (`open as (u: string) => void`)。
          if (sinkWidened(from, to)) push('sink-widened', n);
          else if ((to.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 && holdsSink(from)) push('sink-widened', n);
          else if (containerWidened(from, to)) push('container-widened', n);
        }
        if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
          const sig = checker.getResolvedSignature(n);
          if (sig !== undefined) {
            const params = sig.getParameters();
            (n.arguments ?? []).forEach((arg, i) => {
              const p = params[Math.min(i, params.length - 1)];
              if (p === undefined) return;
              let want = checker.getTypeOfSymbolAtLocation(p, n);
              const decl = p.valueDeclaration;
              if (i >= params.length - 1 && decl !== undefined && ts.isParameter(decl) && decl.dotDotDotToken !== undefined) {
                want = want.getNumberIndexType() ?? want;
              }
              const given = checker.getTypeAtLocation(arg);
              if (!anyish(given)) return;
              if (anyInto(given, want, containsMark)) push('any-to-mark', arg);
              else if (generated && anyInto(given, want, hasTypeParam)) push('any-to-type-param', arg);
            });
            if (
              ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && BORROWED.has(n.expression.name.text)
              && markParams(checker.getTypeAtLocation(n.expression.expression)).length > 0
            ) {
              // 印を受ける関数を `.call` / `.apply` / `.bind` で呼ぶと、引数の型が呼ぶ側の値から決まり直す
              // (`sink.call(undefined, 型の無い値)` は、引数の並びが `[any]` に推論されて通る)。
              push('sink-widened', n);
            }
            const target = n.arguments?.[0];
            if (target !== undefined && containsMark(checker.getTypeAtLocation(target))) {
              // 印を持つ物を、既に在るまま書き換える (`Object.assign(印を欄に持つ物, …)`)・読みを横取りする (`new Proxy(…)`)。
              if (ts.isCallExpression(n) ? isMutatorCall(n) : ts.isIdentifier(n.expression) && n.expression.text === 'Proxy') {
                push('container-widened', n);
              }
            }
            if (ts.isNewExpression(n)) {
              // 型引数つきのクラスを、印を型引数にして作る (`new Holder<印>()`) —— 中身を作るのはクラスの中の言い換え。
              const made = checker.getTypeAtLocation(n);
              const cls = made.getSymbol()?.declarations?.find(ts.isClassLike);
              if (
                cls !== undefined && inRepo(cls.getSourceFile().fileName) && typeArgsOf(made).some(containsMark)
                && !(n.arguments ?? []).some((a) => containsMark(checker.getTypeAtLocation(a)))
              ) push('generic-from-nothing', n);
            }
            const decl = sig.declaration;
            if (
              ts.isCallExpression(n) && !isMutatorCall(n) && decl !== undefined && !ts.isJSDocSignature(decl)
              && decl.typeParameters !== undefined && decl.typeParameters.length > 0
              && mentionsAny(decl.type, decl.typeParameters.map((p) => p.name.text))
            ) {
              const own = checker.getTypeAtLocation(n);
              let instantiated = containsMark(own);
              if (!instantiated && (own.flags & (ts.TypeFlags.Never | ts.TypeFlags.Any)) !== 0) {
                // 型引数が `never` に推論された呼び出しは、どの位置にも置ける (`first([], 生)`)。
                const ctx = contextOf(n);
                instantiated = ctx !== undefined && containsMark(ctx);
              }
              if (instantiated) {
                const argCarries = n.arguments.some((a) => containsMark(checker.getTypeAtLocation(a)));
                const fromLibrary = !inRepo(decl.getSourceFile().fileName);
                if (argCarries) push('ok-generic-arg-carries-mark', n);
                else if (fromLibrary && n.typeArguments !== undefined) push('ok-generic-lib-explicit', n);
                else push('generic-from-nothing', n);
              }
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  // 同じ式を 2 つの道 (位置の型・引数の型) で見つけることがあるので、位置で 1 件に畳む。
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.line}|${f.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 検査が置かれた場所からリポジトリの根を返す (このファイルは `src/shared/__tests__/` に在る)。 */
export function repoRootFrom(testDir: string): string {
  return dirname(dirname(dirname(testDir)));
}
