/**
 * **指示のティアが effort と任せる手を決める —— 基準は表 1 つ** (2026-10-07 · パス 505)。
 *
 * 正は `scripts/task-tier.cjs` の `TIERS`。この検査は、それに従うべき 3 つ ——
 * `UserPromptSubmit` hook の登録・`.claude/agents/<agent>.md` の frontmatter・
 * `docs/MODEL_EFFORT_POLICY.md` と `CLAUDE.md` の記述 —— が**実物で**表と一致することと、
 * 判定そのものが標本どおりであることを留める。
 *
 * - agent の集合は表と**両方向** (表に無い agent 定義が生えても・表の agent が消えても落ちる)。
 * - `scout` は書く道具を持たない (読み取り専用の約束は frontmatter の `tools` が持つ)。
 * - hook は `lint:mcp-servers` の台帳に在り、形の規則を通る (門の `readHooks` / `checkHooks` を借りる)。
 * - 文書と CLAUDE.md は表の名前を名指しする (方針書だけが古びる形を止める)。
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

interface Tier {
  readonly id: string;
  readonly label: string;
  readonly mainEffort: string;
  readonly agent: string;
  readonly agentModel: string;
  readonly agentEffort: string;
  readonly workflow: boolean;
  readonly summary: string;
}
interface Verdict {
  readonly tier: string;
  readonly thorough: boolean;
  readonly reasons: readonly string[];
}
// `selfTest` は分割で取り出す —— `gateSelfTests.test.ts` は「selfTest を取り出している
// require の場所」で走っている経路を数える (名前の出現では数えない)。
const { TIERS, MAX_GUIDANCE_CHARS, classifyInstruction, renderGuidance, selfTest } = req(
  '../../../scripts/task-tier.cjs',
) as {
  TIERS: Record<string, Tier>;
  MAX_GUIDANCE_CHARS: number;
  classifyInstruction: (prompt: unknown) => Verdict | null;
  renderGuidance: (v: Verdict | null) => string;
  selfTest: (log?: (s: string) => void) => number;
};
const tool = { TIERS, MAX_GUIDANCE_CHARS, classifyInstruction, renderGuidance, selfTest };

interface Hook {
  readonly key: string;
  readonly type: string | null;
  readonly command: string | null;
}
const gate = req('../../../scripts/lint-mcp-servers.cjs') as {
  readHooks: (json: unknown) => Hook[];
  checkHooks: (hooks: readonly Hook[]) => string[];
  HOOK_LEDGER: Record<string, { command: string; why: string }>;
};

const HOOK_KEY = 'UserPromptSubmit:';
const HOOK_COMMAND = 'node scripts/task-tier.cjs';
const AGENTS_DIR = '.claude/agents';
const POLICY = 'docs/MODEL_EFFORT_POLICY.md';
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const MODELS = new Set(['haiku', 'sonnet', 'opus', 'fable', 'inherit']);

/** `---` で囲まれた frontmatter を `key: value` の対で読む (値は 1 行)。 */
function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(m, 'frontmatter が無い').not.toBeNull();
  const out: Record<string, string> = {};
  for (const line of m![1]!.split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const tiers = Object.values(tool.TIERS);

describe('指示のティア —— 判定 (scripts/task-tier.cjs)', () => {
  it('★ 表は 3 ティアで、値は閉じた語彙の中', () => {
    expect(Object.keys(tool.TIERS).sort()).toEqual(['deep', 'light', 'standard']);
    for (const t of tiers) {
      expect(t.id, '鍵と id が食い違う').toBe(Object.keys(tool.TIERS).find((k) => tool.TIERS[k] === t));
      expect(EFFORTS.has(t.mainEffort), `${t.id}: mainEffort "${t.mainEffort}" を知らない`).toBe(true);
      expect(EFFORTS.has(t.agentEffort), `${t.id}: agentEffort "${t.agentEffort}" を知らない`).toBe(true);
      expect(MODELS.has(t.agentModel), `${t.id}: agentModel "${t.agentModel}" を知らない`).toBe(true);
      expect(t.summary.length, `${t.id}: summary が短すぎる`).toBeGreaterThanOrEqual(10);
    }
    // deep だけが Workflow を提案する —— 軽い指示に重い検証を掛けない側の約束。
    expect(tiers.filter((t) => t.workflow).map((t) => t.id)).toEqual(['deep']);
  });

  it('★ 標本: deep / light / standard と、deep が light に勝つこと', () => {
    const tierOf = (p: string): string | null => tool.classifyInstruction(p)?.tier ?? null;
    expect(tierOf('続けて')).toBe('deep');
    expect(tierOf('この画面の文字色を実機で測って直して')).toBe('deep');
    expect(tierOf('Investigate the root cause of the flaky e2e')).toBe('deep');
    expect(tierOf('マージして')).toBe('light');
    expect(tierOf('CI の状態を教えて')).toBe('light');
    expect(tierOf('KPI 画面に CSV の書き出しを足して検査も書いて')).toBe('standard');
    // 「確認して」は light の印だが、「脆弱性」が在れば監査 = deep。
    expect(tierOf('脆弱性を確認して')).toBe('deep');
    // light の印が在っても、箇条書きが 3 行以上なら 1 つの操作では終わらない。
    expect(tierOf('- 設定画面を直す\n- 検査を足す\n- 文書を更新して')).toBe('standard');
  });

  it('★ 「徹底」は deep の中で xhigh を推奨し、案内は 1 行で上限以内', () => {
    const v = tool.classifyInstruction('全画面を徹底的に測って');
    expect(v?.tier).toBe('deep');
    expect(v?.thorough).toBe(true);
    const line = tool.renderGuidance(v);
    expect(line).toContain('effort xhigh');
    expect(line).toContain('auditor (inherit / high)');
    expect(line).toContain(POLICY);
    expect(line.includes('\n'), '案内が複数行').toBe(false);
    expect(line.length).toBeLessThanOrEqual(tool.MAX_GUIDANCE_CHARS);
    // 徹底でない deep は high のまま (xhigh へ上げるのは徹底の印だけ)。
    expect(tool.renderGuidance(tool.classifyInstruction('続けて'))).toContain('effort high');
  });

  it('★ 案内を出さない形: 空・短すぎ・スラッシュコマンド・文字列でない物', () => {
    for (const p of ['', ' ', 'は', '/model opus', '/effort high', 42, null, undefined]) {
      expect(tool.classifyInstruction(p), `${JSON.stringify(p)} に案内を出している`).toBeNull();
    }
    expect(tool.renderGuidance(null)).toBe('');
  });

  it('★ 根拠は一致した印そのもの (読んだ人が検算できる)', () => {
    const v = tool.classifyInstruction('脆弱性を測って');
    expect(v?.reasons).toEqual(['測って', '脆弱性']);
    expect(tool.renderGuidance(v)).toContain('「測って」「脆弱性」');
  });

  it('★ script の自己検査が全件一致する', () => {
    expect(tool.selfTest(() => undefined)).toBe(0);
  });

  it('★ require しただけでは本体が走らない (require.main の門) ・子プロセス / 網を持たない', () => {
    const src = readOriginalSource(join(REPO, 'scripts/task-tier.cjs'));
    expect(src).toContain('if (require.main === module)');
    // 読むのは stdin だけ: 子プロセスと fetch の綴りを持たない (文字列の針 —— 綴りが外れれば必ず落ちる側)。
    expect(src.includes("require('node:child_process')")).toBe(false);
    expect(src.includes('fetch(')).toBe(false);
    expect(src.includes('writeFileSync')).toBe(false);
  });
});

describe('指示のティア —— hook の登録 (UserPromptSubmit)', () => {
  const settings = JSON.parse(readOriginalSource(join(REPO, '.claude/settings.json'))) as Record<string, unknown>;

  it('★ 設定に UserPromptSubmit の hook が在り、コマンドは task-tier.cjs', () => {
    const hook = gate.readHooks(settings).find((h) => h.key === HOOK_KEY);
    expect(hook, `${HOOK_KEY} の hook が設定に無い`).toBeDefined();
    expect(hook?.type).toBe('command');
    expect(hook?.command).toBe(HOOK_COMMAND);
  });

  it('★ 門の台帳に理由つきで載り、形の規則を通る (双方向)', () => {
    expect(gate.HOOK_LEDGER[HOOK_KEY]?.command).toBe(HOOK_COMMAND);
    expect((gate.HOOK_LEDGER[HOOK_KEY]?.why ?? '').length).toBeGreaterThanOrEqual(10);
    expect(gate.checkHooks(gate.readHooks(settings))).toEqual([]);
  });
});

describe('指示のティア —— agent 定義 (.claude/agents) は表と双方向', () => {
  const files = readOriginalDirEntries(join(REPO, AGENTS_DIR))
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name.slice(0, -'.md'.length))
    .sort();

  it('★ agent の集合 == 表の agent (両方向)', () => {
    expect(files).toEqual(tiers.map((t) => t.agent).sort());
  });

  it('★ frontmatter の name / model / effort は表と同じ・description を持つ', () => {
    for (const t of tiers) {
      const fm = frontmatter(readOriginalSource(join(REPO, AGENTS_DIR, `${t.agent}.md`)));
      expect(fm.name, `${t.agent}: name`).toBe(t.agent);
      expect(fm.model, `${t.agent}: model`).toBe(t.agentModel);
      expect(fm.effort, `${t.agent}: effort`).toBe(t.agentEffort);
      expect((fm.description ?? '').length, `${t.agent}: description`).toBeGreaterThanOrEqual(10);
    }
  });

  it('★ scout は読み取り専用 (tools を名指しし、Edit / Write を含まない)', () => {
    const fm = frontmatter(readOriginalSource(join(REPO, AGENTS_DIR, 'scout.md')));
    const tools = (fm.tools ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
    expect(tools).toContain('Read');
    expect(tools).toContain('Grep');
    expect(tools.includes('Edit')).toBe(false);
    expect(tools.includes('Write')).toBe(false);
  });
});

describe('指示のティア —— 文書は表の名前を名指しする', () => {
  const policy = readOriginalSource(join(REPO, POLICY));
  const claudeMd = readOriginalSource(join(REPO, 'CLAUDE.md'));

  it('★ 方針書の表はティアごとに effort と agent (model / effort) を同じ行で言う', () => {
    for (const t of tiers) {
      const row = policy.split('\n').find((l) => l.startsWith(`| \`${t.id}\``));
      expect(row, `${t.id} の行が無い`).toBeDefined();
      expect(row).toContain(`${t.agent} (${t.agentModel} / ${t.agentEffort})`);
      expect(row).toContain(t.mainEffort);
      expect(row).toContain(t.summary);
    }
    for (const needle of ['/model', '/effort', 'scripts/task-tier.cjs', 'UserPromptSubmit', 'chain:append']) {
      expect(policy, `方針書が ${needle} に触れていない`).toContain(needle);
    }
  });

  it('★ CLAUDE.md と ARCHITECTURE の関連文書の表が方針書を指す', () => {
    expect(claudeMd).toContain(POLICY);
    expect(claudeMd).toContain('scripts/task-tier.cjs');
    for (const t of tiers) expect(claudeMd, `CLAUDE.md が ${t.agent} を名指ししていない`).toContain(`\`${t.agent}\``);
    expect(readOriginalSource(join(REPO, 'docs/ARCHITECTURE.md'))).toContain(`\`${POLICY}\``);
  });
});
