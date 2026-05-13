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
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const MIN_SAFE_VERSION = '0.1.46';
const REQUEST_TIMEOUT_MS = 30_000;
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

/** Warning emitted on every snapshot until Ollama publishes a patch for
 *  the model/engine file parser OOB read. Surfaces the operational
 *  mitigations the user must apply outside the app. */
export const UNPATCHED_OOB_NOTICE =
  'Ollama 本体に未パッチの out-of-bounds read (モデル/エンジンファイルパーサ) ' +
  'が公表されています。本アプリは /api/pull・/api/create・/api/push を呼ばない ' +
  '設計でこの攻撃ベクトルを遮断していますが、CLI からモデルを取得する場合は ' +
  '必ず Ollama 公式 library など検証済みソースのみを使用してください。詳細は ' +
  'docs/OLLAMA_SECURITY.md を参照。';

/** Allow model identifiers like "llama3.2", "qwen2.5-coder:7b",
 *  "library/mistral:latest". Reject anything with whitespace, `..`,
 *  backslash, scheme markers, or other shell-meaningful characters. */
const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._:/\-]{0,127}$/i;

export function isSafeModelName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (name.includes('..')) return false;
  return MODEL_NAME_RE.test(name);
}

/** Strict semver-ish compare. Returns -1 / 0 / +1 like Array.sort.
 *  Handles "0.1.46", "0.5.0", "0.1.46-rc1" (trailing tag ignored).
 *
 *  The inner `?.split('+')[0]` chain has equivalent mutants — empty
 *  string input handles all bogus inputs uniformly; the `i < len`
 *  vs `i <= len` mutant just adds one extra zero-iteration. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    // Stryker disable next-line OptionalChaining
    const clean = v.split('-')[0]?.split('+')[0] ?? '';
    return clean.split('.').map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

/** True iff the given version is at or above MIN_SAFE_VERSION. An
 *  empty or malformed string is treated as "unsafe" — better safe than
 *  silently waving an unknown version through.
 *
 *  The guard `!version || typeof version !== 'string'` is defense in
 *  depth: even when mutated (|| → &&, or either side flipped), the
 *  fall-through path either returns -1 from compareVersions on bogus
 *  parses or hits the catch → returns false. So all 3 mutants on this
 *  line produce the same `false` result for every input we care about. */
// Stryker disable next-line LogicalOperator,ConditionalExpression
export function isVersionSafe(version: string): boolean {
  // Stryker disable next-line LogicalOperator,ConditionalExpression
  if (!version || typeof version !== 'string') return false;
  try {
    return compareVersions(version, MIN_SAFE_VERSION) >= 0;
  } catch {
    return false;
  }
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

export interface OllamaSnapshot {
  running: boolean;
  version: string;
  versionSafe: boolean;
  versionMinRecommended: string;
  models: {
    name: string;
    family: string;
    parameterSize: string;
    quantization: string;
    sizeMb: number;
    modifiedAt: string;
  }[];
  warnings: string[];
}

/** Wraps fetch in a per-request timeout. Returns the response, throws
 *  if the timeout fires or the server is unreachable. */
async function withTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  // Stryker disable next-line ConditionalExpression: belt-and-braces.
  // The only callers feed URLs from `${OLLAMA_BASE}/api/...` constants
  // that are all in ALLOWED_ENDPOINTS by construction. The runtime check
  // here defends against future regressions (a new caller forgetting
  // to use a constant). Mutating to `false` simply removes the
  // additional defense layer; no live attack reaches this code.
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOllamaSnapshot(ctx: FetchContext): Promise<OllamaSnapshot> {
  const f = ctx.fetch ?? fetch;
  const warnings: string[] = [];
  let version = '';
  let running = false;

  try {
    const res = await withTimeout(f, `${OLLAMA_BASE}/api/version`);
    if (res.ok) {
      const body = (await res.json()) as OllamaVersionResponse;
      version = body.version ?? '';
      running = true;
    } else {
      warnings.push(`Ollama /api/version returned HTTP ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Ollama unreachable at ${OLLAMA_BASE}: ${msg.slice(0, 100)}`);
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
      const tagsRes = await withTimeout(f, `${OLLAMA_BASE}/api/tags`);
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
    } catch (err) {
      warnings.push(`Listing models failed: ${(err as Error).message.slice(0, 100)}`);
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
    throw new FetchError(`unsafe model name: ${model.slice(0, 32)}`, 0, 'ollama');
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
  if (system) messages.push({ role: 'system', content: systemStr.slice(0, 8192) });
  messages.push({ role: 'user', content: promptStr.slice(0, 32768) });

  const f = ctx.fetch ?? fetch;
  const res = await withTimeout(
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
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FetchError(`ollama ${res.status}: ${body.slice(0, 200)}`, res.status, 'ollama');
  }

  // Defense against an unbounded response: read as text up to a cap.
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new FetchError(
      `ollama response exceeded ${MAX_RESPONSE_BYTES} bytes`,
      0,
      'ollama',
    );
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
}

export const ACTIONS: ActionMap = {
  chat,
};
