import { countChars } from './inputCeiling';
/**
 * アドバイザーの「質問」が受け取る入力の規則 —— **両ビルドで 1 つだけ持つ。**
 *
 * ## なぜ要るか (2026-08-25)
 *
 * `business/advise` と `stocks/advise` は、利用者の質問をそのまま
 * **有料 API (Anthropic) の要求本文へ載せる**。その手前の検査は
 * 「空でない / 1000 字以内 / 改行・制御文字を含まない」の 3 つで、
 * **4 か所に字面で書かれていた**:
 *
 * ```
 *   main/clients/business.ts:640      question.length > 1000
 *   main/clients/stocks.ts:1242       question.length > 1000
 *   renderer/web-shim.ts:458          question.length > 1000   (business)
 *   renderer/web-shim.ts:567          question.length > 1000   (stocks)
 * ```
 *
 * 同じ判断を 4 度書くと、**片方だけ動かしたときに誰も気付かない**。
 * `main` 側は IPC の**信頼境界**なので、そちらが緩むと乗っ取られた
 * レンダラーが利用者の鍵で長い本文を送れる。ブラウザ側が緩むと、
 * 同じことが利用者自身の操作で起きる (費用の話)。
 *
 * このリポジトリは同じ形を既に 3 度consolidate している ——
 * `assistantLimits.ts` / `emotionsLimits.ts` / `recordEntryLimits.ts`。
 * ここだけ残っていた。
 *
 * ## 見つけ方 (自分の取りこぼしの記録)
 *
 * この重複は、**両側に現れる数値リテラルを数える検出器**が既に
 * 挙げていた (2026-08-25 の「自動では見つけられないを確かめた」節)。
 * `1000` は `main/clients/business.ts` と `renderer/web-shim.ts` の
 * 両方に出ていたのに、**「たまたま同じ丸い数」として捨てた**。
 * 検出器は当てていて、**選り分けたほうが間違っていた**。
 *
 * ## 値
 *
 * 既に 4 か所すべてが同じ値なので、そのまま採る (挙動は変えない)。
 */

/** アドバイザーの質問の上限。 */
export const MAX_ADVISOR_QUESTION_CHARS = 1000;

/**
 * 質問として受け取ってよいか。**判断はここ 1 つ**。
 *
 * 戻り値は失敗の理由 (`null` なら通す) —— 呼び出し側が
 * それぞれの流儀 (`throw` / `err()`) で伝えられるようにする。
 */
export type AdvisorQuestionProblem = 'empty' | 'too-long' | 'control-chars';

export function checkAdvisorQuestion(question: unknown): AdvisorQuestionProblem | null {
  if (typeof question !== 'string' || question.length === 0) return 'empty';
  if (countChars(question) > MAX_ADVISOR_QUESTION_CHARS) return 'too-long';
  // CR / LF / NUL。要求本文とログの両方で行を割られないようにする。
  if (/[\r\n\0]/.test(question)) return 'control-chars';
  return null;
}

/**
 * 理由ごとの断りの文 —— **両ビルドで 1 つだけ持つ (パス 285)。**
 *
 * 上の docblock は「呼び出し側がそれぞれの**流儀** (`throw` / `err()`) で
 * 伝えられるように」戻り値を理由にした、と述べている。その決定はここでも
 * 生きている —— 変えたのは**運び方ではなく文**である (main は今も `throw`、
 * ブラウザ版は今も `err('action_failed', …)`)。
 *
 * ## なぜ文も 1 つにするか (実測 2026-09-15)
 *
 * 判定 (`checkAdvisorQuestion`) は 2026-08-25 から共有されていたのに、
 * **文は 4 か所に 2 通りで書かれていた** —— main の 2 か所が英語
 * (`question is required` / `question exceeds 1000 chars`)、
 * ブラウザ版の 2 か所が日本語。main の文は `safeErrorMessage` を通って
 * **そのまま画面へ出る** (`redact.ts` は伏字にするだけで翻訳はしない) ので、
 * **日本語の画面にだけ英語が出ていた** —— しかも同じ操作が
 * ブラウザ版では日本語で断られる。この食い違いはどちらのビルドを見ても
 * 分からない (画面が 1 つずつしか見えない)。
 *
 * ## この家系の中での重さ (パス 285 で分けた)
 *
 * **「判定が写しか、文だけが写しか」で重さが違う。**
 * `scanTarget` の HIBP は**判定そのものが写し**で、2026-08-22 に片側の
 * `.trim()` が落ちて「どの漏洩にも含まれない」という**偽の安心**を返した
 * (だから共有したのは文ではなく述語である)。こちらは判定が最初から
 * 1 つなので、写しが生む害は**文の食い違いだけ**で、安全の主張は乗って
 * いない。それでも直す理由は「日本語の画面に英語が出る」ことが
 * それ自体で欠陥だから —— 重さを同じだと述べないために、ここに書く。
 */
export const ADVISOR_QUESTION_MESSAGES: Readonly<Record<AdvisorQuestionProblem, string>> = {
  empty: '質問を入力してください',
  'too-long': `質問が長すぎます (${MAX_ADVISOR_QUESTION_CHARS} 字以内)`,
  'control-chars': '質問に改行・制御文字を含めることはできません',
};

// ---------------------------------------------------------------------------
// ユニバース (銘柄の許可リスト)
// ---------------------------------------------------------------------------

/**
 * アドバイザーのユニバース (助言の対象にする銘柄) の上限 —— **両ビルドで 1 つだけ持つ。**
 *
 * ## なぜここに移したか (2026-09-09 · パス 105)
 *
 * 上の「質問」の上限は 2026-08-25 にここへ寄せたが、**同じ関数の 25 行下に在った
 * ユニバースの上限は置いていかれた**。そして 2 つの実装が同じ 25 を**正反対に**
 * 扱っていた:
 *
 * ```
 *   main/clients/stocks.ts:1268   if (universeList.length > 25) throw   ← 断る
 *   renderer/web-shim.ts:612      watch.slice(0, 25)                   ← 黙って切る
 * ```
 *
 * この本の上のほうに「同じ判断を 4 度書くと、片方だけ動かしたときに誰も気付かない」と
 * 書いてある。**動かさなくても、最初から食い違っていた。**
 */
export const MAX_ADVISOR_UNIVERSE_SYMBOLS = 25;

/**
 * ティッカー 1 つの長さの天井 —— **両ビルドと画面で 1 つだけ持つ** (2026-09-09 · パス 112)。
 * それまで `16` は main (`isSafeTicker`)・ブラウザ版の双子 (`stocksWatchlistWeb.ts`)・
 * `StocksPage` の `maxLength` ×2 に**字面で 4 度**書いてあった (上の「質問」の上限が
 * 2026-08-25 に寄せられたときと同じ形)。
 */
export const MAX_TICKER_CHARS = 16;

/** 上限に収めたユニバースと、**外した件数**。 */
export interface CappedAdvisorUniverse {
  /** 助言の対象にする銘柄 (最大 {@link MAX_ADVISOR_UNIVERSE_SYMBOLS} 件)。 */
  readonly symbols: readonly string[];
  /** 上限のために外した件数。0 なら全部見ている。 */
  readonly omitted: number;
}

/**
 * ユニバースを上限に収める。**外した件数を一緒に返すので、黙って切れない。**
 *
 * 「答えは利用者の一覧について」と画面が述べるなら、一覧の一部しか見ていないことも
 * 述べなければならない (パス 103 / 104 と同じ形 —— 内部の境界で切ったなら、それを
 * 値と一緒に運ぶ)。
 */
export function capAdvisorUniverse(symbols: readonly string[]): CappedAdvisorUniverse {
  return {
    symbols: symbols.slice(0, MAX_ADVISOR_UNIVERSE_SYMBOLS),
    omitted: Math.max(0, symbols.length - MAX_ADVISOR_UNIVERSE_SYMBOLS),
  };
}

// ---------------------------------------------------------------------------
// 鍵が無いときの断り
// ---------------------------------------------------------------------------

/**
 * Anthropic の鍵が保存されていないときの断り —— **3 つの画面と両ビルドで 1 つだけ持つ**
 * (2026-09-24 · パス 451)。
 *
 * ## 直す前の実測 (実物の handler に空のトークンを渡し、偽の fetch で要求を読む)
 *
 * | handler | 空のトークンで何が起きたか | 網を叩いた回数 | 利用者が読む文 |
 * | --- | --- | ---: | --- |
 * | `emotions/analyze-text` | 送る前に断る | **0 回** | 英語の 1 文 (下記) |
 * | **`stocks/advise`** | **空の鍵で送る** | **1 回** | 相手の 401 の本文 |
 * | **`business/advise`** | **空の鍵で送る** | **1 回** | 同形 |
 *
 * ★ **利用者が読むのは相手が返した「x-api-key が不正」で、それは原因を取り違えさせる**
 * —— 鍵は不正ではなく**存在しない**。読んだ人は「鍵を貼り直す」へ行くが、
 * **デスクトップ版にはこの鍵を置く口がどの画面にも無かった** (実測: 資格情報を書くのは
 * `StatusBar` の `tokenSetup` だけで、株式と事業ダッシュボードはそれを渡していなかった)。
 * パス 388 の「原因を取り違えた断りは、直す手ごと誤らせる」の、**直す手が存在しない**形である。
 *
 * ★ **同じ質問に同じアプリが 2 通り答えていた** —— ブラウザ版の 2 つは
 * `anthropic` のスロットを読み**断って逃げ口を名乗る**のに、main は
 * サービスのスロット (`stocks` / `business`) を読み、**どちらのスロットにも書く口が無かった**。
 * `emotions` だけが 3 つとも揃っていた (サービスのスロット・`tokenSetup`・門)。
 * パス 402 / 407 と同じ「**弱い方が main に立っている**」形。
 *
 * ★ **なぜ既存の census が見なかったか** —— パス 284 / 285 は「両ビルドに双子が在る断り」を
 * 数えたので、**片側が 0 件の組は母集団に入らない**。パス 450 の「読み手が在って書き手が 0 件」と
 * 同じ死角 (対を数える走査は、片方が無い物を見ない)。
 *
 * ## 文を 1 つにする
 *
 * 上の `ADVISOR_QUESTION_MESSAGES` の docblock が「main の文は `safeErrorMessage` を通って
 * **そのまま画面へ出る**ので、日本語の画面にだけ英語が出ていた」と書いている ——
 * `emotions` の main はまだ英語 (`Anthropic API key required for analyze-text`) だった。
 * 3 つの画面が同じ 1 文を使う。
 *
 * 名乗る口は **`StatusBar` の `tokenSetup` のラベル**で、3 画面とも同じ綴りである
 * (`namedControlExists` の台帳が `screen-label` として縛る)。
 */
export const MISSING_ANTHROPIC_KEY_MESSAGE =
  'Anthropic API キーが未設定です。上の「Anthropic API キー」から設定してください';
