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
| M2 | `extern sink` で宣言した値は `sink` 関数の中でだけ参照できる。**sink 関数の中でも呼ぶ形 (`shell(…)` / `shell.m(…)`) でしか使えず、その第 1 引数は行き先 (第 1 引数の印) を持つ値だけ** (0.3 · T-225) | 普通の関数・`gate` 関数・定数の初期値から危ない口を呼ぶ・sink 関数の中で `shell.openExternal(raw)` (行き先以外の素の値)・`return shell;` / `return { s: shell };` (危ない口を外へ持ち出す) |
| M3 | `sink` 関数の**最初の引数 (行き先)** の型は、宣言した印の型 1 つ (`T \| null` も不可)。2 つ目からは本文で型を問わない。引数の無い sink も断る | 素の `string` を行き先に受ける危ない口を作る |
| M4 | 印の型を受ける引数には、印を持つ値だけを渡せる (モジュールをまたいでも)。**印を受ける関数は直に呼ぶことしかできない** —— 値として持ち出すと検めを迂回できる (0.3 · T-225) | 文字列の字面・素の引数・別の種類の印を渡す・`openUrl.call(null, raw)` / `.apply` / `.bind`・`const f = openUrl;`・`{ g: openUrl }`・`[openUrl]`・`c ? openUrl : …`・`for (const f of [openUrl])` |
| M5 | 印を持つ変数を、印の無い値で上書きできない | `let u = 関門(x); u = '…';` (印の洗浄) |
| M6 | 外の名前は `use` / `extern` で宣言する。宣言なしで使えるのは副作用の判断を持たない組み込み (`URL` / `Set` / `Map` / `Promise` / `Number` / `String` / `Boolean` / `Math` / `JSON` / `Object` / `Array` / `Error` / `RegExp` / `TypeError` / `RangeError`) だけ。**`Object` は読むだけ・凍らせるだけのメンバ (`hasOwn` / `keys` / `values` / `entries` / `fromEntries` / `freeze` / `isFrozen`) に限り、値として持ち出せない** (0.2)。**代入できるのは `let` の名前だけ** —— 外の名前・`const`・引数・回す変数・関数の名前へは代入できない (0.2。0.1 は「このモジュールの名前か」しか見ず、`const` と引数への代入を変換後の `tsc` に任せていた —— 引数への代入は `tsc` も通す) | `window` / `fetch` / `process` / `require` / `globalThis` / `document` / `localStorage` / `indexedDB` / `navigator` を暗黙に使う・`Object.setPrototypeOf` / `defineProperty` / `assign`・`const o = Object;`・`code = 'x';` (引数)・`for (const k of xs) { k = 1; }`・**`RegExp.$1` / `RegExp.input` / `RegExp.lastMatch` (他のモジュールの直近の正規表現の一致と入力)・`Error.captureStackTrace` / `Error.stackTraceLimit`・`URL.createObjectURL` / `URL.revokeObjectURL`・`const r = RegExp;` (0.4 · T-232)** |

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

## 0.2 の穴 (T-225 · 2026-10-30 · パス 564)

0.2 の M4 は**名前を直に呼ぶ形** (`openUrl(raw)`) しか見ていなかった。印を受ける関数を値として持ち出すと ——
`openUrl.call(null, raw)` / `.apply` / `.bind`・別名・オブジェクトや配列に入れる・条件演算子・`for` で回す ——
素の値を渡すのを通した (この 8 形は変換後の `tsc --strict` が型で断るので、Mamori の規則としての穴)。
**より重いのは sink 関数の中**で、行き先を印の型で受けていても、本体は危ない口へ**別の素の引数**を流せた
(`shell.openExternal(raw)`)・危ない口そのものを返せた (`return shell;`) —— こちらは `tsc` も通す。
0.3 はどちらも断る (`mamoriV03.test.ts` が規則を破るプログラムで留める)。言語を育てる輪の 2 周目 (MG-002) の
「破る」段で、足す構文 (16 進の数) と関係の無い既存の構文の組み合わせから出た —— **破る段は足す構文だけを見ない**。

## 0.3 の穴 (T-232 · 2026-10-31 · パス 571)

M6 は「宣言していない外の値へ届かない」と言い、宣言なしで使える組み込みは「副作用の判断を持たない」物だけだった。
ところが**名前ではなくメンバ**が共有の状態を持つ組み込みが 3 組あり、0.3 は名前だけを見ていたのでどれも書けた
(node で `/(sek)/.exec('a sek b'); RegExp.$1` は `'sek'` を返す —— 旧式の静的な欄は**同じ realm のどのモジュールでも
最後に走った正規表現の一致と入力**を返すので、資格情報の入口や伏字が走らせた正規表現の一致 = 秘密そのものを、
`use` も `extern` も無いモジュールが読める):

| 組み込み | 共有の状態 | 0.4 |
| --- | --- | --- |
| `RegExp` | `$1`〜`$9`・`lastMatch`・`lastParen`・`leftContext`・`rightContext`・`input`・`$_` | 構築する形だけ |
| `Error` / `TypeError` / `RangeError` | `captureStackTrace`・`stackTraceLimit` (全モジュールの例外の積み方・渡した物への書き込み) | 構築する形だけ |
| `URL` | `createObjectURL` / `revokeObjectURL` (他のモジュールが作った blob の URL を失効させる) | 構築する形 + `canParse` / `parse` |

`String` / `Math` / `JSON` / `Number` / `Array` / `Map` / `Set` / `Promise` の静的メンバは共有の状態を持たないので絞っていない
(測った)。`Object.freeze(use で宣言した値)` は宣言した値への操作で、宣言していない外へ届く道ではない。
言語を育てる輪の 4 周目 (MG-004) の「破る」段で、`escape.ts` を移すときに出た ——
**移す前に、移すモジュールが使う組み込みを総当たりで試す**。`mamoriV04.test.ts` が規則を破るプログラムで留める。

## 対戦で見つけた穴 2 つ (T-233 · T-234 · 2026-10-31 · パス 571 の続き)

「他のハッキング方法を考えて対戦して」で赤 (攻める) と青 (塞ぐ) を回した。**言語の外の道具との差**と**型の綴り**を狙った。

- **T-233 · 行終端の差分 (パーサ)**: Mamori の字句解析は行注記を LF だけで終えたが、JavaScript は **CR・U+2028・U+2029** も行終端と扱う。
  注記の中に U+2028 (または単独の CR) を置き、そのあとへ検めに掛けたくない字を書くと、Mamori は「注記の続き」として読み飛ばし
  (M0 も M6 も見ない)、生成された TypeScript では行終端のあとの**コード**として走る。直し: 行注記の本体を LF / CR / U+2028 / U+2029 のどれかで終える
  (`///` の説明も同じ)。正当な注記 (普通の字・CRLF の行末・空) の生成物は 1 字も変わらない。
- **T-234 · 印の型の綴り (M4)**: 引数・変数の型の綴りに印の名前が在れば印を運ぶと見ていたので、`u: VU | string` / `readonly VU[]` / `type Maybe = VU | string`
  の値 (素の文字列かもしれない) を、印つきしか受けない口へ通せた。変換後の `tsc` は型で断るので出荷はされないが、Mamori の検めが 1 層欠けていた。
  直し: 印を運ぶのは**型が印そのもの、または印 + null / undefined** のときだけ (`carriedMark`)。引数・arrow の引数・局所の型注釈が同じ関数を通る。

どちらも `mamoriV04.test.ts` が破るプログラムで留め、台帳の書き換え A-543 / A-544 が回帰検査が鳴ることを測る。
**防いだ試し (R1–R7, R10–R14)**: 組み込みの持ち出し・`.constructor` の連鎖・テンプレート・`as`・宣言なしの外の名前・sink の呼び方・mint の置き場所などは、既存の規則で断られた。
未対応と測って残した物: `String.raw` と `Object.freeze(use で宣言した値)` (宣言した値への操作で外へ届かない)・`new RegExp(動的な文字列)` は来歴の穴ではなく可用性 (ReDoS) の話。

## 文法 (0.4 —— 構文は 0.3 と同じ・変わったのは M6 の表)

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
           | 呼び出し・メンバ・new | 配列 | 文字列・数 (10 進 / 16 進 `0x1f` · 0.3)・正規表現・true/false/null/undefined
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
| `src/shared/controlChars.mamori` | `src/shared/controlChars.ts` | 制御文字 (C0 と DEL) の判定 (資格情報・URL の入口の 5 本が読む唯一の規則 · 0.3 の 16 進の数で書き直した · パス 564) |
| `src/shared/proxyEndpoint.mamori` | `src/shared/proxyEndpoint.ts` | BYO プロキシの送り先と共有秘密の検証 (**資格情報のほぼ全部が通る 1 本の口** · 0.2 の構文で書き直した最初の物 · パス 563) |
| `src/shared/tokenInput.mamori` | `src/shared/tokenInput.ts` | 資格情報の保存要求の検証 (`checkTokenInput` · main と renderer で同じ規則 · 空 / 長すぎ / 制御文字 / 非 Latin1 を理由つきで断る · 0.3 で書き直した · パス 567 · MG-003) |
| `src/shared/escape.mamori` | `src/shared/escape.ts` | 出力側の関門 (`escapeXml` / `safeColor` / `isHexColor` / `escapeMarkdownInline` / `escapeMarkdownText` / `escapeInvisibleUnits` ほか · HTML / XML / Markdown に第三者の文を埋める所と色を属性へ埋める所 · 0.3 で書き直した —— template を `+` の連結へ替えただけ · パス 571 · MG-004) |

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
- 言語は 0.4 で、守りの層を書くのに要る構文しか持たない (0.3 で 16 進の数を、0.2 でオブジェクトの字面・条件演算子・switch・throw・for…of・type / interface・field を足した。**クラス・添字 `x[k]`・計算した鍵・展開・後置の `!`・optional chaining は無い** —— 添字と計算した鍵は鍵を実行時に組めるので、T-224 の表 (`.constructor` を断る) を迂回する道になる。足すなら先に塞ぎ方を決める)。**JSX も無い**ので、`<img>` の口 (`VettedImg.tsx`) と `<a href>` の口 (`VettedLink.tsx`) は TypeScript で書き、守りは型の印と census (素の `<img` と動的な素の `<a href={…}>` はこの部品の外に無い) が持つ。
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
