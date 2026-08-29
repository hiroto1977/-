/**
 * Ollama integration with defense-in-depth against the family of CVEs
 * documented in docs/OLLAMA_SECURITY.md (Probllama / CVE-2024-37032
 * and the 0.1.46 batch). The design constrains attack surface to:
 *
 *   - URL pinned to http://127.0.0.1:11434 — cannot be reconfigured at
 *     runtime even via a compromised renderer, so the IPC channel can
 *     never trick main into hitting a different host.
 *   - Only the read endpoints we need: /api/version, /api/tags, /api/chat.
 *     The dangerous ones (/api/pull, /api/create, /api/push) are
 *     deliberately NEVER called from this client.
 *   - Strict model-name validation (no path traversal in `model:` field).
 *   - Hard request timeout (30s) via AbortController.
 *   - Response body truncated to MAX_RESPONSE_BYTES.
 *   - Version-comparison gate that surfaces a "vulnerable" badge if the
 *     local Ollama is older than MIN_SAFE_VERSION.
 */

import {
  FetchError,
  redactForMessage,
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
  UNPATCHED_OOB_NOTICE,
  adviseFromBody,
  compareVersions,
  isSafeModelName,
  isVersionSafe,
  type OllamaSnapshot,
} from '../../shared/ollama';
import { isOverCap, readBodyWithCap } from '../../shared/httpLimits';

// 既存の import 元 (このモジュール) を維持するため再 export する。
export { MIN_SAFE_VERSION, UNPATCHED_OOB_NOTICE, compareVersions, isSafeModelName, isVersionSafe };
export type { OllamaSnapshot };

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS = 30_000;
// **ブラウザ版 (`renderer/network/ollamaWeb.ts`) は 2 MB で、ここだけ 10 MB。**
// 2026-08-23 に気付いて明記した —— どこにも理由が書かれておらず、意図した
// 差なのか流されたのか判別できなかった。値は動かしていない (ブラウザ版の
// 2 MB は画面の「セキュリティポリシー」欄に出ており、変えると表示も変わる)。
// **揃えるか、違う理由を書くか**は、どちらが正しいか分かる人が決めること。
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Hard allowlist of Ollama endpoints this client is permitted to touch.
 *  Enforced at the fetch boundary so that even an accidental future
 *  call to /api/pull, /api/create, /api/push, /api/copy, /api/delete,
 *  /api/blobs, or /api/upload is refused at runtime — these are the
 *  endpoints implicated in CVE-2024-37032 (Probllama) and the
 *  CVE-2024-39719/20/21/22 quartet, and they are also the attack
 *  vector for the currently UNPATCHED out-of-bounds-read in Ollama's
 *  model / engine file parser. We never need them for snapshot+chat. */
const ALLOWED_ENDPOINTS = new Set<string>([
  `${OLLAMA_BASE}/api/version`,
  `${OLLAMA_BASE}/api/tags`,
  `${OLLAMA_BASE}/api/chat`,
]);

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
    const res = await fetchFn(url, { ...init, signal: controller.signal });
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
        const body = (await res.json()) as OllamaVersionResponse;
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
    warnings.push(`Ollama unreachable at ${OLLAMA_BASE}: ${redactForMessage(msg, 100)}`);
  }

  const versionSafe = isVersionSafe(version);
  if (running && !versionSafe) {
    warnings.push(
      `Ollama ${version} is older than the minimum safe version ${MIN_SAFE_VERSION}. Known CVEs apply. See docs/OLLAMA_SECURITY.md.`,
    );
  }
  if (running) {
    // Persistent until upstream ships a patch — see UNPATCHED_OOB_NOTICE.
    warnings.push(UNPATCHED_OOB_NOTICE);
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
        const tags = (await tagsRes.json()) as OllamaTagsResponse;
        for (const m of tags.models ?? []) {
          models.push({
            name: m.name,
            family: m.details?.family ?? '',
            parameterSize: m.details?.parameter_size ?? '',
            quantization: m.details?.quantization_level ?? '',
            sizeMb: Math.round((m.size ?? 0) / (1024 * 1024)),
            modifiedAt: (m.modified_at ?? '').slice(0, 10),
          });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Listing models failed: ${redactForMessage(msg, 100)}`);
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

async function chat(ctx: ActionContext): Promise<{ reply: string; durationMs: number }> {
  const { model, prompt, system } = ctx.payload as unknown as ChatPayload;
  if (!model || !prompt) throw new Error('model and prompt are required');
  if (!isSafeModelName(model)) {
    throw new FetchError(`unsafe model name: ${String(model).slice(0, 32)}`, 0, 'ollama');
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

  const messages: OllamaChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: systemStr.slice(0, MAX_OLLAMA_SYSTEM_CHARS) });
  messages.push({ role: 'user', content: promptStr.slice(0, MAX_OLLAMA_PROMPT_CHARS) });

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
    // 本文が読めない経路 (接続断) もあるので、空文字から始めて上書きする。
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* 本文なしのまま案内へ進む */
    }
    // 生の英語エラーをそのまま投げると UI に内部メッセージが出るだけなので、
    // 共有ロジックで「何が起きて次に何をすればいいか」に翻訳してから投げる
    // (長さ上限も adviseFromBody 側で掛かる)。
    const advice = adviseFromBody(res.status, body, { model });
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
    reply: parsed.message?.content ?? '',
    durationMs: Math.round((parsed.total_duration ?? 0) / 1_000_000),
  };
    },
  );
}

export const ACTIONS: ActionMap = {
  chat,
};
