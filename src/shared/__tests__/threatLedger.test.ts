import { stripComments } from './stripNonCode';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **脅威台帳を CI で留める** (2026-10-12 · パス 511)。
 *
 * `security/threat-ledger.json` は、AI の監査 (`docs/THREAT_HUNT.md`) が見つけて**自分で再現した**攻撃を
 * 1 件ずつ、修正と「攻撃を再現する回帰検査」つきで持つ。ここは台帳と実物を**双方向**に突き合わせる:
 *
 *   - 直した行 (`fixed` / `mitigated`) の回帰検査が在り、その題名と `threat: T-xxx` の印を持つこと
 *     —— 検査を消すと、ここが鳴る (直した穴が黙って開き直らない)
 *   - 検査に在る `threat: T-xxx` の印が台帳に在ること —— 台帳の行を消すと、ここが鳴る
 *   - 攻撃の型ごとの防御表 (`classes`) が名指す門・検査が実在すること、守りの無い所を `gaps` に書くこと
 *   - 手順書の攻撃面と台帳の攻撃面が一致すること
 *   - CODEOWNERS が整合性チェーンの保護対象をすべて覆うこと (T-003 の対策)
 */

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readOriginalSource(path.join(ROOT, rel));

interface Threat {
  id: string;
  found: string;
  foundBy: string;
  surface: string;
  class: string;
  severity: string;
  title: string;
  status: string;
  fix?: string;
  reason?: string;
  regression?: { file: string; test: string };
}
interface Ledger {
  surfaces: string[];
  classes: {
    id: string;
    name: string;
    howItReachesThisApp: string;
    defenses: { what: string; enforcedBy: string[] }[];
    gaps: string[];
  }[];
  threats: Threat[];
  huntBacklog: { surface: string; item: string; why: string }[];
  clearedBacklog?: { item: string; finding: string; checkedOn: string }[];
}

const ledger = JSON.parse(read('security/threat-ledger.json')) as Ledger;
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
const MARKER = /threat: (T-\d{3})/g;
/** 理由を省いた決まり文句 (次に読む人が何について同じなのか確かめ直すことになる)。 */
const SHORTHAND = /^(同上|TBD|TODO|要検討)/;

/** `src` の下の検査ファイル (`*.test.ts`) をすべて。 */
function testFiles(dir = path.join(ROOT, 'src')): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(full));
    else if (e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('脅威台帳の形', () => {
  it('id は一意で T-000 の形、面・型・重さ・状態は決まった語彙', () => {
    expect(ledger.threats.length).toBeGreaterThan(0);
    const ids = ledger.threats.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const classIds = new Set(ledger.classes.map((c) => c.id));
    for (const t of ledger.threats) {
      expect(t.id, t.id).toMatch(/^T-\d{3}$/);
      expect(ledger.surfaces, t.id).toContain(t.surface);
      expect(classIds.has(t.class), `${t.id} の型 ${t.class}`).toBe(true);
      expect(['critical', 'high', 'medium', 'low'], t.id).toContain(t.severity);
      expect(['fixed', 'mitigated', 'accepted'], t.id).toContain(t.status);
      expect(t.found, t.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.title.length, t.id).toBeGreaterThan(10);
    }
  });

  it('受容 (accepted) は理由を持ち、重い物 (critical / high) は受容できない', () => {
    for (const t of ledger.threats.filter((x) => x.status === 'accepted')) {
      expect((t.reason ?? '').length, t.id).toBeGreaterThanOrEqual(20);
      expect(['critical', 'high'], t.id).not.toContain(t.severity);
    }
  });
});

/**
 * 題名が**実際の検査の宣言**として在るか。部分文字列の一致だけだと、コメントに題名が残っているだけ・
 * `it.skip` / `it.todo` / `xit` に変えただけでも、台帳は「回帰検査が在る」と言い続ける (Red-B 2026-10-24)。
 * 題名の直前が `(` + 引用符で、その行の宣言が skip / todo / only / x 接頭でない物が 1 つ在ればよい。
 */
function declaresRealTest(body: string, title: string): boolean {
  // 注記は共有の道具で落とす (文字列の中身は残る・行番号は保たれる)。自前の注記判定は持たない (パス 461)。
  return stripComments(body).split('\n').some((line) => {
    const at = line.indexOf(title);
    if (at === -1) return false;
    const before = line.slice(0, at);
    // 題名は文字列の中に在る (台帳の題名が全題名の一部のこともある): `(` + 引用符の後ろに引用符が閉じずに続くか、
    // `it.each` の題名の行 (引用符で始まる行) であること。
    const opener = /\(\s*(['"`])/g;
    let inString = /^(['"`])/.test(before.trimStart()) && !before.trimStart().slice(1).includes(before.trimStart()[0]!);
    for (let m = opener.exec(before); m !== null; m = opener.exec(before)) {
      if (!before.slice(m.index + m[0].length).includes(m[1]!)) inString = true;
    }
    if (!inString) return false;
    return !/\b(?:it|test|describe)\.(?:skip|todo)\b|\bx(?:it|test|describe)\(/.test(before);
  });
}

describe('直した穴は、攻撃を再現する検査で留まっている (双方向)', () => {
  it('★ 直した行の回帰検査が在り、題名と印 (threat: T-xxx) を持つ', () => {
    for (const t of ledger.threats.filter((x) => x.status !== 'accepted')) {
      expect(t.regression, `${t.id} に回帰検査が無い`).toBeDefined();
      const file = t.regression!.file;
      expect(existsSync(path.join(ROOT, file)), `${t.id}: ${file} が無い`).toBe(true);
      const body = read(file);
      expect(body.includes(t.regression!.test), `${t.id}: 題名「${t.regression!.test}」が ${file} に無い`).toBe(true);
      expect(body.includes(`threat: ${t.id}`), `${t.id}: ${file} に印 threat: ${t.id} が無い`).toBe(true);
    }
  });

  it('★ 検査に在る印 (threat: T-xxx) は、どれも台帳に在る', () => {
    const ids = new Set(ledger.threats.map((t) => t.id));
    const orphans: string[] = [];
    let seen = 0;
    for (const f of testFiles()) {
      for (const m of read(path.relative(ROOT, f)).matchAll(MARKER)) {
        seen += 1;
        if (!ids.has(m[1]!)) orphans.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
    // 走査が空でない (印を拾えている)。
    expect(seen).toBeGreaterThanOrEqual(ledger.threats.length);
    expect(orphans).toEqual([]);
  });

  it('★ 回帰検査の題名は、コメントではなく実際の検査の宣言で、skip / todo / only でない (Red-B 2026-10-24)', () => {
    const bad: string[] = [];
    for (const t of ledger.threats.filter((x) => x.status !== 'accepted')) {
      // 検査ファイル (*.test.ts) だけ。script の自己検査 (標本の表) は it() ではない。
      if (!t.regression!.file.endsWith('.test.ts')) continue;
      const body = read(t.regression!.file);
      if (!declaresRealTest(body, t.regression!.test)) bad.push(`${t.id}: ${t.regression!.file}`);
    }
    expect(bad).toEqual([]);
  });

  it('標本: 実際の宣言は通し、コメント・skip・todo・説明文の中の題名は通さない', () => {
    const title = '★ 破れない';
    expect(declaresRealTest(`it('${title}', () => {});`, title)).toBe(true);
    expect(declaresRealTest(`it.each([1])('${title} %s', () => {});`, `${title} %s`)).toBe(true);
    expect(declaresRealTest(`  ])('${title}', () => {`, title)).toBe(true);
    expect(declaresRealTest(`// it('${title}', () => {});`, title)).toBe(false);
    expect(declaresRealTest(` * ${title}`, title)).toBe(false);
    expect(declaresRealTest(`it.skip('${title}', () => {});`, title)).toBe(false);
    expect(declaresRealTest(`it.todo('${title}');`, title)).toBe(false);
    expect(declaresRealTest(`xit('${title}', () => {});`, title)).toBe(false);
    expect(declaresRealTest(`const note = '${title}';`, title)).toBe(false);
    expect(declaresRealTest('it.skip.each([1])(\'x\', () => {});\nit(\'' + title + '\', () => {});', title)).toBe(true);
  });

  it('標本: 印の針は印に当たり、似た綴りには当たらない', () => {
    expect([...'… (threat: T-007)'.matchAll(MARKER)].map((m) => m[1])).toEqual(['T-007']);
    expect([...'threat T-007 / threats: T-7'.matchAll(MARKER)]).toEqual([]);
  });
});

describe('攻撃の型ごとの防御表', () => {
  it('★ どの型も守りを持ち、名指した門・検査・ファイルが実在する', () => {
    const missing: string[] = [];
    for (const c of ledger.classes) {
      expect(c.defenses.length, c.id).toBeGreaterThan(0);
      for (const d of c.defenses) {
        expect(d.enforcedBy.length, `${c.id}: ${d.what}`).toBeGreaterThan(0);
        for (const e of d.enforcedBy) {
          const ok = e.startsWith('npm:') ? Object.hasOwn(scripts, e.slice(4)) : existsSync(path.join(ROOT, e));
          if (!ok) missing.push(`${c.id}: ${e}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('★ 守りの無い所は gaps に書く (空欄で通さない)', () => {
    for (const c of ledger.classes) {
      expect(Array.isArray(c.gaps), c.id).toBe(true);
      expect(c.gaps.length, `${c.id} の gaps が空 —— 本当に穴が無いなら、そう測った理由を書く`).toBeGreaterThan(0);
      for (const g of c.gaps) expect(g.length, c.id).toBeGreaterThan(10);
    }
  });

  it('利用者が挙げた 5 つの攻撃の型が載っている', () => {
    const ids = ledger.classes.map((c) => c.id);
    for (const id of ['ai-automated-attack', 'ai-phishing', 'supply-chain', 'ransomware-extortion', 'living-off-the-land']) {
      expect(ids).toContain(id);
    }
  });

  it('狩りの残り (huntBacklog) は面と理由を持つ', () => {
    // 標本: 針は省いた理由に当たる。
    expect('同上。').toMatch(SHORTHAND);
    for (const b of ledger.huntBacklog) {
      expect(ledger.surfaces).toContain(b.surface);
      expect(b.item.length).toBeGreaterThan(10);
      expect(b.why.length).toBeGreaterThan(15);
      expect(b.why, '省略した理由は書かない').not.toMatch(SHORTHAND);
    }
  });

  it('片付いた狩り (clearedBacklog) は、測った結果と日付を持つ', () => {
    for (const c of ledger.clearedBacklog ?? []) {
      expect(c.item.length).toBeGreaterThan(10);
      expect(c.finding.length, c.item).toBeGreaterThan(20);
      expect(c.finding, c.item).not.toMatch(SHORTHAND);
      expect(c.checkedOn, c.item).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('手順書と台帳の攻撃面は同じ (両方向)', () => {
  it('★ docs/THREAT_HUNT.md の `## surface: x` と台帳の surfaces が一致する', () => {
    const doc = read('docs/THREAT_HUNT.md');
    const inDoc = [...doc.matchAll(/^## surface: ([a-z-]+)$/gm)].map((m) => m[1]!).sort();
    expect(inDoc).toEqual([...ledger.surfaces].sort());
  });
});

describe('CODEOWNERS は整合性チェーンの保護対象をすべて覆う', () => {
  const req = createRequire(import.meta.url);
  const { PROTECTED } = req('../../../scripts/integrity-chain.cjs') as { PROTECTED: readonly string[] };
  const lines = read('.github/CODEOWNERS')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const patterns = lines.map((l) => l.split(/\s+/)[0]!);
  /** 台帳の回帰検査 (守りの本体)。弱められると守りが消えるので所有者のレビューを要求する。 */
  const regressionFiles = [...new Set(ledger.threats.flatMap((t) => (t.regression === undefined ? [] : [t.regression.file])))];
  /** 守られる側の設定 (データ)。ここが書き換わると、検査が緑のまま梱包・依存・lint の入力が変わる。 */
  const OWNED_CONFIG = ['/CLAUDE.md', '/package.json', '/package-lock.json', '/tsconfig.json', '/tsconfig.app.json', '/tsconfig.node.json', '/stryker.config.json', '/.gitignore', '/.gitattributes', '/docs/SESSION_HANDOFF.md', '/docs/REMAINING_WORK.md', '/docs/THREAT_HUNT.md', '/docs/MODEL_EFFORT_POLICY.md', '/docs/HUNT_CYCLE_PROMPT.md', '/docs/MAMORI_GROWTH_PROMPT.md'];
  /**
   * `**\/NAME` は任意の深さの NAME (ルート直下も含む)。エージェント指示書のように**新しく生える**物を
   * 個別の行ではなく名前で覆うための形 (パス 540 · T-128)。他の glob は台帳が使わないので扱わない。
   */
  const globCovers = (pat: string, p: string) => pat.startsWith('**/') && (p === pat.slice(3) || p.endsWith(`/${pat.slice(3)}`));
  /** エージェントが読む指示書の名前 (パターンで覆ってよい名前はこれだけ · パス 540)。 */
  const INSTRUCTION_NAMES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'CONVENTIONS.md'];
  /** 今は無いが、置かれた瞬間にそのツールが従う指示書 (ルート直下のファイルと、まだ無い指示書のディレクトリ)。 */
  const FUTURE_INSTRUCTION_PATHS = ['/.cursorrules', '/.windsurfrules', '/.clinerules', '/.clinerules/', '/.junie/'];
  const isCovered = (p: string) =>
    patterns.some((pat) => (pat.endsWith('/') ? `/${p}`.startsWith(pat) : pat === `/${p}` || globCovers(pat, p)));

  it('★ CODEOWNERS は整合性チェーンの保護対象をすべて覆う (threat: T-003)', () => {
    const covered = (p: string) =>
      patterns.some((pat) => (pat.endsWith('/') ? `/${p}`.startsWith(pat) : pat === `/${p}`));
    const uncovered = PROTECTED.filter((p) => !covered(p));
    expect(uncovered, `CODEOWNERS へ足す行:\n${uncovered.map((p) => `/${p} @hiroto1977`).join('\n')}`).toEqual([]);
    // どの行も所有者を名乗る。
    for (const l of lines) expect(l, l).toMatch(/\s@[\w-]+$/);
  });

  it('★ 台帳の回帰検査と守られる設定は、CODEOWNERS が覆う (守りの無効化と被保護物の改変を同じ PR で通さない) (threat: T-112)', () => {
    expect(regressionFiles.length).toBeGreaterThan(40);
    expect(regressionFiles.filter((f) => !isCovered(f)), '足す行: /<path> @hiroto1977').toEqual([]);
    expect(OWNED_CONFIG.filter((f) => !isCovered(f.slice(1)))).toEqual([]);
    // 標本: 覆われていない道は「覆われていない」と答える (空の検査にしない)。
    expect(isCovered('src/shared/__tests__/zz-not-in-codeowners.test.ts')).toBe(false);
  });

  it('★ ファイルを名指す行は、保護対象か実在するディレクトリだけ (古い行を残さない)', () => {
    // 保護対象 + 台帳の回帰検査 + 守られる設定 (パス 526 · T-105〜T-111)。**どれかに当たらない行は古い行**。
    const protectedSet = new Set([
      ...PROTECTED.map((p) => `/${p}`),
      ...regressionFiles.map((f) => `/${f}`),
      ...OWNED_CONFIG,
    ]);
    const stale = patterns.filter((pat) =>
      FUTURE_INSTRUCTION_PATHS.includes(pat)
        ? false
        : pat.endsWith('/')
        ? !existsSync(path.join(ROOT, pat))
        : pat.startsWith('**/')
          ? !INSTRUCTION_NAMES.includes(pat.slice(3))
          : !protectedSet.has(pat),
    );
    expect(stale).toEqual([]);
    expect(PROTECTED.length).toBeGreaterThan(50);
  });

  it('★ エージェント指示書は、これから生える物も CODEOWNERS が覆う (threat: T-128)', () => {
    const instructions = [
      'CLAUDE.md', 'src/main/clients/CLAUDE.md', 'docs/CLAUDE.md', 'AGENTS.md', 'packages/a/AGENTS.md',
      '.claude/settings.json', '.claude/rules/a.md', '.claude/commands/a.md', '.claude/skills/s/SKILL.md',
      '.claude/output-styles/o.md', '.claude/agents/auditor.md', '.cursor/rules/a.mdc',
      '.github/copilot-instructions.md', '.github/instructions/a.instructions.md',
      'GEMINI.md', 'docs/CONVENTIONS.md', '.cursorrules', '.windsurfrules', '.clinerules', '.junie/guidelines.md', '.clinerules/a.md',
    ];
    expect(instructions.filter((f) => !isCovered(f)), '足す行: /<path> @hiroto1977').toEqual([]);
    // 標本: 指示書でない物は覆わない (パターンが広すぎて何でも覆う検査にしない)
    for (const f of ['src/x/README.md', 'docs/CLAUDE-notes.md', 'src/NOTAGENTS.md', 'src/x/MYCLAUDE.md']) {
      expect(isCovered(f), f).toBe(false);
    }
  });
});
