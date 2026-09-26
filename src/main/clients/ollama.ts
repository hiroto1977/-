/**
 * Ollama integration with defense-in-depth against the family of CVEs
 * documented in docs/OLLAMA_SECURITY.md (Probllama / CVE-2024-37032
 * and the 0.1.46 batch). The design constrains attack surface to:
 *
 *   - URL pinned to http://127.0.0.1:11434 — cannot be reconfigured at
 *     runtime even via a compromised renderer, so the IPC channel can
 *     never trick main into hitting a different host.
 *   - Only the read endpoints the shared ledger permits
 *     (`OLLAMA_READ_PATHS` in src/shared/ollama.ts — the same ledger the
 *     browser build gates on). The CVE-prone write endpoints are not in it,
 *     so they are refused at the fetch boundary. They are enumerated once,
 *     at `ALLOWED_ENDPOINTS` below — listing them twice adds forbidden
 *     spellings for lint:forbidden to suppress without adding any defence.
 *   - Strict model-name validation (no path traversal in `model:` field).
 *   - Hard request timeout (30s) via AbortController.
 *   - Response body truncated to MAX_RESPONSE_BYTES.
 *   - Version-comparison gate that surfaces a "vulnerable" badge if the
 *     local Ollama is older than MIN_SAFE_VERSION.
 */

import { parseJsonText } from '../../shared/apiResponse';
import { clampToCeiling, countChars } from '../../shared/inputCeiling';
import {
  FetchError,
  redactForMessage,
  MAX_WARNING_BODY_CHARS,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
// 判定ロジックは main / renderer 共通 (src/shared/ollama.ts) に 1 つだけ置く。
// ブラウザ版 (renderer/network/ollamaWeb.ts) が同じ制約で動くための単一の真実。
import {
  MAX_OLLAMA_PROMPT_CHARS,
  MAX_OLLAMA_SYSTEM_CHARS,
  MIN_SAFE_VERSION,
  OLLAMA_READ_PATHS,
  adviseFromBody,
  buildWarnings,
  compareVersions,
  isSafeModelName,
  normalizeModels,
  isVersionSafe,
  type OllamaSnapshot,
} from '../../shared/ollama';
import { capAssistantReply, inputTooLongMessage } from '../../shared/assistantLimits';
import type { ActionData } from '../../shared/actionData';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_OLLAMA_RESPONSE_BYTES,
  OLLAMA_CHAT_TIMEOUT_MS,
  egressInit,
  isOverCap,
  isRedirectResponse,
  readBodyWithCap,
  readFailureBody,
  redirectRefusal,
} from '../../shared/httpLimits';

// 既存の import 元 (このモジュール) を維持するため再 export する。
export { MIN_SAFE_VERSION, compareVersions, isSafeModelName, isVersionSafe };
export type { OllamaSnapshot };

const OLLAMA_BASE = 'http://127.0.0.1:11434';
/**
 * **疎通確認 (`/api/version` / `/api/tags`) の締切。** 生成はこれではなく
 * `OLLAMA_CHAT_TIMEOUT_MS` (2 分) を使う —— 別の要求なので別の数である。
 *
 * 2026-09-23 (パス 424) まで、ここは `30_000` という**私有の写し**で、
 * しかも `withTimeout` の既定引数だったので**生成にも掛かっていた**。
 * 画面の「セキュリティポリシー」欄はこの数を直書きしており、renderer は
 * `src/main/` から import できない (`lint:imports`) ので定数から出せなかった。
 * `shared` の同じ値を読むことで、画面もそこから出せるようになった。
 */
const REQUEST_TIMEOUT_MS = DEFAULT_HTTP_TIMEOUT_MS;
// 応答本文の上限は **`shared/httpLimits.ts` の 1 つ** (2026-09-20 · パス 336)。
// 2026-08-23 から 2026-09-20 まで、ここだけ 10 MB・ブラウザ版だけ 2 MB だった ——
// 実測して 2 MiB に揃えた (理由と数字は `MAX_OLLAMA_RESPONSE_BYTES` の docblock)。
const MAX_RESPONSE_BYTES = MAX_OLLAMA_RESPONSE_BYTES;

/**
 * Hard allowlist of Ollama endpoints this client is permitted to touch.
 * Enforced at the fetch boundary so that even an accidental future call to
 * /api/pull, /api/create, /api/push, /api/copy, /api/delete, /api/blobs or
 * /api/upload is refused at runtime — those are the endpoints implicated in
 * CVE-2024-37032 (Probllama), the CVE-2024-39719/20/21/22 quartet and the
 * model / engine file-parser bugs listed in `OLLAMA_ADVISORIES`
 * (`src/shared/ollama.ts`). Snapshot + chat never need them.
 *
 * **どの経路を許すかは `OLLAMA_READ_PATHS` (shared) が 1 つだけ持つ。**
 * 2026-09-14 まで、ここは同じ 3 本を**手で書き写して**いた —— ブラウザ版は
 * `parseOllamaEndpoint` を通して台帳を読み、こちらは読んでいなかったので、
 * 台帳に 1 本足せば片方の門だけが広がり (逆も同じ)、**どちらの検査も鳴らない**。
 * 綴りを写すのをやめて台帳から組み立てる。ここは base が固定なので、
 * 台帳の相対パスを 1 つの base に付けるだけでよい。
 *
 * (`OLLAMA_ADVISORIES` の版は台帳が持つ。ここに「未修正」と書くと、
 * 修正版が出た日にこのコメントだけが古びる —— 実際に 1 度そうなった。)
 */
const ALLOWED_ENDPOINTS = new Set<string>(
  OLLAMA_READ_PATHS.map((apiPath) => `${OLLAMA_BASE}${apiPath}`),
);

export function isAllowedEndpoint(url: string): boolean {
  return ALLOWED_ENDPOINTS.has(url);
}





interface OllamaModelTag {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModelTag[];
}

interface OllamaVersionResponse {
  version: string;
}


/** Wraps fetch in a per-request timeout. Returns the response, throws
 *  if the timeout fires or the server is unreachable. */
async function withTimeout<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  consume: (res: Response) => Promise<T>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  // Stryker disable next-line ConditionalExpression: belt-and-braces.
  // The only callers feed URLs from `${OLLAMA_BASE}/api/...` constants
  // that are all in ALLOWED_ENDPOINTS by construction. The runtime check
  // here defends against future regressions (a new caller forgetting
  // to use a constant). Mutating to `false` simply removes the
  // additional defense layer; no live attack reaches this code.
  // Stryker disable BlockStatement,StringLiteral
  if (!isAllowedEndpoint(url)) {
    // Belt-and-braces: every Ollama HTTP call goes through this helper,
    // so the allowlist refusal here covers any future code path that
    // forgets to use a constant.
    throw new FetchError(
      `ollama endpoint not in allowlist: ${url}`,
      0,
      'ollama',
    );
  }
  // Stryker restore BlockStatement,StringLiteral
  const controller = new AbortController();
  // Equivalent in unit tests: the mock `fetch` resolves synchronously,
  // so the timer never fires. Provoking the abort path requires a real
  // hanging connection, which only an integration test could supply.
  // Stryker disable next-line ArrowFunction
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  /*
   * **本文を使い終えるところまでを締切の中に入れる。**
   *
   * ここは 2026-08-28 まで `Promise<Response>` を返しており、`res.json()` /
   * `res.text()` は呼び出し側 —— つまり `clearTimeout` の**後**で走っていた。
   * その時点のコメントは「timer が発火する頃には await は解決済みなので、
   * controller.signal を見ている者は居ない」と書いていたが、**居た**。
   * 本文を読んでいる最中の reader がそれである。相手が loopback でも、
   * ヘッダだけ返して本文を垂れ流さないモデルには当たりうる。
   */
  // Stryker disable BlockStatement
  try {
    const res = await fetchFn(url, egressInit({ ...init, signal: controller.signal }));
    // 転送には追随しない (規則は httpLimits.ts)。
    if (isRedirectResponse(res)) throw new Error(redirectRefusal(res, url, 'Ollama'));
    return await consume(res);
  } finally {
    clearTimeout(timer);
  }
  // Stryker restore BlockStatement
}

export async function fetchOllamaSnapshot(ctx: FetchContext): Promise<OllamaSnapshot> {
  const f = ctx.fetch ?? fetch;
  const warnings: string[] = [];
  let version = '';
  let running = false;

  try {
    await withTimeout(f, `${OLLAMA_BASE}/api/version`, {}, async (res) => {
      if (res.ok) {
        // 成功側の本文にも上限を掛ける (パス 330) —— `withTimeout` は締切と
        // endpoint の allowlist しか見ず、`parseJsonBody` は `res.json()` を
        // 素で呼ぶ。ブラウザ版の同じ読み (`readJsonCapped`) は切っていた。
        const body = parseJsonText(
          await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'Ollama /api/version'),
          'Ollama /api/version',
        ) as OllamaVersionResponse;
        version = body.version ?? '';
        running = true;
      } else {
        warnings.push(`Ollama /api/version returned HTTP ${res.status}`);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // `warnings[]` も renderer へ届く文言なので**伏字の合流点を通す**。
    // 相手が loopback でも、例外の文言は fetch の実装や下位ライブラリ由来で
    // 何が入るか決められない (2026-08-23 に実測で漏れを確認)。
    warnings.push(`Ollama unreachable at ${OLLAMA_BASE}: ${redactForMessage(msg, MAX_WARNING_BODY_CHARS)}`);
  }

  const versionSafe = isVersionSafe(version);
  if (running) {
    // 文面は両ビルドで 1 つ (shared の buildWarnings): 当てはまる CVE の名指し + 日付つきの台帳の注意。
    // 2026-09-09 までここは独自の英文と「未パッチ」の固定文だった (パス 139)。
    warnings.push(...buildWarnings(version));
  }

  const models: OllamaSnapshot['models'] = [];
  if (running) {
    try {
      await withTimeout(f, `${OLLAMA_BASE}/api/tags`, {}, async (tagsRes) => {
        if (!tagsRes.ok) {
          // Equivalent mutant on the third arg ('ollama' → ''): this
          // FetchError is caught by the surrounding try/catch on the very
          // next lines and only `.message` propagates into warnings, so
          // the serviceId is never observable from outside the function.
          // Stryker disable next-line StringLiteral
          throw new FetchError(`tags HTTP ${tagsRes.status}`, tagsRes.status, 'ollama');
        }
        const tags = parseJsonText(
          await readBodyWithCap(tagsRes, MAX_RESPONSE_BYTES, 'Ollama /api/tags'),
          'Ollama /api/tags',
        ) as OllamaTagsResponse;
        /*
         * **モデル一覧の読みは `shared/ollama.ts` の `normalizeModels` ただ 1 つ**
         * (2026-09-22 · パス 407)。
         *
         * 直す前、ここは 6 欄を素で読む**もう 1 つの読み手**だった —— ブラウザ版が
         * 通る `normalizeModels` は ① 物でない項目を飛ばし ② **`isSafeModelName` で
         * 名前を検め** ③ `Number.isFinite` で大きさを ④ 残り 4 欄を `typeof` で
         * 検めるのに、main は `??` だけで読んでいた。`??` は **null / undefined しか
         * 受けない**ので、第三者 (利用者が設定した Ollama ホスト) が非文字列を返すと:
         *
         *   modified_at: 20260922 → `(… ?? '').slice` が **TypeError**
         *   size: '1MB'          → `Math.round(NaN)` = **NaN MB** を画面に刷る
         *   name: 非文字列        → **`isSafeModelName` を通らないまま**画面へ
         *
         * 実測 (直す前・3 件中 2 件目が非文字列): **2 件 push した所で投げ**、
         * 外側の catch が warning にするので、利用者は**黙って短くなった一覧**を見る
         * (「Listing models failed」は出るが、何件落ちたかは分からない)。
         *
         * パス 402 と同じ形 —— **同じアプリが同じ問いに 2 通り答え、弱い方が main に
         * 立っていた**。`isSafeModelName` は main も import しているのに、
         * 使っていたのは chat の model 引数 (279 行) だけだった。
         *
         * ★ **パス 407 はここに `.slice(0, 10)` を残していた** (「整形は呼び手が
         *   持つ」) —— その結果**同じ `OllamaPage` が build によって `2026-09-22` と
         *   `2026-09-22T10:00:00.277302595-07:00` を出して**いた。パス 408 で
         *   `normalizeModels` が `YYYY-MM-DD` か `null` を返すようにしたので、
         *   ここは**素通し**になる。日付にするのは**正規化**であって画面の都合ではない
         *   (`isoDate.ts` の `isoDateFromTimestamp` が「呼び出し側 3 か所が同じ
         *   `slice(0, 10)` を写していた」と書いている当の 4 つ目の写しだった)。
         */
        for (const m of normalizeModels(tags)) models.push(m);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Listing models failed: ${redactForMessage(msg, MAX_WARNING_BODY_CHARS)}`);
    }
  }

  return {
    running,
    version,
    versionSafe,
    versionMinRecommended: MIN_SAFE_VERSION,
    models,
    warnings,
  };
}

// --- write-side actions --------------------------------------------------

interface ChatPayload {
  model: string;
  prompt: string;
  /** Optional system prompt; defaults to a generic one. */
  system?: string;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message?: OllamaChatMessage;
  done?: boolean;
  total_duration?: number;
}

/**
 * 失敗の助言に添える**導入済みモデル名**。取れなければ空 —— 助言が名前を
 * 挙げないだけで、失敗ではない (ブラウザ版の `listInstalledModels` と同じ判断)。
 * 呼ぶのは失敗の枝だけなので、正常な生成に往復は増えない。
 */
async function installedModelNames(fetchFn: typeof fetch): Promise<string[]> {
  try {
    return await withTimeout(fetchFn, `${OLLAMA_BASE}/api/tags`, {}, async (res) => {
      if (!res.ok) return [];
      const tags = parseJsonText(
        await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'Ollama /api/tags'),
        'Ollama /api/tags',
      );
      return normalizeModels(tags).map((m) => m.name);
    });
  } catch {
    // 一覧が引けない理由 (接続断・締切・壊れた本文) は**この経路の結論を
    // 変えない** —— 助言は既に組めており、名前を添えられないだけである。
    return [];
  }
}

async function chat(ctx: ActionContext): Promise<ActionData<'ollama/chat'>> {
  const { model, prompt, system } = ctx.payload as unknown as ChatPayload;
  if (!model || !prompt) throw new Error('model and prompt are required');
  if (!isSafeModelName(model)) {
    // 断りに載せる名前も文字の境界で切る (パス 196)。
    throw new FetchError(`unsafe model name: ${clampToCeiling(String(model), 32)}`, 0, 'ollama');
  }
  // Reject null bytes in user-controlled strings — classic foothold for
  // upstream parser bugs (including the unpatched engine-file OOB read).
  // Newlines and other whitespace are legitimate in chat input and are
  // kept; only \0 is refused.
  const promptStr = String(prompt);
  // Stryker disable next-line ConditionalExpression,StringLiteral: when
  // `system` is null/undefined, the ternary returns ''; the
  // ConditionalExpression mutant goes through String(undefined) =
  // 'undefined', and the StringLiteral mutant on the '' branch gives
  // "Stryker was here!" — either way, the `if (system)` gate later
  // excludes the system message from the request, so the string we
  // never use here cannot affect behavior. Equivalent.
  const systemStr = system == null ? '' : String(system);
  if (promptStr.includes('\0') || systemStr.includes('\0')) {
    throw new FetchError('null byte in chat input rejected', 0, 'ollama');
  }

  // 天井超えは**切らずに断る** (パス 114)。それまで `slice(0, MAX_…)` で黙って切っており、
  // 貼った長文の末尾 (質問はたいてい末尾に在る) が届かないまま答えが返っていた。
  // アシスタント (`assistant.ts`) はパス 112 で同じ形を断つと決めている —— 端末内の
  // モデルでも形は同じで、文面は同じ関数 (`inputTooLongMessage`) が持つ。
  if (countChars(systemStr) > MAX_OLLAMA_SYSTEM_CHARS) {
    throw new Error(inputTooLongMessage('システムプロンプト', MAX_OLLAMA_SYSTEM_CHARS));
  }
  if (countChars(promptStr) > MAX_OLLAMA_PROMPT_CHARS) {
    throw new Error(inputTooLongMessage('プロンプト', MAX_OLLAMA_PROMPT_CHARS));
  }

  const messages: OllamaChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: systemStr });
  messages.push({ role: 'user', content: promptStr });

  const f = ctx.fetch ?? fetch;
  return withTimeout(
    f,
    `${OLLAMA_BASE}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false, // streaming intentionally not supported — see OLLAMA_SECURITY.md
      }),
    },
    async (res) => {
  if (!res.ok) {
    // **失敗の本文にも上限を掛ける** (2026-09-20 · パス 330)。ここは素の
    // `res.text()` で、すぐ下の成功側だけが `readBodyWithCap` を通していた ——
    // その注記が「10MB の上限が在っても 2GiB は確保される。ここは main
    // プロセスなので、落ちればタブではなく**アプリ全体**が落ちる」と述べる
    // 危険は、**壊れた相手が実際に通る枝**であるこちらにこそ掛かる。
    // 読めない経路 (接続断) も上限超過も「詳細なし」に畳んでよい ——
    // 畳んではいけないのは読む量のほうである。
    const body = await readFailureBody(res, 'ollama', MAX_RESPONSE_BYTES);
    // 生の英語エラーをそのまま投げると UI に内部メッセージが出るだけなので、
    // 共有ロジックで「何が起きて次に何をすればいいか」に翻訳してから投げる
    // (長さ上限も adviseFromBody 側で掛かる)。
    // **導入済みの一覧を添える** (2026-09-24 · パス 449)。ブラウザ版
    // (`network/ollamaWeb.ts:576`) は失敗の枝で `/api/tags` を引いて
    // `installed` を渡すのに、**ここだけが渡していなかった** —— 同じ
    // `describeOllamaError` が両ビルドで別の答えを出していた。実測
    // (2026-09-24 · `llama3.2:1b` が入っている端末で `llama3.2` を要求):
    //
    //   ブラウザ版 … 「モデル「llama3.2」がまだ取得されていません。
    //                  (インストール済みの「llama3.2:1b」を指定すると動きます。)」
    //   デスクトップ版 …「… (取得する: ollama pull llama3.2)」
    //                  —— 目の前に在るモデルの名前を 1 度も言わない。
    //                  2 つ目の hint は「まだ 1 つもモデルがありません」で、
    //                  **入っている利用者に対して偽**だった (画面には
    //                  `hints[0]` しか出さないので今日そこは見えていない)。
    // **形はブラウザ版に合わせる** —— まず分類し、未取得モデルのときだけ
    // `/api/tags` を引いて名前を添える。接続断・403・500 で一覧を引きに行くと、
    // 既に失敗している相手へ往復を 1 つ増やすだけで、助言は 1 字も変わらない。
    const first = adviseFromBody(res.status, body, { model });
    const advice =
      first.kind === 'model-not-found'
        ? adviseFromBody(res.status, body, { model, installed: await installedModelNames(f) })
        : first;
    throw new FetchError(
      advice.hints.length > 0 ? `${advice.message} (${advice.hints[0]})` : advice.message,
      res.status,
      'ollama',
    );
  }

  /*
   * **上限は「読む前」に、byte で効かせる** (2026-08-29)。
   *
   * ここは `res.text()` で**全部読んでから** `text.length` を見ていた。
   * 二重に名前負けしていた:
   *
   *  1. コメントは "read as text up to a cap" と言うが、上限まで読むのではなく
   *     **全部読んでから捨てる**。10MB の上限が在っても 2GiB は確保される ——
   *     ここは main プロセスなので、落ちればタブではなく**アプリ全体**が落ちる。
   *  2. `.length` は UTF-16 の符号単位の数で **byte ではない**。文言は
   *     "exceeded ... bytes" と言っているのに、日本語では名乗った上限の
   *     約 3 倍が通っていた。
   *
   * `readBodyWithCap` は塊ごとに数えて超えた時点で reader を止める。
   * 文言は既存の検査が留めているので変えない。
   * ブラウザ版 (`renderer/network/ollamaWeb.ts`) の同じ 2 か所も同日に直した。
   */
  let text: string;
  try {
    // Stryker disable next-line StringLiteral: ラベルを空にしても `isOverCap` は
    // `' response too large'` (先頭の空白込み) で当たるので分岐が変わらない。
    // ブラウザ版の同じ箇所と揃えてある (2026-08-31 に実測して等価と確認)。
    text = await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'ollama');
  } catch (e) {
    // **上限超過だけを既存の文言へ翻訳し、他はそのまま通す。** 打ち切りや
    // 接続断を「大きすぎます」と報せると、利用者は的外れな対処をする
    // (`catch {}` で一括りにして 1 度そう書いた)。文言の結び付きは
    // `isOverCap` を通して 1 か所にし、検査で留める。
    if (isOverCap(e)) {
      throw new FetchError(
        `ollama response exceeded ${MAX_RESPONSE_BYTES} bytes`,
        0,
        'ollama',
      );
    }
    throw e;
  }

  let parsed: OllamaChatResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FetchError('ollama returned non-JSON', 0, 'ollama');
  }

  return {
    // 応答の天井 (パス 113)。byte の天井 (10 MiB) は「画面に出す量」としては論外 ——
    // アシスタントと同じ 10 万字で打ち切り、切ったことを本文に残す。
    reply: capAssistantReply(parsed.message?.content ?? ''),
    durationMs: Math.round((parsed.total_duration ?? 0) / 1_000_000),
  };
    },
    // **生成には生成の予算を渡す** (2026-09-23 · パス 424)。ここは第 5 引数を
    // 省いており、`withTimeout` の既定 —— 疎通確認の 30 秒 —— が掛かっていた。
    // ブラウザ版の同じ生成は 120 秒で、その注記が理由を述べている
    // (「生成は診断より時間がかかる」)。理由はこちらにも等しく当てはまる。
    OLLAMA_CHAT_TIMEOUT_MS,
  );
}

export const ACTIONS: ActionMap = {
  chat,
};
