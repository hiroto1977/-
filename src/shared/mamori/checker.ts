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

/**
 * 組み込みの `Object` で使ってよいメンバ (2026-10-30 · パス 563 · threat: T-224)。
 *
 * `Object` は「副作用の判断を持たない」として宣言なしで使えたが、**メンバの半分はそうではない** ——
 * `Object.setPrototypeOf(Object.getPrototypeOf(''), null)` は文字列の組み込みメソッドをアプリ全体で消し、
 * `Object.defineProperty(…)` / `Object.assign(…)` は既にある値を書き換える。どれも 0.1 で書けた。
 * 読むだけ・凍らせるだけのメンバに絞り、`Object` を値として持ち出す形 (`const o = Object;`) も断る
 * (持ち出すと、この表を名前の別名で迂回できる)。
 */
export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(['hasOwn', 'keys', 'values', 'entries', 'fromEntries', 'freeze', 'isFrozen']);

/**
 * 組み込みのうち、**共有の状態を持つ**ので使えるメンバを絞る物 (2026-10-31 · パス 571 · threat: T-232 · 0.4)。
 *
 * `PURE_GLOBALS` は「副作用の判断を持たない」と名乗るが、**名前ではなくメンバ**が判断を持つ物が 3 組あった:
 *
 * - `RegExp` の旧式の静的な欄 (`RegExp.$1` ほか `$2`〜`$9`・`lastMatch`・`lastParen`・`leftContext`・`rightContext`・`input`・`$_`):
 *   **同じ realm のどのモジュールでも、最後に走った正規表現の一致と入力を返す**。資格情報の入口や伏字が走らせた
 *   正規表現の一致 (= 秘密そのもの) を、`use` も `extern` も無い Mamori のモジュールが読めた。M6 は
 *   「宣言していない外の値へ届かない」と言うのに、これは**名前を経由しない読み**だった。
 * - `Error` / `TypeError` / `RangeError` の `captureStackTrace` / `stackTraceLimit` / `prepareStackTrace`:
 *   渡された物へ欄を書く・全モジュールの例外の積み方を変える。
 * - `URL.createObjectURL` / `revokeObjectURL`: 他のモジュールが作った blob の URL を失効させる (全 realm で共有)。
 *
 * この 3 組は**構築する形** (`new RegExp(…)` / `new Error(…)` / `new URL(…)`) 以外では使えず、メンバは絞る。
 * 値として持ち出す形 (`const r = RegExp;`) も断る (持ち出すと、この表を別名で迂回できる)。
 */
export const BUILTIN_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Object', OBJECT_MEMBERS],
  ['RegExp', new Set<string>()],
  ['Error', new Set<string>()],
  ['TypeError', new Set<string>()],
  ['RangeError', new Set<string>()],
  ['URL', new Set(['canParse', 'parse'])],
]);

/** `new X(…)` / `X(…)` の形でだけ名前で使える組み込み (`Object` は構築する形も無い)。 */
const CONSTRUCTIBLE: ReadonlySet<string | null> = new Set(['RegExp', 'Error', 'TypeError', 'RangeError', 'URL']);

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

/**
 * 値が運ぶ印 (引数・変数の型が名乗る印) —— **型が印そのもの (`VettedUrl`) か、印 + null / undefined (`VettedUrl | null`) のときだけ** (0.4 · T-234)。
 * `VettedUrl | string` や `readonly VettedUrl[]` は印を含む綴りだが、値は素の文字列かもしれない・配列かもしれない。
 * 0.3 は綴りに印の名前が在れば印を運ぶと見て、`u: VettedUrl | string` の `u` を印を持つ値として危ない口へ通した
 * (変換後の `tsc` は型で断るので出荷はされないが、Mamori の検めが 1 層欠けていた)。
 */
function carriedMark(t: TypeRef | null, vetted: ReadonlyMap<string, string>): string | null {
  const mark = vettedOf(t, vetted);
  if (mark === null || t === null) return null;
  return t.text.split('|').every((part) => ['null', 'undefined', mark].includes(part.trim())) ? mark : null;
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
        paramVetted: it.params.map((p) => carriedMark(p.type, vetted)),
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
  /**
   * 代入できるか。`let` だけが `true` を持ち、ほか (`const`・引数・回す変数・このモジュールの関数) は持たない
   * (2026-10-30 · パス 563)。0.1 は代入の相手が「このモジュールの名前か」しか見ておらず、`const` や引数への代入を
   * 変換後の `tsc` に任せていた —— Mamori の規則として断る (無い = 代入できない、で失敗は閉じる)。
   */
  readonly mutable?: boolean;
}

/**
 * 素の名前の式ならその名前、ほかは null (`kind` の比べを 1 か所に置く —— 名前を持つ式は ident だけ)。
 * `default:` の枝を書かないのは、その枝を消す変異体が等価になる (switch を抜けて同じ null に届く) ため。
 */
function identName(e: Expr): string | null {
  switch (e.kind) {
    case 'ident':
      return e.name;
  }
  return null;
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
      // ★ 'pure' は「sink でも、このモジュールの名前でもない」の意味だけを持ち、比べられるのは 'sink' と 'local' だけ
      // なので、その綴りを別の文字列に替えても答えは変わらない (等価)。既定の名前が無い (null) ときに null を鍵として
      // 置いても、名前は文字列で引くので誰にも当たらない (等価)。どちらも mamoriCheckerCoverage.test.ts の
      // 「use で引いた名前へは代入できない」「use default で引いた名前も同じ」が答えのほうを留める。
      // Stryker disable next-line ConditionalExpression,StringLiteral: 上の注記のとおり等価 (null の鍵は引かれない・'pure' は 'sink' / 'local' でないことだけを意味する)
      if (it.defaultName !== null) moduleScope.set(it.defaultName, { vetted: null, authority: 'pure' });
      // Stryker disable next-line StringLiteral: 上の注記のとおり等価 ('pure' は 'sink' / 'local' でないことだけを意味する)
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
    // 定数の初期値は役割を持たない。role は 'sink' / 'gate' との比べにしか使われないので、'plain' の綴りや
    // 器そのものを替えても答えは変わらない (等価) —— 答えは「定数の初期値からも参照できない」(M2) と
    // 「定数の初期値の奥 (配列の中)」が留める。
    // Stryker disable next-line StringLiteral,ObjectLiteral: 上の注記のとおり等価 (role は 'sink' / 'gate' でないことだけを意味する)
    if (it.kind === 'const') checkExpr(it.init, [moduleScope], { role: 'plain', returnVetted: null, destVetted: null });
    if (it.kind !== 'fn') continue;
    const sig = localFns.get(it.name)!;
    if (it.role === 'sink') {
      const dest = it.params[0];
      if (dest === undefined) {
        report('M3', it.pos, `sink 関数 ${it.name} に行き先の引数がありません (第 1 引数を印の型で受けます)`);
      } else {
        if (dest.type === null) {
          report('M3', dest.pos, `sink 関数 ${it.name} の行き先 ${dest.name} (第 1 引数) は印の型 1 つで受けます (在ったのは 型なし) —— 素の値を行き先に受ける危ない口は作れません`);
        } else if (!table.vetted.has(dest.type.text)) {
          report('M3', dest.pos, `sink 関数 ${it.name} の行き先 ${dest.name} (第 1 引数) は印の型 1 つで受けます (在ったのは \`${dest.type.text}\`) —— 素の値を行き先に受ける危ない口は作れません`);
        }
      }
    }
    // sink 関数の行き先の印 (第 1 引数) —— 危ない口へ渡してよい第 1 引数はこの印を持つ値だけ (0.3 · T-225)。
    // 読むのは sink 関数の中 (checkCallee の role === 'sink' の枝) だけなので、役で分けずに置く。
    const ctx: Ctx = { role: it.role, returnVetted: sig.returnVetted, destVetted: sig.paramVetted[0] ?? null };
    const scope = new Map<string, Binding>();
    for (const p of it.params) {
      scope.set(p.name, { vetted: carriedMark(p.type, table.vetted), authority: 'local' });
      if (p.init !== null) checkExpr(p.init, [moduleScope], ctx);
    }
    checkBlock(it.body, [moduleScope, scope], ctx);
  }

  interface Ctx {
    readonly role: 'gate' | 'sink' | 'plain';
    readonly returnVetted: string | null;
    /** sink 関数の行き先 (第 1 引数) の印。sink 関数の外と、行き先の型が印でない (M3 を出した) ときは null。 */
    readonly destVetted: string | null;
  }

  /** 名前の式ならその束縛、そうでなければ undefined (`f()()` / `a.b.c(…)` の頭は名前ではない)。 */
  function bindingOf(e: Expr, scopes: readonly Map<string, Binding>[]): Binding | undefined {
    switch (e.kind) {
      case 'ident':
        return lookup(scopes, e.name);
    }
    return undefined;
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
    // 式の種類ごとに 1 つの枝 (if を並べると、種類の判定を true にする変異体が他の種類で等価になり測れない)。
    switch (e.kind) {
      case 'mint':
        return e.vetted;
      case 'cond': {
        // 両方の枝が同じ印を持つときだけ印を運ぶ (片方でも素の値なら、その枝を通った値は関門を通っていない)。
        const a = provenance(e.then, scopes);
        return a === provenance(e.otherwise, scopes) ? a : null;
      }
      case 'ident':
        return lookup(scopes, e.name)?.vetted ?? null;
      case 'unary':
        // await だけが印を運ぶ (typeof / ! / - は別の値を作る)
        return e.op === 'await' ? provenance(e.operand, scopes) : null;
      case 'call':
        // 名前で呼んだ関数の外形だけが印を名乗れる。メンバの呼び出し (u.trim()) の呼ぶ側は名前を持たず、
        // その場合に名前を引いても undefined の鍵で何も当たらない (判定を true にする変異体は等価)。
        // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (メンバの呼ぶ側を名前で引いても外形は無い)
        return e.callee.kind === 'ident' ? (signatureOf(e.callee.name)?.returnVetted ?? null) : null;
      default:
        return null;
    }
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
        const declared = carriedMark(s.type, table.vetted);
        const carried = s.init === null ? null : provenance(s.init, scopes);
        if (declared !== null && s.init !== null && carried !== declared) {
          report('M4', s.pos, `${s.name} は印 ${declared} の型ですが、入れる値は印を持ちません`);
        }
        own.set(s.name, { vetted: declared ?? carried, authority: 'local', mutable: s.mutable });
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
        else if (target.mutable !== true) report('M6', s.pos, `${s.target} は let ではないので代入できません (const・引数・回す変数・関数の名前は書き換えない)`);
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
      case 'throw':
        checkExpr(s.value, scopes, ctx);
        return;
      case 'for': {
        checkExpr(s.iterable, scopes, ctx);
        // 回す変数は印を運ばない (印の配列から取り出しても素の値 —— 失敗は閉じる向き)。
        const loopVar = new Map<string, Binding>([[s.name, { vetted: null, authority: 'local' }]]);
        checkBlock(s.body, [...scopes, loopVar], ctx);
        return;
      }
      case 'switch':
        checkExpr(s.test, scopes, ctx);
        for (const c of s.cases) {
          for (const t of c.tests) if (t !== null) checkExpr(t, scopes, ctx);
          checkBlock(c.body, scopes, ctx);
        }
        return;
      // 'comment' / 'jump' は何も検めない (注記の文は名前ではない) —— 枝を書かずに switch を抜ける。
    }
  }

  /** この名前は、このモジュールの名前に隠されていない組み込みで、構築する形 (`new X(…)` / `X(…)`) で使ってよい物か。 */
  function isConstructibleBuiltin(callee: Expr, scopes: readonly Map<string, Binding>[]): boolean {
    return CONSTRUCTIBLE.has(identName(callee)) && bindingOf(callee, scopes) === undefined;
  }

  /**
   * 呼ぶ側の式を検める。名前を直に呼ぶ形 (`f(…)`) と、危ない口のメンバを呼ぶ形 (`shell.m(…)`) だけは値の検めを通さない
   * —— 印を受ける関数と危ない口は「呼ぶこと」しか許さないので、ここで呼ぶ形を見分ける (0.3 · パス 564 · T-225)。
   */
  function checkCallee(callee: Expr, args: readonly Expr[], scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    // 危ない口の名前そのもの (`shell` / `writeFile`) —— 断りの場所もその名前を指す。
    const head = callee.kind === 'member' ? callee.object : callee;
    const name = identName(head);
    const b = bindingOf(head, scopes);
    if (b?.authority === 'sink') {
      if (ctx.role !== 'sink') {
        report('M2', head.pos, `危ない口 ${name} (extern sink) は sink 関数の中でだけ使えます`);
      } else if (ctx.destVetted !== null && (args[0] === undefined || provenance(args[0], scopes) !== ctx.destVetted)) {
        report('M2', head.pos, `危ない口 ${name} へ渡す第 1 引数は、行き先 (印 ${ctx.destVetted} を持つ値) だけです —— 行き先以外の値を流すと、sink 関数の印の型が意味を失う`);
      }
      return;
    }
    if (callee.kind === 'ident') {
      // 名前を直に呼ぶ形: 宣言していない名前の検め (M6) だけを通す (印を受ける関数を呼ぶのは正しい使い方)。
      if (b === undefined && !isConstructibleBuiltin(callee, scopes)) checkExpr(callee, scopes, ctx);
      return;
    }
    checkExpr(callee, scopes, ctx);
  }

  function checkExpr(e: Expr, scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    switch (e.kind) {
      case 'ident': {
        const b = lookup(scopes, e.name);
        if (b === undefined) {
          if (e.name === 'Object') {
            report('M6', e.pos, '組み込みの Object は値として持ち出せません —— `Object.hasOwn(…)` のように許したメンバを直に呼びます (持ち出すと、使ってよいメンバの表を別名で迂回できる)');
          } else if (BUILTIN_MEMBERS.has(e.name)) {
            report('M6', e.pos, `組み込みの ${e.name} は値として持ち出せません —— \`new ${e.name}(…)\` と構築する形か、許したメンバを直に呼ぶ形だけです (持ち出すと、使ってよいメンバの表を別名で迂回できる)`);
          } else if (!PURE_GLOBALS.has(e.name)) {
            report('M6', e.pos, `宣言していない名前 ${e.name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`);
          }
          return;
        }
        if (b.authority === 'sink') {
          report('M2', e.pos, ctx.role !== 'sink'
            ? `危ない口 ${e.name} (extern sink) は sink 関数の中でだけ使えます`
            : `危ない口 ${e.name} は sink 関数の中でも呼ぶ形 (${e.name}(…) / ${e.name}.m(…)) でしか使えません —— 値として持ち出す・返すと、関門の外から素の値で呼べてしまう`);
          return;
        }
        if (b === moduleScope.get(e.name) && signatureOf(e.name)?.paramVetted.some((v) => v !== null) === true) {
          report('M4', e.pos, `${e.name} は印を受ける関数なので、直に呼ぶことしかできません —— 値として持ち出すと (.call / .apply / .bind・別名・オブジェクトや配列・条件演算子)、引数の印の検めを迂回できる`);
        }
        return;
      }
      // 'string' / 'number' / 'regex' / 'literal' は名前を持たないので何も検めない —— 枝を書かずに switch を抜ける
      // (空の枝を書くと、その枝の label を消す変異体が等価になり、測っても何も分からない)。
      case 'array':
        e.items.forEach((x) => checkExpr(x, scopes, ctx));
        return;
      case 'member':
        // 組み込みの Object (このモジュールの名前で隠れていない物) は、許したメンバだけ。
        if (identName(e.object) === 'Object' && lookup(scopes, 'Object') === undefined) {
          if (!OBJECT_MEMBERS.has(e.prop)) {
            report('M6', e.pos, `Object.${e.prop} は使えません —— 組み込みの Object で使えるのは ${[...OBJECT_MEMBERS].join(' / ')} だけです (原型や既にある値を書き換えるメンバは、他のモジュールの関門の判定まで変える)`);
          }
          return;
        }
        // 共有の状態を持つ組み込み (RegExp の旧式の静的な欄・Error の captureStackTrace ・URL の blob) は、許したメンバだけ (0.4 · T-232)。
        for (const [builtin, allowed] of BUILTIN_MEMBERS) {
          if (identName(e.object) === builtin && lookup(scopes, builtin) === undefined) {
            if (!allowed.has(e.prop)) {
              report('M6', e.pos, `${builtin}.${e.prop} は使えません —— 組み込みの ${builtin} は${allowed.size === 0 ? ' `new ' + builtin + '(…)` と構築する形' : ` ${[...allowed].join(' / ')} と構築する形`}だけです (同じ realm のどのモジュールの正規表現・例外・blob にも届く共有の状態は、宣言していない外の値と同じ)`);
            }
            return;
          }
        }
        checkExpr(e.object, scopes, ctx);
        return;
      case 'field':
        checkExpr(e.object, scopes, ctx);
        return;
      case 'object':
        for (const p of e.props) checkExpr(p.value, scopes, ctx);
        return;
      case 'cond':
        checkExpr(e.test, scopes, ctx);
        checkExpr(e.then, scopes, ctx);
        checkExpr(e.otherwise, scopes, ctx);
        return;
      case 'unary':
        checkExpr(e.operand, scopes, ctx);
        return;
      case 'binary':
        checkExpr(e.left, scopes, ctx);
        checkExpr(e.right, scopes, ctx);
        return;
      case 'new':
        // 構築する形で名前を使うのは許す (`new RegExp(…)`)。値として持ち出す形は 'ident' の枝が断る。
        if (!isConstructibleBuiltin(e.callee, scopes)) checkExpr(e.callee, scopes, ctx);
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        return;
      case 'arrow': {
        const inner = new Map<string, Binding>();
        // arrow の本体は式なので、その中で引数へ代入する文は書けない —— 'local' の綴りは代入の判定にしか効かず、
        // ここでは届かない (等価)。印 (vetted) のほうは「arrow の引数の印の型は、arrow の中で印を運ぶ」が留める。
        // Stryker disable next-line StringLiteral: 上の注記のとおり等価 (arrow の引数へは代入できない)
        for (const p of e.params as readonly Param[]) inner.set(p.name, { vetted: carriedMark(p.type, table.vetted), authority: 'local' });
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
        checkCallee(e.callee, e.args, scopes, ctx);
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        // メンバの呼び出しは外形を持たない。この門を外しても、名前の無い呼ぶ側を引いて undefined が返り、
        // 下の門で同じく抜ける (等価)。
        // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (名前の無い呼ぶ側は外形を引けない)
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
