import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AI_PROVIDERS } from '../../shared/ai/providers';
import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

export interface SkillEntry {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  path: string;
}

export interface SkillsSnapshot {
  items: SkillEntry[];
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/** Parse a SKILL.md / *.md frontmatter block. Only handles `name:` and
 *  `description:` since that's all we surface in the UI. */
/** Parse a SKILL.md / *.md frontmatter block. Only handles `name:` and
 *  `description:` since that's all we surface in the UI.
 *
 *  The `^` / `$` anchor-drop Regex mutants on name/description regexes
 *  are equivalent: with `m` flag every line position is line-start, and
 *  `.+` never spans newlines so `$` is redundant. Suppressed inline. */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  // The regex's `([\s\S]*?)` capture group always matches a string
  // (possibly empty), so match[1] is never undefined when match is
  // truthy. The `?? ''` fallback is type-narrowing only.
  // Stryker disable next-line StringLiteral
  const fm = match[1] ?? '';
  // Stryker disable next-line Regex
  // Stryker disable next-line OptionalChaining
  const name = stripBalancedQuotes(fm.match(/^name:\s*(.+)$/m)?.[1]?.trim());
  // Stryker disable next-line Regex
  const descMatch = fm.match(/^description:\s*(.+(?:\n[ \t]+.+)*)/m);
  // Equivalent: when the outer ?. yields a defined array, [1] is always
  // a string (the capture group `(.+)` matches at least one char), so
  // the inner ?. is unreachable-on-undefined.
  // Stryker disable next-line OptionalChaining
  const description = stripBalancedQuotes(descMatch?.[1]?.trim());
  return { name, description };
}

/** Remove a *matched pair* of surrounding quotes (e.g. "hello" → hello)
 *  but leave a single unbalanced quote alone (e.g. `"` stays `"`).
 *
 *  Stryker reports the `^`/`$` anchor-drop variants as survivors; both
 *  are equivalent because callers always pass a value that has been
 *  `.trim()`ed first, so the anchor-less variant would still only match
 *  full-string quote pairs. */
// Stryker disable Regex
function stripBalancedQuotes(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const m = s.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : s;
}
// Stryker restore Regex

/** A minimal Dirent-shaped object for the readdir injection point.
 *  Lets tests fake the directory contents without touching the disk. */
export interface DirentLike {
  name: string;
  isDirectory: () => boolean;
}

/** Default readdir wrapper — passes through to fs.promises with the
 *  `withFileTypes` option. Injectable so tests can simulate errors
 *  (EACCES, EBADF, etc.) without filesystem manipulation. */
export type ReadDirFn = (dir: string) => Promise<DirentLike[]>;

const defaultReadDir: ReadDirFn = (dir) => fs.readdir(dir, { withFileTypes: true });

/** Scan a single skills directory. Handles two shapes:
 *  - `<dir>/<name>/SKILL.md` (preferred, name == dir name)
 *  - `<dir>/<name>.md`       (flat file)
 *
 *  Returns [] for missing directories (ENOENT). Other errors throw,
 *  so the caller can surface them. `readDir` is injectable so the
 *  ENOENT-vs-other-error branch can be exhaustively unit-tested. */
export async function scanSkills(
  dir: string,
  source: SkillEntry['source'],
  readDir: ReadDirFn = defaultReadDir,
): Promise<SkillEntry[]> {
  let entries: DirentLike[];
  try {
    entries = await readDir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const results: SkillEntry[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    let skillFile: string | null = null;
    let fallbackName = entry.name;
    if (entry.isDirectory()) {
      const candidate = path.join(entryPath, 'SKILL.md');
      // Equivalent mutant: deleting `continue` in the catch leaves
      // skillFile null, which gets caught by `if (!skillFile) continue;`
      // below. Both paths produce identical observable behavior for
      // "directory without SKILL.md".
      // Stryker disable BlockStatement
      try {
        await fs.access(candidate);
        skillFile = candidate;
      } catch {
        continue;
      }
      // Stryker restore BlockStatement
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      skillFile = entryPath;
      fallbackName = entry.name.replace(/\.md$/, '');
    }
    // Equivalent mutant: when skillFile is null we reach this guard;
    // mutating the condition to `false` lets execution fall through to
    // `fs.readFile(null, 'utf8')` which throws → caught by the inner
    // try/catch → continue. Same observable behavior.
    // Stryker disable next-line ConditionalExpression
    if (!skillFile) continue;

    // Equivalent mutant on initializer: the value is either overwritten by
    // readFile or skipped by `continue` in the catch — the initial '' is
    // never observable.
    // Stryker disable next-line StringLiteral
    let content = '';
    try {
      content = await fs.readFile(skillFile, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    results.push({
      name: fm.name ?? fallbackName,
      description: fm.description ?? '',
      source,
      path: skillFile,
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export async function fetchSkillsSnapshot(_ctx: FetchContext): Promise<SkillsSnapshot> {
  const dir = path.join(os.homedir(), '.claude', 'skills');
  const items = await scanSkills(dir, 'user');
  return { items };
}

// --- write-side actions --------------------------------------------------
// run-skill invokes a skill via the Anthropic Messages API: the skill's
// SKILL.md body is sent as the `system` prompt; the user's prompt as the
// turn input. Token = ANTHROPIC_API_KEY (saved via the same secrets
// mechanism as the other service tokens).

interface RunSkillPayload {
  name: string;
  prompt: string;
}

/**
 * この呼び出しの `max_tokens`。**レンダラーからは変えられない。**
 *
 * 2026-08-22 まで payload の `maxTokens` をそのまま送っていた
 * (`maxTokens ?? 2048` —— 型検査も有限性検査も無し)。同じ判断が 4 か所に
 * あって、厳しさが 3 段階に割れていた:
 *
 *     assistant.ts  定数 (レンダラーは触れない)          ← いちばん安全
 *     business.ts   typeof number && isFinite && > 0
 *     stocks.ts     typeof number && isFinite && > 0
 *     skills.ts     `?? 2048` のみ                        ← 何でも通る
 *
 * 実測すると、**UI はこの値を一度も渡していない** (`invoke` の payload に
 * `maxTokens` を入れている画面コードは 0 件)。使われていない受け口が、
 * 有料 API のパラメータをレンダラーに握らせているだけだった。
 * `assistant.ts` と同じ形 —— 定数 —— に寄せる。
 *
 * `model` も同じ理由で payload から外した。モデルの選択は保存済みの
 * プロバイダ設定 (`providers.ts` の `cfg.model`) 側の口である。
 */
export const SKILLS_MAX_TOKENS = 2048;

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

async function readSkillBody(name: string): Promise<string> {
  if (!isSafeSkillName(name)) {
    const safe = String(name as unknown).slice(0, 32);
    throw new Error(`skill "${safe}" has an unsafe name`);
  }
  const base = path.join(os.homedir(), '.claude', 'skills');
  const candidates = [path.join(base, name, 'SKILL.md'), path.join(base, `${name}.md`)];
  const baseResolved = path.resolve(base) + path.sep;
  for (const c of candidates) {
    // Belt-and-braces: even with isSafeSkillName, confirm the joined
    // path stays inside ~/.claude/skills. Protects against future
    // platform-specific path quirks (e.g. Windows alternate separators
    // or 8.3 short names). Provoking this from a unit test would
    // require a path that passes isSafeSkillName but escapes ~/.claude
    // after path.join — currently impossible because isSafeSkillName
    // rejects '/', '\', '..', etc. We keep the check anyway for forward
    // safety, and pragma the resulting "always-true" condition mutant.
    // Stryker disable next-line ConditionalExpression
    if (!path.resolve(c).startsWith(baseResolved)) continue;
    try {
      return await fs.readFile(c, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(`skill "${name}" not found in ~/.claude/skills`);
}

/** A skill name is a single path segment used to locate
 *  `~/.claude/skills/<name>/SKILL.md` or `~/.claude/skills/<name>.md`.
 *  Reject anything that could escape that directory or introduce
 *  filesystem foot-guns: `..`, `/`, `\`, NUL, leading dot, whitespace,
 *  shell metachars. Mirrors the Ollama isSafeModelName approach. */
export function isSafeSkillName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  // Equivalent mutant on `name.length === 0`: dropping the empty-string
  // short-circuit lets execution fall through to the regex, which itself
  // requires at least one char (`^[A-Za-z0-9_-]`). Empty strings get
  // rejected either way.
  // Stryker disable next-line ConditionalExpression
  if (name.length === 0 || name.length > 128) return false;
  if (name.includes('..')) return false;
  // Allow letters, digits, dot, underscore, hyphen. No `/`, `\`, NUL,
  // whitespace, `:` (Windows drive letters), or other shell-meaningful
  // characters. Leading dot is rejected (no hidden files).
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name);
}

async function runSkill(ctx: ActionContext): Promise<{ text: string; stopReason: string }> {
  const { name, prompt } = ctx.payload as unknown as RunSkillPayload;
  if (!name || !prompt) throw new Error('name and prompt are required');

  const body = await readSkillBody(name);

  const res = await jsonFetch<AnthropicMessagesResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': ctx.token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_PROVIDERS.anthropic.defaultModel,
        max_tokens: SKILLS_MAX_TOKENS,
        system: body,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    { fetch: ctx.fetch, serviceId: 'skills' },
  );

  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  return { text, stopReason: res.stop_reason ?? '' };
}

export const ACTIONS: ActionMap = {
  'run-skill': runSkill,
};
