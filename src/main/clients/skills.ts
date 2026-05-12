import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = match[1];
  const name = stripBalancedQuotes(fm.match(/^name:\s*(.+)$/m)?.[1]?.trim());
  const descMatch = fm.match(/^description:\s*(.+(?:\n[ \t]+.+)*)/m);
  const description = stripBalancedQuotes(descMatch?.[1]?.trim());
  return { name, description };
}

/** Remove a *matched pair* of surrounding quotes (e.g. "hello" → hello)
 *  but leave a single unbalanced quote alone (e.g. `"` stays `"`). */
function stripBalancedQuotes(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const m = s.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : s;
}

/** Scan a single skills directory. Handles two shapes:
 *  - `<dir>/<name>/SKILL.md` (preferred, name == dir name)
 *  - `<dir>/<name>.md`       (flat file) */
export async function scanSkills(
  dir: string,
  source: SkillEntry['source'],
): Promise<SkillEntry[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
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
      try {
        await fs.access(candidate);
        skillFile = candidate;
      } catch {
        continue;
      }
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      skillFile = entryPath;
      fallbackName = entry.name.replace(/\.md$/, '');
    }
    if (!skillFile) continue;

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
  model?: string;
  maxTokens?: number;
}

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
    // or 8.3 short names).
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
  if (name.length === 0 || name.length > 128) return false;
  if (name.includes('..')) return false;
  // Allow letters, digits, dot, underscore, hyphen. No `/`, `\`, NUL,
  // whitespace, `:` (Windows drive letters), or other shell-meaningful
  // characters. Leading dot is rejected (no hidden files).
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name);
}

async function runSkill(ctx: ActionContext): Promise<{ text: string; stopReason: string }> {
  const { name, prompt, model, maxTokens } = ctx.payload as unknown as RunSkillPayload;
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
        model: model ?? 'claude-sonnet-4-6',
        max_tokens: maxTokens ?? 2048,
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
