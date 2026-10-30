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
  | { readonly kind: 'member'; readonly object: Expr; readonly prop: string; readonly pos: Pos }
  | { readonly kind: 'call'; readonly callee: Expr; readonly args: readonly Expr[]; readonly pos: Pos }
  | { readonly kind: 'new'; readonly callee: Expr; readonly args: readonly Expr[]; readonly pos: Pos }
  | { readonly kind: 'unary'; readonly op: '!' | '-' | 'typeof' | 'await'; readonly operand: Expr; readonly pos: Pos }
  | { readonly kind: 'binary'; readonly op: string; readonly left: Expr; readonly right: Expr; readonly pos: Pos }
  | { readonly kind: 'arrow'; readonly params: readonly Param[]; readonly body: Expr; readonly pos: Pos }
  | { readonly kind: 'mint'; readonly vetted: string; readonly value: Expr; readonly pos: Pos };

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
  | { readonly kind: 'return'; readonly value: Expr | null; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'if'; readonly test: Expr; readonly then: readonly Stmt[]; readonly otherwise: readonly Stmt[] | null; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'try'; readonly body: readonly Stmt[]; readonly handler: readonly Stmt[]; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'assign'; readonly target: string; readonly value: Expr; readonly comments: Comments; readonly pos: Pos }
  | { readonly kind: 'expr'; readonly expr: Expr; readonly comments: Comments; readonly pos: Pos }
  /** ブロックの末尾に残った注記 (後に文が無い)。 */
  | { readonly kind: 'comment'; readonly comments: Comments; readonly pos: Pos };

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

export interface Module {
  /** ファイル冒頭の説明 (`//!` の行)。生成物の先頭の docblock になる。 */
  readonly header: Doc;
  readonly items: readonly Item[];
}
