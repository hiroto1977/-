/**
 * AI コンシェルジュ (`components/ChatbotWidget.tsx`) の自由質問を、端末内の
 * モデルへ回すときの**判定と文**を 1 か所に置く (2026-09-24 · パス 449)。
 *
 * ## 直す前: 書き手が 0 件の鍵が行き先を決めていた
 *
 * `tryOllama` はモデル名を `localStorage.getItem('chatbot-ollama-model') ?? 'llama3.2'`
 * で決めていた。実測 (2026-09-24 · 出荷コード全体の走査):
 *
 * | 測った物 | 実測 |
 * | --- | --- |
 * | `chatbot-ollama-model` へ**書く**出荷コード | **0 件** (消す側 `security/eraseAll.ts` と台帳が名を挙げるだけ) |
 * | したがって widget が送るモデル | **常に `llama3.2`** |
 * | `npm run ollama:setup` が入れるモデル | **`llama3.2:1b`** (`DEFAULT_SETUP_MODEL`) |
 *
 * **アプリ自身の導入手順に従った利用者に対して、既定が外れる。** しかも
 * `OllamaPage` と `scripts/ollama-cli.cjs` は `ollama pull llama3.2` を勧めるので
 * (そちらは `llama3.2:latest` になり、素の `llama3.2` で当たる)、**同じアプリの
 * 2 つの導入手順が別のモデルを入れ、widget はその片方にしか当たらない名前を
 * 直書きしていた**。だから名前は推測せず**導入済みの一覧から決める** ——
 * 寄せ方はアプリが既に持つ `suggestInstalledModel` (タグ補完 → 前方一致)。
 *
 * ## そして断りを捨てていた
 *
 * `if (!res.ok) return null;` —— 実測 (2026-09-24 · 直す前 · 実物の widget を
 * jsdom で描いて自由質問を打つ):
 *
 * | | |
 * | --- | --- |
 * | アプリが組んだ助言 | 「モデル「llama3.2」がまだ取得されていません。」+「インストール済みの「llama3.2:1b」を指定すると動きます。」 |
 * | 画面に出た助言 | **0 文字** |
 * | 画面に出た文 | 「🤔 うまく解釈できませんでした。… **Ollama 接続時は自由質問にもお答えします。**」 |
 *
 * ★ **その 1 文は、その利用者にとって偽である** —— 接続しており、アプリは実際に
 * 試し、失敗の原因も直す手も**変数に持ったまま捨てていた**。読んだ人は
 * 「自分は繋がっていないのだ」と読み、Ollama の導入をやり直す —— **直すべきは
 * モデル名である** (パス 388 の「原因を取り違えた断りは、直す手ごと誤らせる」)。
 *
 * ## 文は data 層が持つ
 *
 * `.tsx` は変異検査の母集団の外なので、どちらの文が出るかを誰も測れない
 * (パス 386 / 445 と同じ判断)。
 */
import {
  DEFAULT_SETUP_MODEL,
  isSafeModelName,
  suggestInstalledModel,
} from '../../shared/ollama';
import { MAX_LOCAL_MODEL_ERROR_CHARS, redactForMessage } from '../../shared/redact';

/**
 * モデル名の上書き。**今日この鍵へ書く出荷コードは 0 件** (上の表) なので、
 * 読みは「手で置いた人を尊重する」ためだけに残す —— 機能そのものは
 * {@link chatbotOllamaModel} が導入済みの一覧から決めるので、この鍵が
 * 空でも自由質問は通る。
 */
export const CHATBOT_MODEL_KEY = 'chatbot-ollama-model';

/**
 * 自由質問を回すモデルを決める。
 *
 * 順序に意味がある:
 *   1. 手で置いた上書きが導入済みに在るなら、それ (利用者の意思が最優先)
 *   2. 一覧が読めないなら、上書き or アプリの既定 (推測しようがない)
 *   3. 種 (上書き or 既定) が導入済みに在るなら、それ
 *   4. アプリ自身の寄せ (`suggestInstalledModel`) が当てた物
 *      —— `ollama pull llama3.2` で入る `llama3.2:latest` はここで当たる
 *   5. **導入済みが 1 つだけならそれ** —— 選択肢が 1 つしか無い人に
 *      「入っていないモデル」を投げて断るのは、利用者の損にしかならない
 *   6. それ以外は種のまま返す —— 断りが `現在あるモデル: …` を並べる
 */
export function chatbotOllamaModel(override: unknown, installed: readonly unknown[]): string {
  const list = installed.filter((n): n is string => isSafeModelName(n));
  const seed = isSafeModelName(override) ? override : DEFAULT_SETUP_MODEL;
  if (list.length === 0) return seed;
  const want = seed.toLowerCase();
  if (list.some((n) => n.toLowerCase() === want)) return seed;
  const near = suggestInstalledModel(seed, [...list]);
  if (near !== '') return near;
  return list.length === 1 ? list[0]! : seed;
}

/**
 * 逃げ口を名指しする 1 文。**この widget にモデルを選ぶ口は無い**ので、
 * 選べる場所 (Ollama の画面の一覧) を言う (法則 `escape-hatch-stays-open`)。
 */
export const CHATBOT_OLLAMA_ESCAPE =
  '入っているモデルは「Ollama」の画面で確かめられます。';

/**
 * 端末内のモデルが答えなかったことを述べる 1 文。
 *
 * **原因はアプリが既に組んでいる** (`describeOllamaError`) ので、ここでは
 * 作り直さずそのまま運ぶ —— 作り直すと「計算が使った理由」と「画面が述べる
 * 理由」が食い違う (パス 401 の形)。伏字と天井は `redactForMessage` を通す
 * (第三者 = 利用者が設定した Ollama ホストの文が混ざりうる · パス 290)。
 */
export function ollamaRefusalNote(message: unknown): string {
  const detail =
    typeof message === 'string'
      ? redactForMessage(message, MAX_LOCAL_MODEL_ERROR_CHARS).trim()
      : '';
  return detail === ''
    ? `⚠ 今回は端末内のモデルが答えませんでした。${CHATBOT_OLLAMA_ESCAPE}`
    : `⚠ 今回は端末内のモデルが答えませんでした: ${detail} ${CHATBOT_OLLAMA_ESCAPE}`;
}
