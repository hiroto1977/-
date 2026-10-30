/**
 * Mamori の検査器 —— **来歴の規則** (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 型の正しさ (null の絞り込み・メンバの在否・戻り値の型) は、変換した TypeScript を `tsc` が検査する。
 * ここが見るのは TypeScript には書けない (書けても型を剥がす 1 行で外れる) 規則だけである:
 *
 * | 規則 | 中身 |
 * | --- | --- |
 * | M1 印は gate で作る | `mint K(…)` は `gate fn` の中にだけ置け、その関数の戻り値の型が `K` を名乗る |
 * | M2 危ない口は sink で呼ぶ | `extern sink` で宣言した値は `sink fn` の中でだけ参照できる |
 * | M3 sink の行き先は印 | `sink fn` の**第 1 引数 (行き先)** の型は宣言した印の型 1 つ (素の `string` を行き先に受ける sink を作れない)。2 つ目からは送る中身で、型は問わない (パス 560 で「全部の引数」から精密にした —— 書き出しの sink は本文を受ける) |
 * | M4 印の型の引数には印つきの値だけ | 印の型を受ける関数 (sink も gate も) へは、印を持つ値しか渡せない —— 文字列の字面・素の引数・外の値は断る |
 * | M5 印つきの変数を素の値で上書きしない | `let u = 関門(x); u = '…';` の形 (印の洗浄) を断る |
 * | M6 外の名前は宣言する | 使ってよい外の名前は `use` / `extern` で宣言した物と、副作用の判断を持たない組み込み (`URL` / `Set` ほか) だけ。`window` / `fetch` / `process` / `require` / `globalThis` は宣言しなければ使えない |
 * | (構文) 役割は 1 つ | 1 つの関数が gate と sink を兼ねられない —— 関数の頭に書ける役割は 1 語だけで、sink が印を作れば M1、gate が危ない口を呼べば M2 が断る (印を作る所と危ない口を呼ぶ所を同じにすると、関門の検査を飛ばして呼べる) |
 *
 * 誤りは全部集めて返す (構文と違い、来歴の誤りは互いに独立なので並べて見せる価値がある)。
 */
import type { Expr, Module, Param, Stmt, TypeRef } from './ast';

export interface MamoriDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly col: number;
  /** M0 は構文の誤り (字句・構文の段で止まった)。 */
  readonly rule: 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
  readonly message: string;
}

/** 宣言しなくても使える組み込み。**副作用の判断を持たない物だけ** —— 網・記憶・OS へ届く物は入れない。 */
export const PURE_GLOBALS: ReadonlySet<string> = new Set([
  'URL', 'Set', 'Map', 'Promise', 'Number', 'String', 'Boolean', 'Math', 'JSON', 'Object', 'Array', 'Error', 'RegExp', 'TypeError', 'RangeError',
]);

/** 関数の外形 (他のモジュールから引くため)。 */
export interface FnSignature {
  readonly module: string;
  readonly name: string;
  readonly role: 'gate' | 'sink' | 'plain';
  /** 引数 i が受ける印 (無ければ null)。 */
  readonly paramVetted: readonly (string | null)[];
  /** 戻り値が名乗る印 (無ければ null)。 */
  readonly returnVetted: string | null;
}

export interface ProjectTable {
  /** 宣言した印の名前 → ラベル。 */
  readonly vetted: ReadonlyMap<string, string>;
  /** export した関数の名前 → 外形。 */
  readonly fns: ReadonlyMap<string, FnSignature>;
}

/** 型の綴りが名乗る印 (`VettedShellPath | null` → `VettedShellPath`)。2 つ以上なら最初の物。 */
function vettedOf(t: TypeRef | null, vetted: ReadonlyMap<string, string>): string | null {
  if (t === null) return null;
  return t.names.find((n) => vetted.has(n)) ?? null;
}

export function collectTable(modules: readonly { readonly file: string; readonly module: Module }[]): { table: ProjectTable; diagnostics: MamoriDiagnostic[] } {
  const vetted = new Map<string, string>();
  const fns = new Map<string, FnSignature>();
  const diagnostics: MamoriDiagnostic[] = [];
  for (const { module } of modules) {
    for (const it of module.items) if (it.kind === 'vetted') vetted.set(it.name, it.label);
  }
  for (const { file, module } of modules) {
    for (const it of module.items) {
      if (it.kind !== 'fn') continue;
      const sig: FnSignature = {
        module: file,
        name: it.name,
        role: it.role,
        paramVetted: it.params.map((p) => vettedOf(p.type, vetted)),
        returnVetted: vettedOf(it.returns, vetted),
      };
      if (it.exported && fns.has(it.name)) {
        diagnostics.push({ file, line: it.pos.line, col: it.pos.col, rule: 'M6', message: `関数 ${it.name} が 2 つのモジュールで export されています (名前で引くので 1 つにする)` });
      }
      fns.set(it.name, sig);
    }
  }
  return { table: { vetted, fns }, diagnostics };
}

interface Binding {
  readonly vetted: string | null;
  readonly authority: 'sink' | 'pure' | 'local';
}

export function checkModule(file: string, module: Module, table: ProjectTable): MamoriDiagnostic[] {
  const out: MamoriDiagnostic[] = [];
  const report = (rule: MamoriDiagnostic['rule'], pos: { line: number; col: number }, message: string): void => {
    out.push({ file, line: pos.line, col: pos.col, rule, message });
  };

  const moduleScope = new Map<string, Binding>();
  const localFns = new Map<string, FnSignature>();
  for (const it of module.items) {
    if (it.kind === 'use') {
      if (it.defaultName !== null) moduleScope.set(it.defaultName, { vetted: null, authority: 'pure' });
      for (const n of it.names) moduleScope.set(n.alias ?? n.name, { vetted: null, authority: 'pure' });
    } else if (it.kind === 'extern') {
      for (const n of it.names) moduleScope.set(n, { vetted: null, authority: it.authority });
    } else if (it.kind === 'const') {
      moduleScope.set(it.name, { vetted: null, authority: 'local' });
    } else if (it.kind === 'fn') {
      moduleScope.set(it.name, { vetted: null, authority: 'local' });
      localFns.set(it.name, table.fns.get(it.name)!);
    }
  }

  /** 名前 → 関数の外形 (このモジュールの物か、use で引いた他の Mamori の物)。 */
  const signatureOf = (name: string): FnSignature | undefined => localFns.get(name) ?? table.fns.get(name);

  for (const it of module.items) {
    if (it.kind === 'const') checkExpr(it.init, [moduleScope], { role: 'plain', returnVetted: null });
    if (it.kind !== 'fn') continue;
    const sig = localFns.get(it.name)!;
    if (it.role === 'sink') {
      const dest = it.params[0];
      if (dest === undefined) {
        report('M3', it.pos, `sink 関数 ${it.name} に行き先の引数がありません (第 1 引数を印の型で受けます)`);
      } else {
        const t = dest.type?.text ?? '';
        if (!table.vetted.has(t)) {
          report('M3', dest.pos, `sink 関数 ${it.name} の行き先 ${dest.name} (第 1 引数) は印の型 1 つで受けます (在ったのは ${dest.type === null ? '型なし' : `\`${t}\``}) —— 素の値を行き先に受ける危ない口は作れません`);
        }
      }
    }
    const scope = new Map<string, Binding>();
    for (const p of it.params) {
      scope.set(p.name, { vetted: vettedOf(p.type, table.vetted), authority: 'local' });
      if (p.init !== null) checkExpr(p.init, [moduleScope], { role: it.role, returnVetted: sig.returnVetted });
    }
    checkBlock(it.body, [moduleScope, scope], { role: it.role, returnVetted: sig.returnVetted });
  }

  interface Ctx {
    readonly role: 'gate' | 'sink' | 'plain';
    readonly returnVetted: string | null;
  }

  function lookup(scopes: readonly Map<string, Binding>[], name: string): Binding | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const b = scopes[i]!.get(name);
      if (b !== undefined) return b;
    }
    return undefined;
  }

  /** 式が運ぶ印 (無ければ null)。 */
  function provenance(e: Expr, scopes: readonly Map<string, Binding>[]): string | null {
    if (e.kind === 'mint') return e.vetted;
    if (e.kind === 'ident') return lookup(scopes, e.name)?.vetted ?? null;
    if (e.kind === 'unary' && e.op === 'await') return provenance(e.operand, scopes);
    if (e.kind === 'call' && e.callee.kind === 'ident') return signatureOf(e.callee.name)?.returnVetted ?? null;
    return null;
  }

  function checkBlock(stmts: readonly Stmt[], scopes: Map<string, Binding>[], ctx: Ctx): void {
    const own = new Map<string, Binding>();
    const chain = [...scopes, own];
    for (const s of stmts) checkStmt(s, chain, own, ctx);
  }

  function checkStmt(s: Stmt, scopes: Map<string, Binding>[], own: Map<string, Binding>, ctx: Ctx): void {
    switch (s.kind) {
      case 'let': {
        if (s.init !== null) checkExpr(s.init, scopes, ctx);
        const declared = vettedOf(s.type, table.vetted);
        const carried = s.init === null ? null : provenance(s.init, scopes);
        if (declared !== null && s.init !== null && carried !== declared) {
          report('M4', s.pos, `${s.name} は印 ${declared} の型ですが、入れる値は印を持ちません`);
        }
        own.set(s.name, { vetted: declared ?? carried, authority: 'local' });
        return;
      }
      case 'assign': {
        checkExpr(s.value, scopes, ctx);
        const target = lookup(scopes, s.target);
        if (target === undefined) {
          report('M6', s.pos, `宣言していない名前 ${s.target} へ代入しています`);
          return;
        }
        if (target.authority !== 'local') report('M6', s.pos, `外の名前 ${s.target} へは代入できません`);
        if (target.vetted !== null && provenance(s.value, scopes) !== target.vetted) {
          report('M5', s.pos, `印 ${target.vetted} を持つ ${s.target} を、印の無い値で上書きしています (印の洗浄)`);
        }
        return;
      }
      case 'return':
        if (s.value !== null) checkExpr(s.value, scopes, ctx);
        return;
      case 'if':
        checkExpr(s.test, scopes, ctx);
        checkBlock(s.then, scopes, ctx);
        if (s.otherwise !== null) checkBlock(s.otherwise, scopes, ctx);
        return;
      case 'try':
        checkBlock(s.body, scopes, ctx);
        checkBlock(s.handler, scopes, ctx);
        return;
      case 'expr':
        checkExpr(s.expr, scopes, ctx);
        return;
      case 'comment':
        return;
    }
  }

  function checkExpr(e: Expr, scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    switch (e.kind) {
      case 'ident': {
        const b = lookup(scopes, e.name);
        if (b === undefined) {
          if (!PURE_GLOBALS.has(e.name)) {
            report('M6', e.pos, `宣言していない名前 ${e.name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`);
          }
          return;
        }
        if (b.authority === 'sink' && ctx.role !== 'sink') {
          report('M2', e.pos, `危ない口 ${e.name} (extern sink) は sink 関数の中でだけ使えます`);
        }
        return;
      }
      case 'string':
      case 'number':
      case 'regex':
      case 'literal':
        return;
      case 'array':
        e.items.forEach((x) => checkExpr(x, scopes, ctx));
        return;
      case 'member':
        checkExpr(e.object, scopes, ctx);
        return;
      case 'unary':
        checkExpr(e.operand, scopes, ctx);
        return;
      case 'binary':
        checkExpr(e.left, scopes, ctx);
        checkExpr(e.right, scopes, ctx);
        return;
      case 'new':
        checkExpr(e.callee, scopes, ctx);
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        return;
      case 'arrow': {
        const inner = new Map<string, Binding>();
        for (const p of e.params as readonly Param[]) inner.set(p.name, { vetted: vettedOf(p.type, table.vetted), authority: 'local' });
        checkExpr(e.body, [...scopes, inner], ctx);
        return;
      }
      case 'mint': {
        if (!table.vetted.has(e.vetted)) {
          report('M1', e.pos, `mint ${e.vetted}: そんな印は宣言されていません`);
        } else if (ctx.role !== 'gate') {
          report('M1', e.pos, `印 ${e.vetted} を作れるのは gate 関数の中だけです (関門を通らずに印を付けると、印の意味が無くなる)`);
        } else if (ctx.returnVetted !== e.vetted) {
          report('M1', e.pos, `この gate 関数の戻り値は印 ${e.vetted} を名乗っていません (作った印を外へ出せない)`);
        }
        checkExpr(e.value, scopes, ctx);
        return;
      }
      case 'call': {
        checkExpr(e.callee, scopes, ctx);
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        if (e.callee.kind !== 'ident') return;
        const sig = signatureOf(e.callee.name);
        if (sig === undefined) return;
        sig.paramVetted.forEach((want, i) => {
          if (want === null) return;
          const arg = e.args[i];
          if (arg === undefined) return;
          const got = provenance(arg, scopes);
          if (got !== want) {
            report('M4', arg.pos, `${sig.name} の引数 ${i + 1} は印 ${want} を持つ値だけを受けます (渡したのは${got === null ? '印の無い値' : `印 ${got}`})`);
          }
        });
        return;
      }
    }
  }

  return out;
}
