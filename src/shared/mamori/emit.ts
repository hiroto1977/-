/**
 * Mamori → TypeScript の変換 (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 変換は**決定的** (同じ入力は同じ byte) で、生成物は commit する —— 既存の門 (`tsc` / eslint /
 * 変異検査 / 整合性チェーン / census) は今までどおり生成した `.ts` に掛かる。生成物が `.mamori` から
 * 組み直した物と 1 byte でも違えば `mamoriGenerated.test.ts` が落ちる (手で直した生成物を見逃さない)。
 *
 * 型の書き換え (`as`) を出すのは `mint` だけで、それは検査器が gate 関数の中にしか置かせない。
 */
import type { Expr, Item, Member, Module, Param, Prop, Stmt } from './ast';

const IND = '  ';

/** 2 項演算子の強さ (大きいほど強い)。 */
const PREC: Readonly<Record<string, number>> = {
  '??': 1, '||': 2, '&&': 3, '===': 4, '!==': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7,
};

function prec(e: Expr): number {
  switch (e.kind) {
    case 'arrow':
    case 'arrow-block':
      return 0;
    // `c ? a : b` は ?? より弱く arrow より強い (TypeScript の条件演算子)。
    case 'cond':
      return 0.5;
    case 'mint':
      return 5; // `x as T` は TypeScript で関係演算子と同じ強さ
    case 'binary':
      return PREC[e.op]!;
    case 'unary':
      return 8;
    // 名前・字面・呼び出し・メンバ・new・配列はいちばん強い (9)。比べる側の強さは 1〜9 なので「より弱い」には
    // 決してならず、枝を空にして undefined を返しても比べ (undefined < n) は同じく false になる (等価)。
    // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (9 と undefined はどちらも括弧を要さない)
    default:
      return 9;
  }
}

/**
 * `??` と `||` / `&&` を括弧なしで混ぜると TypeScript が断るので、混ざる所は必ず括る。
 *
 * 括弧が強さの比べだけでは付かないのは「`??` の子に `||` / `&&`」の向きだけである —— 逆の向き
 * (`||` / `&&` の子に `??`) は `??` がいちばん弱いので強さの比べで必ず括られる (変異検査が教えた:
 * 以前の版はその向きも判定しており、その枝はどの入力でも答えを変えなかった)。
 */
function mixesNullish(parent: string, child: Expr): boolean {
  // 単項の子の op は `!` / `-` / `typeof` / `await` で `||` / `&&` にならないので、種類の判定を外しても等価。
  // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (単項の op は || / && にならない)
  return parent === '??' && child.kind === 'binary' && (child.op === '||' || child.op === '&&');
}

export function expr(e: Expr): string {
  switch (e.kind) {
    case 'ident':
      return e.name;
    case 'string':
    case 'number':
    case 'regex':
      return e.raw;
    case 'literal':
      return e.value;
    case 'array':
      return `[${e.items.map(expr).join(', ')}]`;
    case 'member':
      return `${wrap(e.object, 9)}${e.optional ? '?.' : '.'}${e.prop}`;
    case 'index':
      // 数リテラルと識別子にならない文字列はそのまま。それ以外の鍵は数に寄せる (`+`) —— 型の宣言が嘘でも、文字列の鍵
      // (`"constructor"`) は NaN になって表に届かない (検査器が静的に数と分かる式だけを通した上の、実行時の二重の守り)。
      return `${wrap(e.object, 9)}[${e.key.kind === 'number' || e.key.kind === 'string' ? expr(e.key) : `+(${expr(e.key)})`}]`;
    case 'call':
      return `${wrap(e.callee, 9)}(${e.args.map(expr).join(', ')})`;
    case 'new':
      return `new ${expr(e.callee)}(${e.args.map(expr).join(', ')})`;
    case 'unary':
      return e.op === '!' || e.op === '-' ? `${e.op}${wrap(e.operand, 8)}` : `${e.op} ${wrap(e.operand, 8)}`;
    case 'binary': {
      const p = PREC[e.op]!;
      const l = prec(e.left) < p || mixesNullish(e.op, e.left) ? `(${expr(e.left)})` : expr(e.left);
      const r = prec(e.right) <= p || mixesNullish(e.op, e.right) ? `(${expr(e.right)})` : expr(e.right);
      return `${l} ${e.op} ${r}`;
    }
    case 'arrow':
      // 本体がオブジェクトの字面なら括る (括らないと TypeScript は `{` を関数の本体と読む)。
      return `(${e.params.map(param).join(', ')}) => ${e.body.kind === 'object' ? `(${expr(e.body)})` : wrap(e.body, 1)}`;
    case 'arrow-block':
      // 式の中なので深さは分からない: 本体は 1 段下げ、閉じ括弧は行頭 (体裁だけの差で、tsc は気にしない)。
      return `(${e.params.map(param).join(', ')}) => {\n${block(e.body, 1).join('\n')}\n}`;
    case 'mint':
      return `${wrap(e.value, 6)} as ${e.vetted}`;
    case 'object':
      return e.props.length === 0 ? '{}' : `{ ${e.props.map(prop).join(', ')} }`;
    case 'cond':
      return `${wrap(e.test, 1)} ? ${wrap(e.then, 0.5)} : ${wrap(e.otherwise, 0.5)}`;
    case 'field':
      // 型を**広げる**向きの書き換えだけ (読んだ値は必ず unknown)。印へは書き換えない。
      return `(${wrap(e.object, 9)} as { ${e.prop}?: unknown }).${e.prop}`;
  }
}

function prop(p: Prop): string {
  if (p.shorthand) return p.key;
  return `${p.quoted ? quote(p.key) : p.key}: ${expr(p.value)}`;
}

function wrap(e: Expr, min: number): string {
  return prec(e) < min ? `(${expr(e)})` : expr(e);
}

function param(p: Param): string {
  return `${p.name}${p.type === null ? '' : `: ${p.type.text}`}${p.init === null ? '' : ` = ${expr(p.init)}`}`;
}

function comments(lines: readonly string[], ind: string): string[] {
  return lines.map((l) => (l === '' ? `${ind}//` : `${ind}// ${l}`));
}

function block(stmts: readonly Stmt[], depth: number): string[] {
  return stmts.flatMap((s) => stmt(s, depth));
}

function stmt(s: Stmt, depth: number): string[] {
  const ind = IND.repeat(depth);
  const head = comments(s.comments, ind);
  switch (s.kind) {
    case 'let':
      return [...head, `${ind}${s.mutable ? 'let' : 'const'} ${s.name}${s.type === null ? '' : `: ${s.type.text}`}${s.init === null ? '' : ` = ${expr(s.init)}`};`];
    case 'assign':
      return [...head, `${ind}${s.target} = ${expr(s.value)};`];
    case 'return':
      return [...head, `${ind}return${s.value === null ? '' : ` ${expr(s.value)}`};`];
    case 'expr':
      return [...head, `${ind}${expr(s.expr)};`];
    case 'comment':
      return head;
    case 'throw':
      return [...head, `${ind}throw ${expr(s.value)};`];
    case 'jump':
      return [...head, `${ind}${s.word};`];
    case 'for':
      return [...head, `${ind}for (const ${s.name} of ${expr(s.iterable)}) {`, ...block(s.body, depth + 1), `${ind}}`];
    case 'switch': {
      const inner = IND.repeat(depth + 1);
      const cases = s.cases.flatMap((c) => [
        ...comments(c.comments, inner),
        ...c.tests.map((t) => (t === null ? `${inner}default:` : `${inner}case ${expr(t)}:`)),
        ...block(c.body, depth + 2),
      ]);
      return [...head, `${ind}switch (${expr(s.test)}) {`, ...cases, `${ind}}`];
    }
    case 'try':
      return [...head, `${ind}try {`, ...block(s.body, depth + 1), `${ind}} catch {`, ...block(s.handler, depth + 1), `${ind}}`];
    case 'if': {
      // 本体が return 1 つで注記が無ければ 1 行に畳む (手で書いた関門の形と揃える)。
      const only = s.then.length === 1 ? s.then[0]! : null;
      if (s.otherwise === null && only !== null && only.kind === 'return' && only.comments.length === 0) {
        return [...head, `${ind}if (${expr(s.test)}) ${stmt(only, 0)[0]}`];
      }
      const out = [...head, `${ind}if (${expr(s.test)}) {`, ...block(s.then, depth + 1)];
      let rest = s.otherwise;
      while (rest !== null) {
        // else の本体が注記の無い if 文 1 つだけなら `else if` に畳む (それ以外は `else { … }`)。
        const elif = rest.length === 1 ? rest[0]! : null;
        if (elif !== null && elif.kind === 'if' && elif.comments.length === 0) {
          out.push(`${ind}} else if (${expr(elif.test)}) {`, ...block(elif.then, depth + 1));
          rest = elif.otherwise;
        } else {
          out.push(`${ind}} else {`, ...block(rest, depth + 1));
          rest = null;
        }
      }
      out.push(`${ind}}`);
      return out;
    }
  }
}

function docblock(lines: readonly string[], ind = ''): string[] {
  if (lines.length === 0) return [];
  const safe = lines.map((l) => l.replace(/\*\//g, '*\\/'));
  if (safe.length === 1) return [`${ind}/** ${safe[0]} */`];
  return [`${ind}/**`, ...safe.map((l) => (l === '' ? `${ind} *` : `${ind} * ${l}`)), `${ind} */`];
}

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function item(it: Item, vettedLabels: readonly string[], preludeDone: { value: boolean }): string[] {
  const exp = 'exported' in it && it.exported ? 'export ' : '';
  switch (it.kind) {
    case 'use': {
      const kw = it.typeOnly ? 'import type' : 'import';
      if (it.defaultName !== null) return [...docblock(it.doc), `${kw} ${it.defaultName} from ${quote(it.from)};`];
      const names = it.names.map((n) => (n.alias === null ? n.name : `${n.name} as ${n.alias}`)).join(', ');
      return [...docblock(it.doc), `${kw} { ${names} } from ${quote(it.from)};`];
    }
    case 'extern':
      return it.from === null ? [] : [...docblock(it.doc), `import { ${it.names.join(', ')} } from ${quote(it.from)};`];
    case 'vetted': {
      const out: string[] = [];
      if (!preludeDone.value) {
        preludeDone.value = true;
        out.push(
          'declare const VETTED: unique symbol;',
          '',
          '/** 関門の種類。印の種類ごとに別の型になるので、ある印を別の種類の口へは渡せない。 */',
          `export type VettedKind = ${vettedLabels.map(quote).join(' | ')};`,
          '',
          '/** 関門 `K` を通った文字列。作れるのは gate 関数の `mint` だけ (変換後は gate の `return` の 1 か所)。 */',
          'export type Vetted<K extends VettedKind> = string & { readonly [VETTED]: K };',
          '',
        );
      }
      out.push(...docblock(it.doc), `${exp}type ${it.name} = Vetted<${quote(it.label)}>;`);
      return out;
    }
    case 'type':
      if (!it.multiline) return [...docblock(it.doc), `${exp}type ${it.name} = ${it.type.text};`];
      return [...docblock(it.doc), `${exp}type ${it.name} =`, ...topLevelUnion(it.type.text).map((m, i, all) => `${IND}| ${m}${i === all.length - 1 ? ';' : ''}`)];
    case 'interface':
      return [...docblock(it.doc), `${exp}interface ${it.name} {`, ...it.members.flatMap(member), '}'];
    case 'const':
      return [...docblock(it.doc), `${exp}const ${it.name}${it.type === null ? '' : `: ${it.type.text}`} = ${expr(it.init)};`];
    case 'fn': {
      const sig = `${exp}${it.async ? 'async ' : ''}function ${it.name}(${it.params.map(param).join(', ')}): ${it.returns.text} {`;
      return [...docblock(it.doc), sig, ...block(it.body, 1), '}'];
    }
  }
}

function member(m: Member): string[] {
  return [...docblock(m.doc, IND), `${IND}${m.readonly ? 'readonly ' : ''}${m.name}${m.optional ? '?' : ''}: ${m.type.text};`];
}

/** 和の型を、深さ 0 の ` | ` で分ける (括弧・文字列の中の `|` では分けない)。 */
export function topLevelUnion(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  // 添字で回すと「長さの 1 つ先まで回る」変異体が等価になる (先は undefined でどの字にも当たらない) ので、字の並びで回す。
  let escaped = false;
  for (const [i, c] of text.split('').entries()) {
    if (escaped) {
      escaped = false;
    } else if (quote !== null) {
      if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '<' || c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === '>' || c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === '|' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** 1 つのモジュールを TypeScript へ。`source` は生成物の頭に書く元の道 (リポジトリからの相対)。 */
export function emitModule(module: Module, source: string): string {
  const labels = module.items.flatMap((it) => (it.kind === 'vetted' ? [it.label] : []));
  // 印の前置き (VETTED / VettedKind / Vetted) は最初の vetted の前に 1 度だけ。`value` を持たない器でも
  // `!undefined` が true なので最初の 1 度は同じく出る (器の字面を空にする変異体は等価)。
  // Stryker disable next-line ObjectLiteral: 上の注記のとおり等価 (value を欠いた器でも最初の 1 度は出て、以後は true が入る)
  const preludeDone = { value: false };
  const lines: string[] = [
    `// 生成物 —— ${source} から Mamori のコンパイラが組んだ。手で編集しない (\`npm run mamori:build\`)。`,
    '// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。',
    ...docblock(module.header),
  ];
  let prevKind: Item['kind'] | null = null;
  for (const it of module.items) {
    const chunk = item(it, labels, preludeDone);
    if (chunk.length === 0) continue;
    const imports = (k: Item['kind'] | null): boolean => k === 'use' || k === 'extern';
    // 項目の間には空行 1 つ。続く import (説明の無い物) だけは詰める。最初の項目の前 (prevKind が null) も
    // imports(null) が false なので空行になる —— null を別に判定する枝は要らない (変異検査が教えた)。
    if (!(imports(prevKind) && imports(it.kind) && it.doc.length === 0)) lines.push('');
    lines.push(...chunk);
    prevKind = it.kind;
  }
  return `${lines.join('\n')}\n`;
}
