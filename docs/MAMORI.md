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
| M6 | 外の名前は `use` / `extern` で宣言する。宣言なしで使えるのは副作用の判断を持たない組み込み (`URL` / `Set` / `Map` / `Promise` / `Number` / `String` / `Boolean` / `Math` / `JSON` / `Object` / `Array` / `Error` / `RegExp` / `TypeError` / `RangeError`) だけ。**`Object` は読むだけ・凍らせるだけのメンバ (`hasOwn` / `keys` / `values` / `entries` / `fromEntries` / `freeze` / `isFrozen`) に限り、値として持ち出せない** (0.2)。**代入できるのは `let` の名前だけ** —— 外の名前・`const`・引数・回す変数・関数の名前へは代入できない (0.2。0.1 は「このモジュールの名前か」しか見ず、`const` と引数への代入を変換後の `tsc` に任せていた —— 引数への代入は `tsc` も通す) | `window` / `fetch` / `process` / `require` / `globalThis` / `document` / `localStorage` / `indexedDB` / `navigator` を暗黙に使う・`Object.setPrototypeOf` / `defineProperty` / `assign`・`const o = Object;`・`code = 'x';` (引数)・`for (const k of xs) { k = 1; }`・**`RegExp.$1` / `RegExp.input` / `RegExp.lastMatch` (他のモジュールの直近の正規表現の一致と入力)・`Error.captureStackTrace` / `Error.stackTraceLimit`・`URL.createObjectURL` / `URL.revokeObjectURL`・`const r = RegExp;` (0.4 · T-232)**・**`extern pure global window;` / `document` / `globalThis` / `fetch` / `process` ほか host の 29 名を pure で宣言する (sink を経ずに `window.open(生の値)` / `document.write(html)` / `return window;` が通る · 0.11 · T-249)** |
| M7 | **能力の台帳 (0.5 · T-242)**: 守りの層が届く先 4 種 (`extern` の外の値・相対でない `use` の外の module・`gate fn` (印を作れる関数)・`sink fn` (危ない口を呼べる関数)) を構文木から導き、`security/mamori-capabilities.json` と**両方向**に突き合わせる。出荷の道 (CLI と生成物の検査) は必ず台帳を渡し、台帳が読めなければ断る | 台帳に無い `extern` / import / gate / sink を足す・台帳に在るのに実在しない能力 (古い申告)・台帳だけに在るモジュール |

1 つの関数は `gate` と `sink` を兼ねられない (頭に書ける役割は 1 語だけで、`sink` が印を作れば M1、
`gate` が危ない口を呼べば M2 が断る)。印を作る所と危ない口を呼ぶ所を同じにすると、関門の検査を飛ばして呼べるからである。

## マイナスデイ・マインド —— 能力の台帳 (M7 · 0.5 · T-242 · 2026-10-31)

「脆弱性は発見される前、**書いた時点ですでに入っている**」という前提 (想定侵害・シフトレフト) を、言語の規則にした。
(この言い方は業界で定着した用語ではなく、既存のシフトレフトとゼロトラストをまとめて呼んだ物として使う。)

- **何を固定するか**: M0〜M6 は**来歴** (印がどう流れるか) を見る。M7 は**届く先の集合**を見る —— 守りの層に `extern` が 1 つ、外の module の import が 1 つ、
  印を作れる `gate fn` が 1 つ、危ない口を呼べる `sink fn` が 1 つ増えることは、それぞれ**攻撃面が増える**ことなので、台帳の 1 行の差分として必ずレビューの目に見える。
- **導く側と申告する側を分ける**: 能力はコンパイラが構文木から導く (書き手の申告ではない)。台帳は導いた表をそのまま書き出した物で、`npm run mamori:build -- --write-capabilities` が書く。
  **意図して能力を足す・外すときだけ**そのコマンドを使い、差分を読む。台帳と `capabilities.ts` は整合性チェーンの保護対象で、CODEOWNERS にも載る。
- **失敗は閉じる向き**: CLI は台帳を必ず渡す。台帳が無い・壊れていれば検めずに通さず断る。ライブラリとして `compileProject(files)` を台帳なしで呼ぶ形は検めない (単体検査の便宜) が、
  出荷の道がそれを使わないことを `mamoriCapabilities.test.ts` が見る。他の誤り (M0〜M6) が在れば台帳は見ない (誤りを直してから出る)。
- **限界 (正直に)**: 台帳が固定するのは**名前と型の綴り**で、`gate fn` の中身が正しい関門かは見ない (それは回帰検査と変異検査の仕事)。台帳を書き直す人が悪意なら、
  差分をレビューする人間が最後の砦 —— M7 が保証するのは「黙って増えない」ことであって「増えた物が安全」ではない。外の module の**版**は見ない (版は `lint:deps` と lockfile の仕事)。

## 0.6 —— `?.` (optional chaining) を足した (MG-005 · 2026-10-31 · パス 573)

`a?.name` の形**だけ**を足した。`a?.(x)` と `a?.[k]` は断る (呼ぶ側・鍵を実行時に選べると、印を受ける関数を値として持ち出せる /
`x?.["constructor"]` が T-224 の表を迂回する —— 添字 `x[k]` を足す前に塞ぎ方を決める、という先送りの理由と同じ)。

**先に破った (`mamoriV06.test.ts`)**: `?.` が `.` と同じ検めを通ることを、破るプログラムで確かめてから足した ——
`u?.constructor` / `?.__proto__` / `?.prototype` (M0)・連鎖の途中の `?.constructor`・`Object?.setPrototypeOf` / `RegExp?.$1` / `URL?.createObjectURL` (M6)・
宣言していない `window?.location` (M6)・`shell?.openExternal(raw)` (M2)・sink の外の `shell?.…` (M2)・`?.` の結果を印つきの口 / 印の型の変数へ入れる形 (M4 · 結果は印を運ばない)・
`openUrl?.call(null, raw)` (M4)。**穴は 0 件**: 名前の検め (`memberName`) と組み込みのメンバの表は `.` と `?.` で同じ関数・同じ節を通るため。

- **既知の差 (正直に)**: `(a?.b).c` は丸括弧を構文木に残さないので生成物は `a?.b.c` になる (`a` が null のとき `.c` を読む前に止まる —— 例外が減る向きで、印の流れには触れない)。
- **この周で移せた壁は 0 本** (`optional-chain` だけで足りる壁が無い —— 足りない構文は他にも要る)。言語の幅を広げた周で、次は `index` の塞ぎ方 (字面の鍵は FORBIDDEN_MEMBERS を通し、字面でない鍵は数だけ) を決めてから足す。

## 0.11 —— 戻り値の型に印を名乗れるのは gate 関数だけ (MG-011 · 2026-11-01 · T-248)

`safeFilename.ts` を移すとき、型述語 `-> s is string` が通るかを確かめて見つけた穴。型述語・`asserts`・`this is` は `tsc` も検めない型の主張で (`as` と同じ)、`-> s is VettedUrl` と書いて `return true` するだけで、関門 (`mint`) を通らずに印の型を作れた。plain / sink 関数が `-> VettedUrl` や `-> Promise<VettedUrl>` と宣言する形も通していた。

| 論点 | 決め方 |
| --- | --- |
| 断る場所 | gate 以外の関数の戻り値の型 (型述語・asserts・this is の対象を含む) が印を名乗ったら M1。診断は戻り値の型の位置を名乗る |
| 通すもの | gate 関数が印を返す形・印を名乗らない型述語 (`s is string`) と戻り値 |
| 足した構文 | 無い (規則を 1 つ足しただけ) |

## 0.10 —— ビット演算 `| ^ & << >> >>> ~` を足した (MG-009 · 2026-11-01) と、その周で見つけた穴 (T-246)

暗号・ハッシュ (IV・CRC) の周りで要る。ビット演算の結果は**常に数** (または BigInt) で文字列も印も運ばないので、来歴には触れない。塞ぎ方を先に決めた:

| 論点 | 決め方 |
| --- | --- |
| 印の洗浄 | 結果は印を運ばない —— `openUrl(a & 1)` `const v: VettedUrl = raw \| 0` は M4 で断られる |
| 添字の鍵 | 結果は「静的に数と分かる式」に入る (`xs[a \| 0]` は通り、生成物は `xs[+(a \| 0)]`)。文字列の鍵で表を引く道は開かない |
| 優先順位 | JavaScript と同じ: `\|` < `^` < `&` は `&&` と `===` の間・シフトは関係演算子と足し算の間。生成物は強さの比べで括る |
| `>>` `>>>` | 字句では `>` の並びのまま (入れ子の型 `Array<Array<x>>` を壊さない)。式の位置で、**同じ行で桁が続く** `>` だけをシフトと読む。`a > > b` `a >>= b` `a <<< b` は M0 で断る |
| 型 | `number` どうしか、は tsc が見る (文字列へのビット演算は変換後に TS2362 で落ちる) |
| 足さないもの | 複合代入 `|=` `<<=` ほか (代入は `=` だけ) |

**T-247 (電池が見つけた穴)**: 段を増やしたら、深い入れ子の弾でコンパイラが場所の無い RangeError のまま落ちた。式の入れ子に上限 (200 段) を置き、場所を名乗る M0 で断る。

**T-246 (この周の手探りが見つけた穴)**: 単項の `-` の入れ子 `- -a` が `--a` と出力され、符号の反転ではなく**減算代入**になった —— 引数・let を書き換える式で、引数への代入を断る M6 を単項の入れ子で迂回できた (0.1 から)。
直し: `-` の直後の単項 `-` は `-(-a)` と括って出す。

## 0.9 —— ブロックの本体を持つ arrow `(x) => { … }` を足した (MG-008 · 2026-11-01) と、その周で見つけた穴 (T-245)

足す前に破った: 本体が文の並びになると、外側の関数の役 (gate / sink) を**引き継いだまま**文が書ける。0.2 から在る式の arrow も同じだった ——
sink 関数が危ない口を包んだ閉包 `() => shell.openExternal(u)` を値として外へ返せ (M2 の「sink 関数の中だけ」が閉包の**呼び出し時**に外れる)、gate の中の arrow で `mint` も通った。

| 書き方 | 扱い |
| --- | --- |
| `(x) => { let y = …; return y; }` (let / const / return / if / for / 入れ子の arrow) | 通す。生成物は `(x) => {` + 本体 + `}` |
| `(x) => ({ a: x })` | 式の arrow のまま。**`=> {` は常にブロック**なので、オブジェクトを返すときは括弧で包む |
| 本体の中の `break` / `continue` | 断る (M0) —— arrow はループの外の関数で、外のループを跨げない |
| 本体の中の引数への代入 | 断る (M6) —— 引数は let ではない |
| 本体 (式・ブロック) と引数の既定値の中の危ない口・`mint`・戻り値の印 | **外側の役に関わらず plain の役で検める** —— sink / gate 関数の中の arrow でも使えない (T-245) |

- 引数と既定値は arrow の枠に入る (前の引数を参照できる・`number` と宣言した引数は添字の鍵に使える)。
- 先に破った手探り (閉包で危ない口を持ち出す・arrow で mint・arrow の外のループの break・引数への代入・宣言していない名前) で、塞がれていなかったのは役の引き継ぎだけだった。

## 0.8 —— 添字 `x[k]` を足した (MG-007 · 2026-11-01) と、その周の電池が見つけた穴 (T-244)

MG-003 で先送りした理由は「鍵を実行時に組めるので `x["constructor"]` が T-224 の表を迂回する」だった。塞ぎ方を先に決めてから足した:

| 書き方 | 扱い |
| --- | --- |
| `x["name"]` (識別子として読める文字列。`\u0063onstructor` の綴り違いも解いてから) | **`.name` に畳む** —— FORBIDDEN_MEMBERS・組み込みのメンバの表・`?.` の検めを `.name` とそのまま共有するので、迂回は構造上ありえない |
| `x[0]` `x[0x1]` `x["content-type"]` (数リテラル・識別子にならない文字列) | 添字のまま通す (禁じた名前にも組み込みのメンバにもなりえない) |
| `x[n]` `x[n - 1]` `x[xs.length - 1]` `x[Math.floor(n / 2)]` ほか**静的に数と分かる式** | 通す。**生成物は `x[+(…)]` で数に寄せる** —— 型の宣言は実行時には守られないので、`number` と宣言した引数へ `"constructor"` が渡されても NaN になり表に届かない |
| `x[u]` `x[u + "x"]` `x[typeof u]` `x[o.f()]` (文字列になりうる鍵) | M6 で断る。文字列で引く表は `Map` の `get` を使う |
| `x[k] = v` (添字への代入)・`x?.[k]` | 無い |

- **数と分かる式**: 数リテラル・`number` と宣言した (または数の初期値の) 名前・`-` `*` `/` `%`・両側が数の `+`・`.length`・`Math.m(…)`・`Number(…)`・両方の枝が数の条件演算子。
- **添字の結果は印を運ばない**ので洗浄にならない (`const v: VettedUrl = xs[0]` は M4)。印を受ける関数を配列に入れて `[openUrl][0](u)` と呼ぶ形も、`openUrl` を値として持ち出すので M4 で断る。
- 先に破った手探り 44 形で穴は 0 件 (禁じた名前の綴り違い 8 形・組み込みの表 3 形・動的な鍵 14 形・印の流れ・代入・`?.[`)。

**T-244 (この周の電池が見つけた穴)**: 揺さぶりが `[1].map((q = module) => q)` を受け入れた。**arrow の引数の既定値は式なのに検めを受けず**、plain 関数の中で宣言していない名前 (`fetch`)・
危ない口 (`shell.openExternal(raw)`)・印の無い値での印つきの口の呼び出しを既定値に隠せた (0.2 で arrow を足した時からの穴)。
全ての式の位置 (const / let / 代入 / return / throw / if / for / switch / case / オブジェクト / 配列 / 呼び出し / new / 条件 / 2 項 / 単項 / await / field / メンバ / 添字 / arrow の本体 / 式文 / try / catch / 呼ぶ側 /
引数の既定値 / モジュールの const) に `fetch("x")` を置く総当たり 37 位置で、検めを受けなかったのはここだけだった。直し: arrow の case で既定値も検める。

**移せた壁**: 添字だけが足りない壁は `aiEndpoint.ts` `vaultToken.ts` `updateCheck.ts` `dataCrypto.ts` と `safeFilename.ts` (検出器が正規表現の字面 `[0-9]` を添字と数えていた偽陽性) だが、
どれも他の構文 (テンプレート・`as`・c-for・`non-null`) も要る。この周で移せた壁は 0 本 (言語の幅を広げた周)。

## 0.7 —— 組み込みの名前を値として持ち出せない (T-243 · MG-006 · 2026-11-01)

言語の穴探しの周 (攻撃の電池を 5 つの種で多めに回して緑 → 電池の弾に無い領域を手で組み合わせた) で見つけた:
`Object.freeze` は自前の表を凍らせるために許してあるが、`Array` / `Math` / `JSON` / `Promise` / `String` / `Number` / `Boolean` / `Map` / `Set` の**名前を値として**
渡せたので、`Object.freeze(Array)` で**アプリ全体の組み込みの構築子を凍らせられた** (`Promise.x = …` を後から足すコードが strict mode で投げる)。

直し: この 9 つも、`Object` / `RegExp` / `Error` / `URL` (0.4 までに断り済み) と同じく、**メンバを直に使う (`Math.floor`)・呼ぶ (`String(x)`)・構築する (`new Map()`)** 形でだけ
名前で使える。別名・引数・配列・条件演算子・`typeof` 越しの持ち出しは M6 で断る。電池の判定器にも同じ物差しを独立に書いた (`PLAIN_BUILTIN_NAMES`)。

- **使えなくなった形**: `xs.filter(Boolean)` / `xs.map(String)` —— `xs.filter((x) => Boolean(x))` と書く (実物の `.mamori` 11 本には無かった)。
- **残る形 (正直に)**: 組み込みの**関数**を凍らせる `Object.freeze(Math.floor)` は通る。関数は静的な欄を後から足される側ではなく、全体への効き目が無い。
- **この周で手探りして穴ではなかった物**: `?.` の周りの 17 形 (代入・`++`・空白・改行・unicode escape・ZWSP・三項との取り違え・`??.`・`delete`・`in` ほか) は全部断られるか、
  意図どおりに通った。`Symbol` / `Reflect` / `globalThis` は宣言していない名前 (M6)。`o.valueOf()` / `o.toString()` / `o.hasOwnProperty()` は読むだけ。

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

## 攻撃の電池が見つけた穴 (T-235〜T-240 · 2026-10-31 · パス 572)

人が 1 つずつ攻める (T-232〜T-234) のをやめ、**弾 × 文脈 × 環境を掛け合わせて数万のプログラムを引き、受け入れた生成物を
TypeScript の構文解析器で独立に判定する**機械 (`mamoriBattery.test.ts`) を足した。**Mamori の字句の切れ目と TypeScript の切れ目が
違えば、検めを受けないコードが生成物に現れる**ので、判定は Mamori の規則を借りずに構文木で書き直した。固定の種 3 つで毎回の `npm test`、
`npm run audit:mamori-battery` は時刻から新しい種を引いて多く回す。初回の実行と揺さぶり (fuzz) で 6 件:

| 脅威 | 穴 | 直し |
| --- | --- | --- |
| T-235 | 注記と文字列の中に bidi・不可視・制御・行/段落区切りを**裸で**置けた (Trojan Source) | HIDDEN_CHARS を M0 で断り `\uXXXX` と綴らせる (ZWJ/ZWNJ は絵文字の連結に要るので通す) |
| T-236 | `\'` や `\x41` の文字列で、診断でなく `SyntaxError` でコンパイラごと落ちた | `JSON.parse` を包み位置つきの M0 にする |
| T-237 | 正規表現の字面は T-235 の外だった (`/(U+202E)//` が通った) | 字句の全部 (注記・文字列・正規表現) に同じ検め |
| T-238 | 印を受ける引数を**渡さない**呼び出し `openUrl()` が M4 を素通り (以前の検査が「数は tsc に任せる」と固定していた) | 欠落も M4 で断る |
| **T-239** | **型の綴りは深さ 0 の `;` を断らず、`export const C: number; fetch("x"); const D: number = 1;` のように型の位置へ別の文を隠せた** (M6 を受けない `fetch` が生成物へ入る。変換後の tsc は `const` の初期化の欠落で止めるが、Mamori の検めが 1 層欠けていた) | 深さ 0 の `;` を M0 で断る (オブジェクト型の欄の区切りは深さ 1) |
| T-240 | `.__defineGetter__` ほか古い getter/setter の口が表に無かった | FORBIDDEN_MEMBERS に 4 つ |
| T-241 | 複数ファイルの手探りが見つけた: `use { open alias o }` の別名と、別のモジュールの同名の非 export の関数が、本物の sink の外形 (どの引数が印を受けるか) を隠し、M4 が外れた。export していない名前の use と名前の二重宣言も通った | 外形の鍵を `道 + 名前` にし use を道で解く (`resolveUse`)・export していない名前の use と二重宣言を M6 で断る |

**電池の強さは対照で測った**: T-233〜T-240 の修正を 1 つずつ元へ戻すと、電池 (専用の回帰検査ではなく) が落ちる —— T-233 (専用の文脈 `bidiInComment`)・
T-234 (`sinkTyped*` の文脈と印の型の判定)・T-232 (`RegExp.$1`)・`.constructor`・宣言していない名前・T-235 の文字列・T-239 (`typeSmuggle*`)。
判定の物差しの偽陽性は、実物の `.mamori` 11 本が全部通ること、わざと穴を開けた生成物 13 形を落とすことで確かめる。

**まだ電池が持っていない物 (正直に)**: 型の綴りは「そのまま写す」ままで、深さ 1 以上の中身 (オブジェクト型・関数型) が型として正しいかは
変換後の tsc に任せる (型は実行されない) / 生成物を型検査まで掛けない (構文木だけ・速さのため) / 複数ファイルの組み合わせは「別の module が宣言した sink を使う」1 形だけ /
実行環境の差 (Node のバージョンごとの字句の差) は持たない。

**型の位置の追加の手探り (2026-10-31 · 電池を 6 種で最大 20,000 周回したあとに手で確かめた)**: 型の綴りから実行時の式を逃がす形 —— 引数の既定値 (`a: string = fetch("x")`)・`->` の後ろの `;`・戻り値の型に続く式 —— は、どれも宣言していない名前 (M6) か深さ 0 の `;` で断られた。通ったのは `typeof fetch` と `import("child_process").X` を型の位置に書く形だけで、型は実行時に消えるので実行されない (変換後の tsc も型として扱う)。穴ではなく、**意図して残している**。

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
- 言語は 0.11 で、守りの層を書くのに要る構文しか持たない (0.3 で 16 進の数を、0.2 でオブジェクトの字面・条件演算子・switch・throw・for…of・type / interface・field を足した。**クラス・計算した鍵 `{ [k]: v }`・展開・後置の `!` は無い (0.6 で `a?.name`、0.8 で数と分かる鍵の添字 `x[k]` だけ、0.9 でブロックの本体を持つ arrow、0.10 でビット演算だけ足した)** —— 文字列の鍵を実行時に組む形は、T-224 の表 (`.constructor` を断る) を迂回する道になる)。**JSX も無い**ので、`<img>` の口 (`VettedImg.tsx`) と `<a href>` の口 (`VettedLink.tsx`) は TypeScript で書き、守りは型の印と census (素の `<img` と動的な素の `<a href={…}>` はこの部品の外に無い) が持つ。
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
