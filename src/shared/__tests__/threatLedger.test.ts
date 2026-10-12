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

  it('★ CODEOWNERS は整合性チェーンの保護対象をすべて覆う (threat: T-003)', () => {
    const covered = (p: string) =>
      patterns.some((pat) => (pat.endsWith('/') ? `/${p}`.startsWith(pat) : pat === `/${p}`));
    const uncovered = PROTECTED.filter((p) => !covered(p));
    expect(uncovered, `CODEOWNERS へ足す行:\n${uncovered.map((p) => `/${p} @hiroto1977`).join('\n')}`).toEqual([]);
    // どの行も所有者を名乗る。
    for (const l of lines) expect(l, l).toMatch(/\s@[\w-]+$/);
  });

  it('★ ファイルを名指す行は、保護対象か実在するディレクトリだけ (古い行を残さない)', () => {
    const protectedSet = new Set(PROTECTED.map((p) => `/${p}`));
    const stale = patterns.filter((pat) =>
      pat.endsWith('/') ? !existsSync(path.join(ROOT, pat)) : !protectedSet.has(pat),
    );
    expect(stale).toEqual([]);
    expect(PROTECTED.length).toBeGreaterThan(50);
  });
});
