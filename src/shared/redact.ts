/**
 * Secret redaction — shared between the Electron main process (API error
 * bodies) and the renderer (BYO-proxy error bodies). Strips anything that
 * looks like a bearer/API token from a string so error messages can't leak
 * credentials reflected back by an upstream service or a third-party proxy.
 *
 * Single source of truth: `src/main/clients/types.ts` re-exports this so the
 * redaction logic exists once. Patterns covered:
 *   - sk-ant-…, ghp_…, ghs_…, ghu_…, ya29.…, xoxb-…, xoxp-…, secret_…
 *   - Atlassian ATATT… tokens
 *   - Authorization: Bearer …, Basic <base64>
 *   - JSON token fields (access_token / refresh_token / token / api_key / …)
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization: Basic [REDACTED]')
    .replace(/\b(sk-ant-|ghp_|ghs_|ghu_|gho_|ghr_|xoxp-|xoxb-|xoxa-|secret_)[A-Za-z0-9_-]{8,}/g, '$1[REDACTED]')
    .replace(/\bya29\.[A-Za-z0-9_-]{10,}/g, 'ya29.[REDACTED]')
    // Atlassian API token (Jira/Confluence PAT) — always begins `ATATT`.
    .replace(/\bATATT[A-Za-z0-9_=.-]{16,}/g, 'ATATT[REDACTED]')
    // The value sub-pattern `(?:[^"\\]|\\.)*` correctly skips over
    // JSON-escaped characters (`\\"`, `\\\\`, etc.) so a token rendered
    // inside a nested JSON-in-JSON error response can't smuggle a
    // closing-quote past the redactor. Without it, an upstream reply
    // like `{"error_description":"Token \\"ATATT3xFfGF0…\\" rejected"}`
    // would only redact `Token \\` and leave the secret in the rest.
    .replace(/"(access_token|refresh_token|token|api_key|apikey|password)"\s*:\s*"(?:[^"\\]|\\.)*"/gi, '"$1":"[REDACTED]"');
}
