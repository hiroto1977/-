/**
 * **木の形の突き合わせ** —— Mamori が検めた木と、生成物を TypeScript が読んだ木が同じ形か (2026-11-10 · T-260)。
 *
 * 検査器 (M0〜M7) が見るのは Mamori の構文木で、走るのは生成した TypeScript である。2 つの木が食い違えば、
 * **検めていない呼び出しが走る** —— T-260 の穴はまさにこれだった:
 *
 *  - `n<m ? shell.openExternal(raw) : k>(x)` —— Mamori は「型引数つきの呼び出し 1 つ」、TypeScript は「条件式 + 呼び出し 2 つ」。
 *  - `f(n < n, n > (raw ?? raw))` —— Mamori は「比べ 2 つ」、TypeScript は「型引数つきの呼び出し `n<n, n>(…)`」。
 *
 * `mamoriInspect.ts` (生成物だけを見る独立の判定) には、この食い違いは映らない: 生成物の木だけを見れば、どちらも
 * ありふれた形である。ここでは**両方の木を数えて比べる** —— 呼び出し・new・型引数つきの呼び出し・条件式・矢印関数・
 * 2 項演算子 (演算子ごと) の数が、Mamori の木と TypeScript の木で一致すること。
 *
 * 数えるのは Mamori の木を**種類の名前だけで**たどる小さな歩き手で、コンパイラの検査器も変換も借りない
 * (借りると、検査器の読み違いをそのまま写す)。TypeScript の側は TypeScript のコンパイラの構文木である。
 */
import ts from 'typescript';
import { parse } from '../parser';

export interface Shape {
  calls: number;
  news: number;
  generics: number;
  conds: number;
  arrows: number;
  binary: Record<string, number>;
}

/** Mamori の 2 項演算子 (代入は文なので入らない)。 */
const OPS = ['??', '||', '&&', '|', '^', '&', '===', '!==', '<', '>', '<=', '>=', 'instanceof', 'in', '<<', '>>', '>>>', '+', '-', '*', '/', '%'];

function empty(): Shape {
  return { calls: 0, news: 0, generics: 0, conds: 0, arrows: 0, binary: {} };
}

function bump(s: Shape, op: string): void {
  s.binary[op] = (s.binary[op] ?? 0) + 1;
}

/** Mamori の木の形。種類の名前 (`kind`) だけでたどる。 */
export function mamoriShape(file: string, source: string): Shape {
  const s = empty();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n === null || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    // 式の種類だけを数える: 式は必ず `pos` を持ち、`call` / `new` は `args` を、`binary` は `op` と両辺を持つ。
    if (o.kind === 'call' && Array.isArray(o.args)) {
      s.calls++;
      if (Array.isArray(o.typeArgs) && o.typeArgs.length > 0) s.generics++;
    } else if (o.kind === 'new' && Array.isArray(o.args)) {
      s.news++;
      if (Array.isArray(o.typeArgs) && o.typeArgs.length > 0) s.generics++;
    } else if (o.kind === 'cond' && 'otherwise' in o) {
      s.conds++;
    } else if (o.kind === 'arrow' || o.kind === 'arrow-block') {
      s.arrows++;
    } else if (o.kind === 'binary' && typeof o.op === 'string') {
      bump(s, o.op);
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(parse(file, source));
  return s;
}

/** 生成物を TypeScript が読んだ木の形。 */
export function emittedShape(file: string, text: string): Shape {
  const s = empty();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      // class の `super(…)` は Mamori の木では呼び出しの式ではない (class の欄として持つ) ので数えない。
      if (n.expression.kind !== ts.SyntaxKind.SuperKeyword) {
        s.calls++;
        if (n.typeArguments !== undefined) s.generics++;
      }
    } else if (ts.isNewExpression(n)) {
      s.news++;
      if (n.typeArguments !== undefined) s.generics++;
    } else if (ts.isConditionalExpression(n)) {
      s.conds++;
    } else if (ts.isArrowFunction(n)) {
      s.arrows++;
    } else if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.getText(sf);
      if (OPS.includes(op)) bump(s, op);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return s;
}

/** 2 つの木の形の食い違い (無ければ空)。 */
export function shapeMismatch(file: string, source: string, emitted: string): string[] {
  const a = mamoriShape(file, source);
  const b = emittedShape(file.replace(/\.mamori$/, '.ts'), emitted);
  const out: string[] = [];
  for (const key of ['calls', 'news', 'generics', 'conds', 'arrows'] as const) {
    if (a[key] !== b[key]) out.push(`${key}: Mamori ${a[key]} / TypeScript ${b[key]}`);
  }
  for (const op of OPS) {
    const x = a.binary[op] ?? 0;
    const y = b.binary[op] ?? 0;
    if (x !== y) out.push(`2 項 ${op}: Mamori ${x} / TypeScript ${y}`);
  }
  return out;
}
