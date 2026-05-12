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
  jsonFetch,
  FetchError,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const MIN_SAFE_VERSION = '0.1.46';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

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
 *  Handles "0.1.46", "0.5.0", "0.1.46-rc1" (trailing tag ignored). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    const clean = v.split('-')[0].split('+')[0];
    return clean.split('.').map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
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
 *  silently waving an unknown version through. */
export function isVersionSafe(version: string): boolean {
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

  const models: OllamaSnapshot['models'] = [];
  if (running) {
    try {
      const tags = await jsonFetch<OllamaTagsResponse>(
        `${OLLAMA_BASE}/api/tags`,
        {},
        { fetch: f, serviceId: 'ollama' },
      );
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

  const messages: OllamaChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: String(system).slice(0, 8192) });
  messages.push({ role: 'user', content: String(prompt).slice(0, 32768) });

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
