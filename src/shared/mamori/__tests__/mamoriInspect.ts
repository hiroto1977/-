import ts from 'typescript';

/** Mamori の生成物 (TypeScript) を別の構文解析器で読み直す物差し。攻撃の電池 (mamoriBattery.test.ts) と Rust 検算役の突き合わせ (rustVerifier.test.ts) が共有する。 */

// ───────────────────────────── 判定 (oracle) ─────────────────────────────

/** 宣言なしで使ってよい組み込みと、そのメンバ (Mamori の規則とは独立に、ここで書き直した許可) 。 */
const ALLOWED_BUILTINS = new Set([
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Map', 'Set', 'Error', 'TypeError', 'RangeError',
  'RegExp', 'URL', 'undefined', 'NaN', 'Infinity',
]);
/** 値として渡せない組み込み (メンバを直に使う・呼ぶ・構築する形だけ)。Object / RegExp / Error / URL は別の表で見る。 */
const PLAIN_BUILTIN_NAMES = new Set(['Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Map', 'Set']);
const OBJECT_MEMBERS = new Set(['hasOwn', 'keys', 'values', 'entries', 'fromEntries', 'freeze', 'isFrozen']);
/** どこに現れても成らないメンバ名。 */
const BANNED_MEMBERS = new Set([
  // 値から原型・コンストラクタ・getter の定義へ届く名前 (どの値の上でも成らない)。Object / RegExp / Error / URL の静的メンバは基準の名前で別に見る。
  'constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
]);
const REGEXP_STATICS = /^(\$[1-9_&`'+]?|lastMatch|lastParen|leftContext|rightContext|input)$/;

export interface Finding {
  readonly reason: string;
  /** `hole` = 検めを受けないコードが生成物に在る。`lenient` = 生成物が TypeScript として読めない (tsc/typecheck が止める = 閉じた側に落ちる)。 */
  readonly kind: 'hole' | 'lenient';
}

/** 受け入れた生成物 1 つを、TypeScript の構文解析器で読み直して穴を探す。 */
export function inspectEmitted(file: string, text: string, externGlobals: ReadonlySet<string> = new Set()): Finding[] {
  const found: Finding[] = [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diag = (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  for (const d of diag) found.push({ kind: 'lenient', reason: `生成物に構文の誤りがある: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}` });

  // 構文の誤りが在る生成物は TypeScript が受けない (tsc / typecheck が止める = 閉じた側)。誤りからの復元で出る偽の名前を数えないよう、ここで返す。
  if (found.length > 0) return found;

  // 宣言した名前 (束縛・型・import) を全部集める
  const declared = new Set<string>();
  const collect = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) declared.add(n.name.text);
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) declared.add(n.name.text);
    if (ts.isImportSpecifier(n)) declared.add(n.name.text);
    if (ts.isImportClause(n) && n.name) declared.add(n.name.text);
    if (ts.isNamespaceImport(n)) declared.add(n.name.text);
    if (ts.isTypeParameterDeclaration(n)) declared.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const inType = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
      if (ts.isStatement(p) || ts.isExpression(p) && !ts.isTypeNode(p)) return false;
    }
    return false;
  };

  const walk = (n: ts.Node): void => {
    if (ts.isElementAccessExpression(n)) {
      // 0.8 の添字: 許すのは (1) 数リテラル (2) `.name` に書けない文字列 (3) `+(…)` で数に寄せた鍵 だけ。
      // 識別子として読める文字列の鍵は `.name` に畳まれて出るはずなので、添字として残っていたら穴 (禁じた名前でなくても) 。
      const a = n.argumentExpression;
      const ok = ts.isNumericLiteral(a) ||
        (ts.isStringLiteral(a) && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(a.text)) ||
        (ts.isPrefixUnaryExpression(a) && a.operator === ts.SyntaxKind.PlusToken);
      if (!ok) found.push({ kind: 'hole', reason: `添字 x[k] の鍵が許した形でない: ${a.getText(sf)}` });
    }
    if (ts.isTemplateExpression(n) || ts.isTaggedTemplateExpression(n)) found.push({ kind: 'hole', reason: 'テンプレート文字列がある' });
    if (ts.isAsExpression(n) && ts.isTypeReferenceNode(n.type) && ts.isIdentifier(n.type.typeName) && declared.has(n.type.typeName.text)) {
      // gate の `mint` が出す `as <印の型>` だけは許す (宣言した/取り込んだ名前への型付けで、印の型は gate の外では作れない)
    } else if (ts.isAsExpression(n) && ts.isTypeLiteralNode(n.type) && n.type.members.every((m) => ts.isPropertySignature(m) && m.questionToken !== undefined && m.type?.kind === ts.SyntaxKind.UnknownKeyword)) {
      // 0.2 の `field` (unknown の値の欄を読む) が出す `(raw as { x?: unknown }).x` だけは許す (欄は unknown のまま・書き換えない)
    } else if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) found.push({ kind: 'hole', reason: '型の書き換え (as / <T>) がある' });
    if (ts.isNonNullExpression(n)) found.push({ kind: 'hole', reason: '後置の ! がある' });
    if (ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) found.push({ kind: 'hole', reason: '展開がある' });
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) found.push({ kind: 'hole', reason: '動的 import がある' });
    if (ts.isMetaProperty(n)) found.push({ kind: 'hole', reason: 'メタプロパティがある' });
    if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) found.push({ kind: 'hole', reason: 'クラスがある' });
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'Function' || n.expression.text === 'AsyncFunction')) found.push({ kind: 'hole', reason: 'new Function がある' });
    if (ts.isComputedPropertyName(n) && !inType(n)) found.push({ kind: 'hole', reason: '計算した鍵がある' });
    if ((ts.isGetAccessor(n) || ts.isSetAccessor(n)) && !inType(n)) found.push({ kind: 'hole', reason: 'アクセサがある' });
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (BANNED_MEMBERS.has(name)) found.push({ kind: 'hole', reason: `禁じたメンバ .${name}` });
      if (ts.isIdentifier(n.expression)) {
        const base = n.expression.text;
        if (!declared.has(base)) {
          if (base === 'Object' && !OBJECT_MEMBERS.has(name)) found.push({ kind: 'hole', reason: `Object.${name} は許したメンバではない` });
          if (base === 'RegExp') found.push({ kind: 'hole', reason: `RegExp.${name} (共有の状態)` });
          if (REGEXP_STATICS.test(name) && base === 'RegExp') found.push({ kind: 'hole', reason: `RegExp.${name}` });
          if ((base === 'Error' || base === 'TypeError' || base === 'RangeError')) found.push({ kind: 'hole', reason: `${base}.${name} (共有の状態)` });
          if (base === 'URL' && name !== 'canParse' && name !== 'parse') found.push({ kind: 'hole', reason: `URL.${name}` });
        }
      }
    }
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && BANNED_MEMBERS.has(n.name.text)) {
      found.push({ kind: 'hole', reason: `オブジェクトの鍵が禁じた名前 ${n.name.text}` });
    }
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) ||
        (ts.isPropertySignature(parent) && parent.name === n) || (ts.isImportSpecifier(parent) && parent.propertyName === n);
      const isBindingName = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent) || ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isTypeParameterDeclaration(parent)) &&
        (parent as { name?: ts.Node }).name === n;
      // 組み込みの構築子・名前空間を**値として**渡す形 (Object.freeze(Array) でアプリ全体の組み込みを凍らせる · T-243)。
      // 許すのは メンバを直に使う (Math.floor)・呼ぶ (String(x))・構築する (new Map()) 形だけ。
      const isValueUse = PLAIN_BUILTIN_NAMES.has(n.text) && !declared.has(n.text) && !isMemberName && !isBindingName && !inType(n) &&
        !(ts.isPropertyAccessExpression(parent) && parent.expression === n) && !((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === n);
      if (isValueUse) found.push({ kind: 'hole', reason: `組み込みの ${n.text} を値として持ち出している (T-243)` });
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n.text)) found.push({ kind: 'hole', reason: `ASCII でない名前 ${JSON.stringify(n.text)}` });
      else if (!isMemberName && !isBindingName && !inType(n) && !declared.has(n.text) && !externGlobals.has(n.text) && !ALLOWED_BUILTINS.has(n.text)) {
        found.push({ kind: 'hole', reason: `宣言していない名前 ${n.text}` });
      }
    }
    ts.forEachChild(n, walk);
  };
  // import の from 句の文字列と、型の中は式ではないので、式の位置だけを歩く目的で全体を歩き、型は inType が除く
  walk(sf);

  // 印: 危ない口 (openUrl) へ渡す値は、型が印そのもの (または印 + null / undefined) と宣言された名前だけ
  const typeOf = (name: string, from: ts.Node): string | null => {
    for (let p: ts.Node | undefined = from; p; p = p.parent) {
      let found: string | null | undefined;
      ts.forEachChild(p, (c) => {
        if (found !== undefined) return;
        if (ts.isParameter(c) && ts.isIdentifier(c.name) && c.name.text === name) found = c.type?.getText(sf) ?? null;
        if (ts.isVariableStatement(c)) {
          for (const d of c.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) found = d.type?.getText(sf) ?? null;
        }
      });
      if (found !== undefined) return found;
      if (ts.isFunctionLike(p)) {
        for (const prm of (p as ts.SignatureDeclaration).parameters) if (ts.isIdentifier(prm.name) && prm.name.text === name) return prm.type?.getText(sf) ?? null;
      }
    }
    return null;
  };
  const aliasText = new Map<string, string>();
  sf.forEachChild((c) => {
    if (ts.isTypeAliasDeclaration(c)) aliasText.set(c.name.text, c.type.getText(sf));
  });
  const markOnly = (t: string): boolean => {
    const parts = t.split('|').map((x) => x.trim());
    const marks = [...new Set(parts.filter((x) => x !== 'null' && x !== 'undefined'))];
    if (marks.length !== 1) return false;
    const m = marks[0]!;
    if (aliasText.has(m)) return /^Vetted</.test(aliasText.get(m)!);
    return false;
  };
  const sinkCalls = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'openUrl') {
      const a = n.arguments[0];
      if (a === undefined || !ts.isIdentifier(a)) found.push({ kind: 'hole', reason: 'openUrl へ名前でない値を渡している' });
      else {
        const t = typeOf(a.text, n);
        if (t === null || !markOnly(t)) found.push({ kind: 'hole', reason: `openUrl へ印の型でない値 (${a.text}: ${t ?? '型なし'}) を渡している` });
      }
    }
    ts.forEachChild(n, sinkCalls);
  };
  sinkCalls(sf);

  // 字句の層: 識別子・キーワード以外の位置に、制御・bidi・不可視の字が裸で現れていないこと
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text);
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t === ts.SyntaxKind.Identifier) continue;
    const tokenText = scanner.getTokenText();
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/.test(tokenText)) {
      found.push({ kind: 'hole', reason: `字句 ${ts.SyntaxKind[t]} (文字列・注記・空白を含む) に不可視・bidi・制御の字が裸である` });
    }
  }
  // 行終端: 注記 (//) の中に、TypeScript が行終端と見る字が残っていないこと = 注記のあとの字が同じ行に在る形
  const lines = text.split(/\r\n|[\n\r\u2028\u2029]/);
  for (const l of lines) {
    const ci = l.indexOf('//');
    if (ci >= 0 && /[\u202A-\u202E\u2066-\u2069]/.test(l.slice(ci))) found.push({ kind: 'hole', reason: '注記の中に bidi の制御がある' });
  }
  return found;
}

