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
 * **メンバ・数の字面・オブジェクトの字面も数える (2026-11-17 · MG-077 · T-276)。** 上の 6 種だけでは映らない食い違いが 2 つ在った:
 * 数の字面のメンバ (`1.e3` —— Mamori は「数 1 の欄 e3」、TypeScript は指数つきの数 1000) と、文の頭のオブジェクトの字面
 * (`{ a: x }(y);` —— TypeScript はブロックと式の文に読む)。どちらもメンバ・オブジェクトの字面の数がずれる。
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
  /** `.名前` の読み (Mamori の `field x.k` と欄への代入 `o.k = v` も、生成物では `.k` になる)。 */
  members: number;
  /** 式の位置の数の字面 (型の綴りの中の数は数えない)。 */
  numbers: number;
  /** オブジェクトの字面。 */
  objects: number;
  binary: Record<string, number>;
}

/** Mamori の 2 項演算子 (代入は文なので入らない)。 */
const OPS = ['??', '||', '&&', '|', '^', '&', '===', '!==', '<', '>', '<=', '>=', 'instanceof', 'in', '<<', '>>', '>>>', '+', '-', '*', '/', '%'];

function empty(): Shape {
  return { calls: 0, news: 0, generics: 0, conds: 0, arrows: 0, members: 0, numbers: 0, objects: 0, binary: {} };
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
    } else if ((o.kind === 'member' || o.kind === 'field' || o.kind === 'member-assign') && typeof o.prop === 'string') {
      s.members++;
    } else if (o.kind === 'number' && typeof o.raw === 'string') {
      s.numbers++;
    } else if (o.kind === 'object' && Array.isArray(o.props)) {
      s.objects++;
    } else if (o.kind === 'class' && Array.isArray(o.superArgs)) {
      // 例外の class は、生成物の構築子に `this.name = '名前';` を 1 つ持つ (Mamori の木には無い欄への代入)。
      s.members++;
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
    // 型の綴りの中は数えない (型の中の数の字面 `-1 | 1` は Mamori の木では式ではない)。型の中に式は無い。
    if (ts.isTypeNode(n)) return;
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
    } else if (ts.isPropertyAccessExpression(n)) {
      s.members++;
    } else if (ts.isNumericLiteral(n)) {
      s.numbers++;
    } else if (ts.isObjectLiteralExpression(n)) {
      s.objects++;
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
  for (const key of ['calls', 'news', 'generics', 'conds', 'arrows', 'members', 'numbers', 'objects'] as const) {
    if (a[key] !== b[key]) out.push(`${key}: Mamori ${a[key]} / TypeScript ${b[key]}`);
  }
  for (const op of OPS) {
    const x = a.binary[op] ?? 0;
    const y = b.binary[op] ?? 0;
    if (x !== y) out.push(`2 項 ${op}: Mamori ${x} / TypeScript ${y}`);
  }
  return out;
}
