/**
 * Mamori (守り) の構文木 (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 型の表現は TypeScript の型の綴りをそのまま運ぶ (`TypeRef.text`)。TypeScript への変換は綴りを写すだけで、
 * 型の正しさは変換後の TypeScript を `tsc` が検査する —— Mamori の検査器が見るのは**来歴**
 * (印をどこで作ったか・危ない口をどこで呼んだか・宣言していない外の名前を使っていないか) だけである。
 */

export interface Pos {
  readonly line: number;
  readonly col: number;
}

/** 型の綴り。`vetted` は印の型の名前 (宣言した印のどれか) なら立つ —— 検査器が埋める。 */
export interface TypeRef {
  readonly text: string;
  /** 綴りに現れる名前 (`Promise<VettedShellPath | null>` → ['Promise', 'VettedShellPath']) */
  readonly names: readonly string[];
  readonly pos: Pos;
}

export type Expr =
  | { readonly kind: 'ident'; readonly name: string; readonly pos: Pos }
  | { readonly kind: 'string'; readonly raw: string; readonly pos: Pos }
  | { readonly kind: 'number'; readonly raw: string; readonly pos: Pos }
  | { readonly kind: 'regex'; readonly raw: string; readonly pos: Pos }
  | { readonly kind: 'literal'; readonly value: 'true' | 'false' | 'null' | 'undefined'; readonly pos: Pos }
  | { readonly kind: 'array'; readonly items: readonly Expr[]; readonly pos: Pos }
  | { readonly kind: 'member'; readonly object: Expr; readonly prop: string; readonly optional: boolean; readonly pos: Pos }
  /**
   * 添字 `x[k]` (0.8)。鍵は数リテラル・識別子にならない文字列リテラル・静的に数と分かる式だけ。
   * 識別子として読める文字列の鍵 (`x["name"]`) は `member` に畳む —— `.name` と同じ検めを必ず通る。
   * 計算した鍵の結果は inert (0.12)。呼び出し・`new`・メンバ・次の添字の相手にできない。
   */
  | { readonly kind: 'index'; readonly object: Expr; readonly key: Expr; readonly pos: Pos }
  | { readonly kind: 'call'; readonly callee: Expr; readonly args: readonly Expr[]; readonly pos: Pos }
  | { readonly kind: 'new'; readonly callee: Expr; readonly args: readonly Expr[]; readonly pos: Pos }
  | { readonly kind: 'unary'; readonly op: '!' | '-' | '~' | 'typeof' | 'await'; readonly operand: Expr; readonly pos: Pos }
  | { readonly kind: 'binary'; readonly op: string; readonly left: Expr; readonly right: Expr; readonly pos: Pos }
  | { readonly kind: 'arrow'; readonly params: readonly Param[]; readonly body: Expr; readonly pos: Pos }
  /**
   * 本体がブロックの arrow (0.9)。`=> {` は必ずブロックを開く (オブジェクトの字面を返すなら `=> ({ … })` と括る)。
   * 本体の中の文は、外の関数の gate / sink の役割を継がない (`mint` と危ない口は使えない) —— 外へ渡された arrow が
   * 関門や危ない口の検めを飛ばして呼べる道にならないように。
   */
  | { readonly kind: 'arrow-block'; readonly params: readonly Param[]; readonly body: readonly Stmt[]; readonly pos: Pos }
  | { readonly kind: 'mint'; readonly vetted: string; readonly value: Expr; readonly pos: Pos }
  /** オブジェクトの字面 (0.2)。鍵は名前か文字列だけ —— 展開 (`...`)・計算した鍵 (`[k]`)・`__proto__` は書けない。 */
  | { readonly kind: 'object'; readonly props: readonly Prop[]; readonly pos: Pos }
  /** `c ? a : b` (0.2)。印を運ぶのは両方の枝が同じ印を持つときだけ。 */
  | { readonly kind: 'cond'; readonly test: Expr; readonly then: Expr; readonly otherwise: Expr; readonly pos: Pos }
  /**
   * `field x.k` (0.2) —— 型の分からない値 (`unknown`) から欄を 1 つ読む。読んだ値は必ず `unknown` で、印は運ばない。
   * TypeScript の `(x as { k?: unknown }).k` にあたる (`as` を言語に置かない代わり —— 型を**広げる**向きにしか書き換えない)。
   */
  | { readonly kind: 'field'; readonly object: Expr; readonly prop: string; readonly pos: Pos }
  /**
   * 配列の字面の中の展開 `[...xs, y]` (0.15 · MG-024)。置けるのは**配列の字面の項**だけ —— 呼び出しの引数の展開 (`f(...xs)`) は無い
   * (印を受ける位置が数でずれ、M4 が引数を位置で検めるので)。展開した要素は印を運ばない素の値。
   */
  | { readonly kind: 'spread'; readonly operand: Expr; readonly pos: Pos };

/**
 * オブジェクトの字面の 1 項 (0.15 で和の型になった)。
 * 展開 `{ ...x, k: v }` は鍵を持たず、**欄より前**にだけ置ける —— 後ろに置くと、先に字面で書いた欄 (`ok: true` など)
 * を展開が上書きできる。欄は `shorthand` が `{ value }` の形 (鍵と同じ名前の値)。
 */
export type Prop =
  | { readonly spread: true; readonly value: Expr; readonly pos: Pos }
  | {
      readonly spread: false;
      readonly key: string;
      /** 鍵を文字列で書いた (`{ 'x-y': 1 }`)。 */
      readonly quoted: boolean;
      readonly value: Expr;
      readonly shorthand: boolean;
      readonly pos: Pos;
    };

export interface Param {
  readonly name: string;
  readonly type: TypeRef | null;
  readonly init: Expr | null;
  readonly pos: Pos;
}

/** 文の前に置いた注記 (`//` の行)。そのまま TypeScript へ運ぶ。 */
export type Comments = readonly string[];

export type Stmt =
  | { readonly kind: 'let'; readonly mutable: boolean; readonly name: string; readonly type: TypeRef | null; readonly init: Expr | null; readonly comments: Comments; readonly pos: Pos }
  /**
   * `const { a, b: c } = 式;` (0.14 · MG-022)。**浅い分割だけ** —— 入れ子・既定値・残り (`...rest`)・計算した鍵・`let` は無い。
   * 鍵は `.` の後ろと同じ `FORBIDDEN_MEMBERS` を通る (`const { constructor } = x` は T-224 の表を迂回する道になるため)。
   * 取り出した値は印を運ばない局所の値で、元の式が組み込み・外の名前 (pure / sink) の**メンバ**を直に指す形は断る (表の迂回)。
   */
  | { readonly kind: 'destructure'; readonly fields: readonly { readonly key: string; readonly local: string }[]; readonly type: TypeRef | null; readonly init: Expr; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'return'; readonly value: Expr | null; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'if'; readonly test: Expr; readonly then: readonly Stmt[]; readonly otherwise: readonly Stmt[] | null; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'try'; readonly body: readonly Stmt[]; /** `catch (e)` の束縛名 (0.12)。無ければ null。 */ readonly param: string | null; readonly handler: readonly Stmt[]; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'assign'; readonly target: string; readonly value: Expr; readonly comments: Comments; readonly pos: Pos }
  /**
   * 添字への代入 `out[i] = v` (0.12)。欄への代入 (`out.name = v`) は無い。
   * 字面の文字列鍵は `index` を読むときと同じく禁じた名前を通し、計算した鍵は数だけ。
   */
  | { readonly kind: 'index-assign'; readonly object: Expr; readonly key: Expr; readonly value: Expr; readonly comments: Comments; readonly pos: Pos }
  /**
   * 欄への代入 `o.name = v;` (0.17)。書けるのは、この関数の中で `const o = { … }` と作った物の欄だけ (checker が見る)。
   * 欄の名前は `.` の後ろと同じく禁じた名前の表を通る (parser の memberName)。
   */
  | { readonly kind: 'member-assign'; readonly object: string; readonly prop: string; readonly value: Expr; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'expr'; readonly expr: Expr; readonly comments: Comments; readonly pos: Pos }
  /** `throw 式;` (0.2) */
  | { readonly kind: 'throw'; readonly value: Expr; readonly comments: Comments; readonly pos: Pos }
  /** `for (const x of xs) { … }` (0.2)。回す変数は印を運ばない (印の配列でも、取り出した 1 つは素の値として扱う —— 失敗は閉じる向き)。 */
  | { readonly kind: 'for'; readonly name: string; readonly iterable: Expr; readonly body: readonly Stmt[]; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'while'; readonly test: Expr; readonly body: readonly Stmt[]; readonly comments: Comments; readonly pos: Pos }
  /** `break;` / `continue;` (0.2)。置けるのは for の中 (break は switch の中でも)。 */
  | { readonly kind: 'jump'; readonly word: 'break' | 'continue'; readonly comments: Comments; readonly pos: Pos }
  /** `switch (式) { case …: … }` (0.2)。どの case の本体も return / throw / break で終わる (次の case へ落ちる形を書けない)。 */
  | { readonly kind: 'switch'; readonly test: Expr; readonly cases: readonly SwitchCase[]; readonly comments: Comments; readonly pos: Pos }
  /** ブロックの末尾に残った注記 (後に文が無い)。 */
  | { readonly kind: 'comment'; readonly comments: Comments; readonly pos: Pos };

/** switch の 1 つの群れ。`tests` の null は `default`。積んだ label (`case 'a': case 'b':`) は 1 つの群れになる。 */
export interface SwitchCase {
  readonly tests: readonly (Expr | null)[];
  readonly body: readonly Stmt[];
  readonly comments: Comments;
  readonly pos: Pos;
}

/** 項目の前に置いた説明 (`///` の行)。TypeScript の docblock (`/** … *\/`) になる。 */
export type Doc = readonly string[];

export type Item =
  | {
      readonly kind: 'use';
      /** `use type { … }` なら true (型だけの import)。 */
      readonly typeOnly: boolean;
      readonly names: readonly { readonly name: string; readonly alias: string | null }[];
      readonly defaultName: string | null;
      readonly from: string;
      readonly doc: Doc;
      readonly pos: Pos;
    }
  | {
      readonly kind: 'extern';
      /** `sink` は危ない口 (使えるのは sink 関数の中だけ)・`pure` は副作用の判断を持たない値。 */
      readonly authority: 'sink' | 'pure';
      /** `extern sink { shell } from "electron";` / `extern sink global window;` */
      readonly names: readonly string[];
      readonly from: string | null;
      readonly doc: Doc;
      readonly pos: Pos;
    }
  | { readonly kind: 'vetted'; readonly exported: boolean; readonly name: string; readonly label: string; readonly doc: Doc; readonly pos: Pos }
  /** `type 名前 = 型;` (0.2)。`multiline` は元が先頭の `|` で書いた和の型 (変換も 1 行に 1 つずつ並べる)。 */
  | { readonly kind: 'type'; readonly exported: boolean; readonly name: string; readonly type: TypeRef; readonly multiline: boolean; readonly doc: Doc; readonly pos: Pos }
  /** `interface 名前 { 欄; … }` (0.2)。欄は `///` の説明・`readonly`・`?` を持てる。 */
  | { readonly kind: 'interface'; readonly exported: boolean; readonly name: string; readonly members: readonly Member[]; readonly doc: Doc; readonly pos: Pos }
  | { readonly kind: 'const'; readonly exported: boolean; readonly name: string; readonly type: TypeRef | null; readonly init: Expr; readonly doc: Doc; readonly pos: Pos }
  | {
      readonly kind: 'fn';
      readonly exported: boolean;
      /** `gate` は印を作れる関数・`sink` は危ない口を呼べる関数・`plain` はどちらもできない。 */
      readonly role: 'gate' | 'sink' | 'plain';
      readonly async: boolean;
      readonly name: string;
      readonly params: readonly Param[];
      readonly returns: TypeRef;
      readonly body: readonly Stmt[];
      readonly doc: Doc;
      readonly pos: Pos;
    };

/** interface の 1 つの欄。 */
export interface Member {
  readonly name: string;
  readonly readonly: boolean;
  readonly optional: boolean;
  readonly type: TypeRef;
  readonly doc: Doc;
  readonly pos: Pos;
}

export interface Module {
  /** ファイル冒頭の説明 (`//!` の行)。生成物の先頭の docblock になる。 */
  readonly header: Doc;
  readonly items: readonly Item[];
}
