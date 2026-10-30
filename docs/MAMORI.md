# Mamori (守り) —— 守りの規則を構文に持つ言語

2026-10-30 (パス 560 · threat: T-221) に作った。Service Hub の**守りの層**
(外へ開く URL の関門・OS に開かせるパスの関門・OS の口) はこの言語で書いてあり、
コンパイラ (`src/shared/mamori/`) が TypeScript へ変換する。

## なぜ作ったか

パス 559 で、守りの規則 (「関門を通った値だけが危ない口へ届く」) を TypeScript の型の印
(`Vetted<K>`) に乗せた。ところが TypeScript の中では、印は**型を書き換える 1 行**で偽造でき
(`x as VettedExternalUrl`)、危ない口 (`shell.openExternal` / `window.open`) は**どの関数からでも**呼べる。
その 2 つを止めていたのは、綴りを数える検査 (`vettedTypes.test.ts`) だけだった。

Mamori では、その 2 つは**書けない**:

- `as` (型の書き換え) は言語に無い。印を付けられるのは `gate` 関数の中の `mint` だけ。
- 危ない口は `extern sink` で宣言し、`sink` 関数の中でしか参照できない。`sink` 関数は印の型でしか引数を受けない。
- 宣言していない外の名前 (`window` / `fetch` / `process` / `require` / `globalThis` ほか) は使えない。

規則を破ったプログラムは**TypeScript にならない** (コンパイラが 1 つも出力しない)。

## 変換の流れと、既存の門との関係

```
  src/**/X.mamori ──(npm run mamori:build)──▶ src/**/X.ts (生成物・commit する)
                                                 │
                                                 ├─ tsc (型の正しさ・null の絞り込み)
                                                 ├─ vitest / Stryker / eslint / lint:forbidden
                                                 └─ 整合性チェーン・CODEOWNERS
```

- 生成物は commit する。だから**今までの門はすべて生成物に掛かる** (TypeScript の toolchain は変えない)。
- 生成物は `.mamori` から組み直した物と **1 byte も違ってはいけない** ——
  `src/shared/mamori/__tests__/mamoriGenerated.test.ts` (npm test) と `npm run mamori:check` が見る。
  生成物を手で直すと落ちる。
- Mamori の検査器が見るのは**来歴**だけで、型の正しさ (メンバの在否・null の絞り込み) は変換後の
  TypeScript を `tsc` が検査する。2 つの検査器が別々の物を見る。

## 規則

| 番号 | 規則 | 破ると |
| --- | --- | --- |
| M0 | 書けない綴り: `as` / `any` / `eval` / テンプレート文字列 / `/* */`・**`.` の後ろの `constructor` / `prototype` / `__proto__`** (0.2)・オブジェクトの字面の `__proto__` の鍵・展開 `...`・計算した鍵 | 字句・構文の段で止まる |
| M1 | 印は `gate` 関数の中の `mint 型名(値)` でだけ作れ、その関数の戻り値の型が同じ印を名乗る | `sink` / 普通の関数の `mint`・戻り値が名乗らない印 |
| M2 | `extern sink` で宣言した値は `sink` 関数の中でだけ参照できる | 普通の関数・`gate` 関数・定数の初期値から危ない口を呼ぶ |
| M3 | `sink` 関数の**最初の引数 (行き先)** の型は、宣言した印の型 1 つ (`T \| null` も不可)。2 つ目からは本文で型を問わない。引数の無い sink も断る | 素の `string` を行き先に受ける危ない口を作る |
| M4 | 印の型を受ける引数には、印を持つ値だけを渡せる (モジュールをまたいでも) | 文字列の字面・素の引数・別の種類の印を渡す |
| M5 | 印を持つ変数を、印の無い値で上書きできない | `let u = 関門(x); u = '…';` (印の洗浄) |
| M6 | 外の名前は `use` / `extern` で宣言する。宣言なしで使えるのは副作用の判断を持たない組み込み (`URL` / `Set` / `Map` / `Promise` / `Number` / `String` / `Boolean` / `Math` / `JSON` / `Object` / `Array` / `Error` / `RegExp` / `TypeError` / `RangeError`) だけ。**`Object` は読むだけ・凍らせるだけのメンバ (`hasOwn` / `keys` / `values` / `entries` / `fromEntries` / `freeze` / `isFrozen`) に限り、値として持ち出せない** (0.2) | `window` / `fetch` / `process` / `require` / `globalThis` / `document` / `localStorage` / `indexedDB` / `navigator` を暗黙に使う・`Object.setPrototypeOf` / `defineProperty` / `assign`・`const o = Object;` |

1 つの関数は `gate` と `sink` を兼ねられない (頭に書ける役割は 1 語だけで、`sink` が印を作れば M1、
`gate` が危ない口を呼べば M2 が断る)。印を作る所と危ない口を呼ぶ所を同じにすると、関門の検査を飛ばして呼べるからである。

## 0.1 の穴 (T-224 · 2026-10-30 · パス 563)

0.1 は `eval` を禁じていたのに、**メンバの連鎖で同じことができた**。`String.constructor(code)()` と
`''.constructor.constructor(code)()` は関数の constructor (`Function`) に届き、Mamori のコンパイラも変換後の
`tsc --strict` も通し、node で実行すると文字列がコードとして走った (`String.constructor('return 6*7')()` が 42)。
`Function` という名前は M6 が断るが、メンバの連鎖はどの名前も経由しない —— M0 / M6 は**名前**を見ていて、
**連鎖**を見ていなかった。同じく、宣言なしで使える `Object` は「副作用の判断を持たない」と名乗りながら
`Object.setPrototypeOf(Object.getPrototypeOf(''), null)` で文字列の組み込みメソッドをアプリ全体で消せた。
0.2 はどちらも断る (`mamoriV02.test.ts` が規則を破るプログラムで留める)。

## 文法 (0.2)

```
module    := header* item*
header    := '//!' 行                         生成物の先頭の docblock になる
item      := doc* ( use | extern | vetted | type | interface | const | fn )
doc       := '///' 行                         項目の docblock になる
use       := 'use' 'type'? '{' name ('alias' name)? (',' …)* '}' 'from' 文字列 ';'
           | 'use' 'default' name 'from' 文字列 ';'
extern    := 'extern' ('sink' | 'pure') '{' name (',' name)* '}' 'from' 文字列 ';'
           | 'extern' ('sink' | 'pure') 'global' name ';'
vetted    := 'export'? 'vetted' 名前 '=' 文字列 ';'
type      := 'export'? 'type' 名前 '=' '|'? 型 ';'      先頭に | を書けば 1 行に 1 つずつ並べて写す
interface := 'export'? 'interface' 名前 '{' (doc* 'readonly'? 名前 '?'? ':' 型 ';')* '}'
const     := 'export'? 'const' 名前 (':' 型)? '=' 式 ';'
fn        := 'export'? ('gate' | 'sink')? 'async'? 'fn' 名前 '(' 引数* ')' '->' 型 ブロック
引数      := 名前 (':' 型)? ('=' 式)?
文        := ('const' | 'let') 名前 (':' 型)? ('=' 式)? ';' | 'return' 式? ';'
           | 'if' '(' 式 ')' ブロック ('else' (if 文 | ブロック))? | 'try' ブロック 'catch' ブロック
           | 'throw' 式 ';' | 'for' '(' 'const' 名前 'of' 式 ')' ブロック | 'break' ';' | 'continue' ';'
           | 'switch' '(' 式 ')' '{' (('case' 式 | 'default') ':')+ 文+ … '}'
           | 名前 '=' 式 ';' | 式 ';'
式        := 2 項 (?? || && === !== < > <= >= + - * / %) | 単項 (! - typeof await)
           | 呼び出し・メンバ・new | 配列 | 文字列・数・正規表現・true/false/null/undefined
           | '(' 引数 ')' '=>' 式 | 'mint' 印 '(' 式 ')'
           | 式 '?' 式 ':' 式 | '{' (鍵 ':' 式 | 名前) (',' …)* '}' | 'field' 式 '.' 名前      (0.2)
鍵        := 名前 | 文字列            (`__proto__` は書けない・展開 `...` と計算した鍵 `[k]` は無い)
```

- `if` の本体は必ず `{ }` で囲む (囲まない 1 行の `if` は書けない)。
- `alias` は TypeScript の `import { a as b }` にあたる (`as` は言語に無いので別の語にした)。
- 型は TypeScript の綴りをそのまま書く (`Promise<VettedShellPath | null>` / `ReadonlySet<string>`)。
- **`switch` の各 case の本体は `return` / `throw` / `break` で終える** (次の case へ落ちる形を書けない)。積んだ label (`case 'a': case 'b':`) は 1 つの群れ。
- **`for` は `for (const x of xs)` だけ**。回す変数は印を運ばない (印の配列から取り出しても素の値 —— 失敗は閉じる向き)。`continue` は for の中、`break` は for か switch の中だけ。
- **条件演算子が印を運ぶのは両方の枝が同じ印のとき**だけ (片方でも素の値なら、その枝を通った値は関門を通っていない)。
- **`field x.k`** は型の分からない値 (`unknown`) から欄を 1 つ読む。TypeScript の `(x as { k?: unknown }).k` にあたり、読んだ値は必ず `unknown` で印を運ばない —— `as` を言語に置かない代わりで、型を**広げる**向きにしか書き換えない。`x` が null / undefined なら実行時に投げる (先に確かめる。`tsc` もここは見られない)。
- オブジェクトの字面の鍵 `__proto__` は欄ではなく**原型の差し替え**なので書けない (文字列で書いても同じ)。

## 例

```
//! 印の宣言 (src/shared/vetted.mamori)
export vetted VettedExternalUrl = "external-url";

//! 関門 (src/shared/externalUrlGate.mamori)
use type { VettedExternalUrl } from "./vetted";
export gate fn externalUrlOrNull(url: unknown) -> VettedExternalUrl | null {
  if (typeof url !== 'string') {
    return null;
  }
  // …検査…
  return mint VettedExternalUrl(href);
}

//! OS の口 (src/main/osSinks.mamori)
extern sink { shell } from "electron";
use type { VettedExternalUrl } from "../shared/vetted";
export sink fn openExternalVetted(url: VettedExternalUrl) -> Promise<void> {
  return shell.openExternal(url);
}
```

## Mamori で書いてある物

| 元 | 生成物 | 役割 |
| --- | --- | --- |
| `src/shared/vetted.mamori` | `src/shared/vetted.ts` | 印の宣言 (`VettedExternalUrl` / `VettedShellPath`) |
| `src/shared/externalUrlGate.mamori` | `src/shared/externalUrlGate.ts` | gate: 外へ開く URL の関門 |
| `src/main/shellOpenGate.mamori` | `src/main/shellOpenGate.ts` | gate: OS に開かせるパスの関門 |
| `src/main/osSinks.mamori` | `src/main/osSinks.ts` | sink: electron の `shell` の 3 つの口 |
| `src/renderer/vettedSinks.mamori` | `src/renderer/vettedSinks.ts` | sink: ブラウザ版の `window.open` |
| `src/shared/imageUrlGate.mamori` | `src/shared/imageUrlGate.ts` | gate: 画像の取得先 (`safeImageSrc` / `safeRemoteImageSrc` → `VettedImageSrc`)。口は JSX の部品 `src/renderer/components/VettedImg.tsx` で、言語が JSX を持たないので TypeScript の型が守る |
| `src/main/clients/exportSink.mamori` | `src/main/clients/exportSink.ts` | gate + sink: 書き出しのファイル書き込み (`exportTargetOrNull` → `writeExportFileVetted` · 書き手 4 本が通る) |
| `src/shared/proxyEndpoint.mamori` | `src/shared/proxyEndpoint.ts` | BYO プロキシの送り先と共有秘密の検証 (**資格情報のほぼ全部が通る 1 本の口** · 0.2 の構文で書き直した最初の物 · パス 563) |

残りの TypeScript は Mamori で書いた gate / sink を呼ぶ側で、呼ぶ側には TypeScript の型の印が掛かる
(パス 559)。書き出しのファイル書き込みはパス 560 で gate と sink の組として移し、pending の天井を 4 → 3 へ下げた。
続けて `<img src>` を移した (関門 `imageUrlGate` を Mamori へ・口は印 `VettedImageSrc` しか受けない部品 `VettedImg` 1 つ —— 第三者の
応答 (DataList / StatusBar) も自分で組んだ data: URL (TemplatesPage / LibraryPage) も同じ関門を通る)。天井は 3 → 2。
外へ出る `<a href>` も移した (口は印 `VettedExternalUrl` しか受けない部品 `src/renderer/components/VettedLink.tsx` 1 つ・関門は既に Mamori の
`externalUrlGate`)。中クリック・右クリック・ドラッグは `click` を起こさず素の属性を辿るので、属性に載る値そのものが関門を通る。天井は 2 → 1。
**次に移すなら**、まだ素の `string` を受けている危ない口 (`SINK_LEDGER` の pending 1 本 —— fetch の送り先) を、
同じく gate と sink の組として移す。移すたびに pending の天井を下げる。

## 限界 (正直に書く)

- Mamori の規則が効くのは **Mamori で書いた中**だけである。手書きの TypeScript から印を `as` で付けたり、
  `shell` を直接呼んだりする道は、TypeScript の側の検査 (`vettedTypes.test.ts` の census・`lint:forbidden`) が塞ぐ。
- 変換した TypeScript は `tsc` が検査するが、実行時の守りは今までどおり**関門の中身**そのものである。
  Mamori が止めるのは「関門を飛ばす書き方」で、関門の判定の誤りは関門の検査 (変異検査 100% の対象) が見る。
- 言語は 0.2 で、守りの層を書くのに要る構文しか持たない (0.2 でオブジェクトの字面・条件演算子・switch・throw・for…of・type / interface・field を足した。**クラス・添字 `x[k]`・計算した鍵・展開・後置の `!`・optional chaining は無い** —— 添字と計算した鍵は鍵を実行時に組めるので、T-224 の表 (`.constructor` を断る) を迂回する道になる。足すなら先に塞ぎ方を決める)。**JSX も無い**ので、`<img>` の口 (`VettedImg.tsx`) と `<a href>` の口 (`VettedLink.tsx`) は TypeScript で書き、守りは型の印と census (素の `<img` と動的な素の `<a href={…}>` はこの部品の外に無い) が持つ。
  足すときは、その構文が来歴の規則を外す道にならないかを先に考える (`as` を入れなかったのと同じ理由)。

## 育て方 (半永久的に育てる輪)

言語は週 1 の予約のセッションが育てる (`docs/MAMORI_GROWTH_PROMPT.md` · 台帳 `mamori/growth.json` ·
`npm run mamori:grow -- brief|record|status`)。1 周で育てるのは 1 つ —— **構文を 1 つ足す**か、**守りの層の
TypeScript を 1 本 Mamori へ移す**か。どちらも「来歴の規則を外す道にならないか」を先に書き、規則を破る
プログラムで留め、変異検査を 100% に保つ。止まれば毎日の dependency-audit の報告が要対応として出す。

## 道具

```bash
npm run mamori:build   # src/ の .mamori を全部コンパイルし、隣の .ts を書き直す
npm run mamori:check   # 書かずに、コンパイルの誤りと「生成物が古い」を報せる (exit 1)
```
