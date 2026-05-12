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
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const descMatch = fm.match(/^description:\s*(.+(?:\n[ \t]+.+)*)/m);
  const description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, '');
  return { name, description };
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
  const base = path.join(os.homedir(), '.claude', 'skills');
  const candidates = [path.join(base, name, 'SKILL.md'), path.join(base, `${name}.md`)];
  for (const c of candidates) {
    try {
      return await fs.readFile(c, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(`skill "${name}" not found in ~/.claude/skills`);
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
