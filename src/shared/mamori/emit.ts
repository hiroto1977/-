/**
 * Mamori → TypeScript の変換 (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 変換は**決定的** (同じ入力は同じ byte) で、生成物は commit する —— 既存の門 (`tsc` / eslint /
 * 変異検査 / 整合性チェーン / census) は今までどおり生成した `.ts` に掛かる。生成物が `.mamori` から
 * 組み直した物と 1 byte でも違えば `mamoriGenerated.test.ts` が落ちる (手で直した生成物を見逃さない)。
 *
 * 型の書き換え (`as`) を出すのは `mint` だけで、それは検査器が gate 関数の中にしか置かせない。
 */
import type { Expr, Item, Module, Param, Stmt } from './ast';

const IND = '  ';

/** 2 項演算子の強さ (大きいほど強い)。 */
const PREC: Readonly<Record<string, number>> = {
  '??': 1, '||': 2, '&&': 3, '===': 4, '!==': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7,
};

function prec(e: Expr): number {
  switch (e.kind) {
    case 'arrow':
      return 0;
    case 'mint':
      return 5; // `x as T` は TypeScript で関係演算子と同じ強さ
    case 'binary':
      return PREC[e.op]!;
    case 'unary':
      return 8;
    default:
      return 9;
  }
}

/** `??` と `||` / `&&` を括弧なしで混ぜると TypeScript が断るので、混ざる所は必ず括る。 */
function mixesNullish(parent: string, child: Expr): boolean {
  if (child.kind !== 'binary') return false;
  const a = parent === '??';
  const b = child.op === '??';
  return a !== b && (a ? child.op === '||' || child.op === '&&' : parent === '||' || parent === '&&');
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
      return `${wrap(e.object, 9)}.${e.prop}`;
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
      return `(${e.params.map(param).join(', ')}) => ${wrap(e.body, 1)}`;
    case 'mint':
      return `${wrap(e.value, 6)} as ${e.vetted}`;
  }
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
        const elif = rest.length === 1 && rest[0]!.kind === 'if' && rest[0]!.comments.length === 0 ? rest[0]! : null;
        if (elif !== null && elif.kind === 'if') {
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
    case 'const':
      return [...docblock(it.doc), `${exp}const ${it.name}${it.type === null ? '' : `: ${it.type.text}`} = ${expr(it.init)};`];
    case 'fn': {
      const sig = `${exp}${it.async ? 'async ' : ''}function ${it.name}(${it.params.map(param).join(', ')}): ${it.returns.text} {`;
      return [...docblock(it.doc), sig, ...block(it.body, 1), '}'];
    }
  }
}

/** 1 つのモジュールを TypeScript へ。`source` は生成物の頭に書く元の道 (リポジトリからの相対)。 */
export function emitModule(module: Module, source: string): string {
  const labels = module.items.flatMap((it) => (it.kind === 'vetted' ? [it.label] : []));
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
    if (prevKind !== null && !(imports(prevKind) && imports(it.kind) && it.doc.length === 0)) lines.push('');
    else if (prevKind === null) lines.push('');
    lines.push(...chunk);
    prevKind = it.kind;
  }
  return `${lines.join('\n')}\n`;
}
