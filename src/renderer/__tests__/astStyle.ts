/**
 * **画面のソースの style を構文木で読む共有の道具** (2026-10-03 · パス 504 —— パス 503 の `fillInkCensus.test.ts` から出した)。
 *
 * 2 つの census が読む (検査ファイルから別の検査ファイルを import すると中の `describe` がもう一度走るので、道具だけをここへ出した):
 *
 *   - `fillInkCensus.test.ts` —— 塗りの上の字は、その塗りの字のトークンを使う (パス 503)
 *   - `controlsCensus.test.ts` —— 入力欄の枠・焦点の輪・キーボードで押せるか (パス 504)
 *
 * 読むのは**字面だけ**: 式で決まる値 (`background: c.color`) は読めないので、読めないと言う (`unresolved` に残す)。
 * 黙って通すことも、黙って落とすこともしない。
 */
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import ts from 'typescript';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

export const REPO = join(__dirname, '..', '..', '..');

export function parseSource(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** 画面を描くソース (`pages/` `components/` `App.tsx` `security/`)。原文の道具で読む (変異検査の sandbox でも本物の綴り)。 */
export function uiSources(): { file: string; text: string }[] {
  return globSync(
    ['src/renderer/pages/*.tsx', 'src/renderer/components/*.tsx', 'src/renderer/components/*.ts', 'src/renderer/App.tsx', 'src/renderer/security/*.tsx'],
    { cwd: REPO, absolute: true, ignore: ['**/__tests__/**'] },
  ).map((abs) => ({ file: relative(REPO, abs).split('\\').join('/'), text: readOriginalSource(abs) }));
}

export function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(p)) return null;
  const n = p.name;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  return null;
}

/** 文字列の中の `var(--名前` の名前。 */
export function tokensIn(strings: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of strings) for (const m of s.matchAll(/var\((--[\w-]+)/g)) out.push(m[1]!);
  return out;
}

/** `as` / 括弧 / `!` / `satisfies` を外した中身。 */
export function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
  return cur;
}

/**
 * 式が取りうる**字面の文字列**。条件・`||` / `??` / `&&` は両辺、括弧・`as`・`!` は中身。式で決まる物は読まない。
 * テンプレートは**文字列の部分だけ** (`${…}` の中は読まない —— 塗りと字の対には要らない・中を読むなら `resolveStrings`)。
 */
export function stringsOf(e: ts.Expression | undefined): string[] {
  if (e === undefined) return [];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)];
  if (ts.isConditionalExpression(e)) return [...stringsOf(e.whenTrue), ...stringsOf(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.AmpersandAmpersandToken) {
      return [...stringsOf(e.left), ...stringsOf(e.right)];
    }
    return [];
  }
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return stringsOf(e.expression);
  return [];
}

/** ファイルの中の `const 名前 = 式` (どの深さでも) の式。同じ名前が複数あれば全部 (読む側が全部を取りうる値として扱う)。 */
export type ConstEnv = Map<string, ts.Expression[]>;

export function constEnv(sf: ts.SourceFile): ConstEnv {
  const m: ConstEnv = new Map();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      const list = m.get(n.name.text) ?? [];
      list.push(n.initializer);
      m.set(n.name.text, list);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return m;
}

export interface Resolved {
  /** 取りうる字面の文字列 (テンプレートの `${…}` の中も読む)。 */
  readonly strings: string[];
  /** 読めなかった式の字面 (props・呼び出し・メンバー参照)。空なら全部読めた。 */
  readonly unresolved: string[];
}

/** 値を返す関数のうち、**最後の引数**が既定の値で、返す値の残りは別の所が台帳に載せている物。 */
export type PassthroughCalls = ReadonlySet<string>;

/**
 * 式の取りうる字面を、`const` の識別子をたどり、テンプレートの `${…}` の中まで読んで集める。
 * `undefined` / `null` は何も足さない。読めない式は `unresolved` に残す (黙って捨てない)。
 */
export function resolveStrings(e: ts.Expression | undefined, env: ConstEnv, passthrough: PassthroughCalls = new Set(), depth = 0): Resolved {
  const out: Resolved = { strings: [], unresolved: [] };
  const add = (r: Resolved): void => {
    out.strings.push(...r.strings);
    out.unresolved.push(...r.unresolved);
  };
  if (e === undefined || depth > 8) return out;
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) out.strings.push(x.text);
  else if (ts.isNumericLiteral(x)) out.strings.push(x.text);
  else if (ts.isTemplateExpression(x)) {
    out.strings.push(x.head.text);
    for (const s of x.templateSpans) {
      add(resolveStrings(s.expression, env, passthrough, depth + 1));
      out.strings.push(s.literal.text);
    }
  } else if (ts.isConditionalExpression(x)) {
    add(resolveStrings(x.whenTrue, env, passthrough, depth + 1));
    add(resolveStrings(x.whenFalse, env, passthrough, depth + 1));
  } else if (ts.isBinaryExpression(x)) {
    const k = x.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      add(resolveStrings(x.left, env, passthrough, depth + 1));
      add(resolveStrings(x.right, env, passthrough, depth + 1));
    } else if (k === ts.SyntaxKind.AmpersandAmpersandToken) {
      add(resolveStrings(x.right, env, passthrough, depth + 1));
    } else out.unresolved.push(x.getText());
  } else if (ts.isIdentifier(x)) {
    if (x.text === 'undefined') return out;
    const inits = env.get(x.text);
    if (inits === undefined) out.unresolved.push(x.text);
    else for (const i of inits) add(resolveStrings(i, env, passthrough, depth + 1));
  } else if (x.kind === ts.SyntaxKind.NullKeyword) {
    return out;
  } else if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && passthrough.has(x.expression.text) && x.arguments.length > 0) {
    // 最後の引数 (既定の値) だけを読む。残りの値は呼ぶ関数の側が持ち、台帳に載せる (`fieldBorder` の `LEVEL_COLOR`)。
    add(resolveStrings(x.arguments[x.arguments.length - 1], env, passthrough, depth + 1));
  } else out.unresolved.push(x.getText().slice(0, 60));
  return out;
}

export interface ObjectsOf {
  readonly objects: ts.ObjectLiteralExpression[];
  /** 読めなかった式の字面。 */
  readonly unresolved: string[];
}

/** `style={…}` の式を、取りうる**オブジェクトリテラル**へ解く (識別子は `const` をたどる・条件は両枝)。 */
export function objectsOf(e: ts.Expression | undefined, env: ConstEnv, depth = 0): ObjectsOf {
  const out: ObjectsOf = { objects: [], unresolved: [] };
  const add = (r: ObjectsOf): void => {
    out.objects.push(...r.objects);
    out.unresolved.push(...r.unresolved);
  };
  if (e === undefined || depth > 8) return out;
  const x = unwrap(e);
  if (ts.isObjectLiteralExpression(x)) out.objects.push(x);
  else if (ts.isConditionalExpression(x)) {
    add(objectsOf(x.whenTrue, env, depth + 1));
    add(objectsOf(x.whenFalse, env, depth + 1));
  } else if (ts.isBinaryExpression(x)) {
    const k = x.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      add(objectsOf(x.left, env, depth + 1));
      add(objectsOf(x.right, env, depth + 1));
    } else if (k === ts.SyntaxKind.AmpersandAmpersandToken) add(objectsOf(x.right, env, depth + 1));
    else out.unresolved.push(x.getText().slice(0, 60));
  } else if (ts.isIdentifier(x)) {
    if (x.text === 'undefined') return out;
    const inits = env.get(x.text);
    if (inits === undefined) out.unresolved.push(x.text);
    else for (const i of inits) add(objectsOf(i, env, depth + 1));
  } else if (x.kind === ts.SyntaxKind.NullKeyword) return out;
  else out.unresolved.push(x.getText().slice(0, 60));
  return out;
}
