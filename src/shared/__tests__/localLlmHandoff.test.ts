import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAWS } from '../ontology/laws';
import { redactSecrets } from '../redact';
import { SERVICE_IDS } from '../serviceId';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **ローカル LLM への引継ぎパック (`scripts/lib/local-llm-handoff.cjs`)。**
 *
 * 渡す物は「全部」ではなく「小さな文脈に畳んだ核」(CLAUDE.md は約 1.1 MB で小さなモデルに入らない)。
 * 留めるのは次の 5 つ:
 *   ① 予算 —— どの tier でも SYSTEM が文字数予算に収まる・節は丸ごと入るか丸ごと外れる (途中で切れない)
 *   ② 事実が実物と一致する —— サービス数・ゲート数・法則 (id / family / 名前)・脅威台帳の件数
 *   ③ 読めない物は「不明」と言う (0 に倒さない)・実在しないパスは道案内に出さない
 *   ④ 決定論 (同じ木から同じ bytes)・秘密の形を含まない・Modelfile の SYSTEM を壊さない
 *   ⑤ 道具の振る舞い —— 既定は書かない・出力先はリポジトリの中だけ・tier の既定モデルは導入 script と同じ
 */

const ROOT = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);

interface Facts {
  serviceCount: number | null;
  gateCount: number | null;
  laws: { id: string; family: string; name: string }[] | null;
  threats: { count: number; backlog: number | null; recent: { id: string; title: string }[] } | null;
  sources: Record<string, string>;
}
interface Built {
  files: Record<string, string>;
  report: {
    tier: string;
    model: string;
    numCtx: number;
    budgetChars: number;
    systemChars: number;
    included: string[];
    dropped: string[];
    lawsInSystem: number;
    lawsTotal: number | null;
  };
}
const lib = req('../../../scripts/lib/local-llm-handoff.cjs') as {
  TIERS: Record<string, { model: string; numCtx: number; budget: number; laws: boolean }>;
  CORE_RULES: { short: string; detail: string }[];
  POINTERS: [string, string][];
  collectFacts: (root: string) => Facts;
  buildHandoff: (root: string, tier: string) => Built;
  writeHandoff: (outDir: string, files: Record<string, string>) => string;
  sanitizeForModelfile: (t: string) => string;
};
const TIER_NAMES = Object.keys(lib.TIERS);
const len = (s: string): number => Array.from(s).length;

describe('引継ぎパック —— 予算', () => {
  for (const tier of TIER_NAMES) {
    it(`★ ${tier}: SYSTEM は予算に収まり、規律・約束・手順・罠・事実の核は必ず入る`, () => {
      const { files, report } = lib.buildHandoff(ROOT, tier);
      const system = files['SYSTEM.md']!;
      expect(len(system.trimEnd())).toBeLessThanOrEqual(lib.TIERS[tier]!.budget);
      expect(report.systemChars).toBe(len(system.trimEnd()));
      for (const must of ['規律', 'あなたの限界', '手順', '罠', '事実']) expect(report.included).toContain(must);
      for (const r of lib.CORE_RULES) expect(system).toContain(r.short);
    });
  }

  it('★ 入らなかった節は丸ごと外れる (途中で切れた規則を残さない)', () => {
    const { files, report } = lib.buildHandoff(ROOT, 'small');
    expect(report.dropped).toContain('道案内');
    expect(files['SYSTEM.md']).not.toContain('## 詳細が要るときに読む');
    // 入った節の見出しは、その節の最後の行まで揃っている (規律は 8 本・手順は 8 本)
    const rules = (files['SYSTEM.md']!.match(/^\d+\. /gm) ?? []).length;
    expect(rules).toBe(lib.CORE_RULES.length + 8);
  });

  it('大きい tier ほど多く入る (小 ≤ 中 ≤ 大)・小さい tier は法則の索引を持たない', () => {
    const sizes = TIER_NAMES.map((t) => lib.buildHandoff(ROOT, t).report.systemChars);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(lib.buildHandoff(ROOT, 'small').report.lawsInSystem).toBe(0);
    expect(lib.buildHandoff(ROOT, 'medium').report.lawsInSystem).toBeGreaterThan(0);
  });
});

describe('引継ぎパック —— 事実が実物と一致する', () => {
  const facts = lib.collectFacts(ROOT);

  it('★ サービス数は SERVICE_IDS・ゲート数は verify:all・法則は LAWS (id / family / 名前の並びまで)', () => {
    expect(facts.serviceCount).toBe(SERVICE_IDS.length);
    const pkg = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
    expect(facts.gateCount).toBe(pkg.scripts['verify:all']!.split('&&').length);
    expect(facts.laws).toEqual(LAWS.map((l) => ({ id: l.id, family: l.family, name: l.name })));
  });

  it('脅威台帳の件数と狩り残しは実物の数', () => {
    const ledger = JSON.parse(readOriginalSource(path.join(ROOT, 'security/threat-ledger.json'))) as {
      threats: { id: string }[];
      huntBacklog: unknown[];
    };
    expect(facts.threats?.count).toBe(ledger.threats.length);
    expect(facts.threats?.backlog).toBe(ledger.huntBacklog.length);
    expect(facts.threats?.recent.map((t) => t.id)).toEqual(ledger.threats.slice(-5).map((t) => t.id));
  });

  it('★ 読めない木では 0 に倒さず「不明」と言い、実在しないパスを道案内に出さない', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'lh-empty-'));
    try {
      const f = lib.collectFacts(empty);
      expect([f.serviceCount, f.gateCount, f.laws, f.threats]).toEqual([null, null, null, null]);
      const { files, report } = lib.buildHandoff(empty, 'large');
      expect(files['SYSTEM.md']).toContain('サービス: 不明 件');
      expect(files['SYSTEM.md']).not.toContain('サービス: 0');
      expect(files['SYSTEM.md']).not.toContain('## 詳細が要るときに読む');
      expect(report.lawsTotal).toBeNull();
      expect(files['laws-index.md']).toContain('読めませんでした');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('道案内に出すパスはどれも実在する', () => {
    const system = lib.buildHandoff(ROOT, 'large').files['SYSTEM.md']!;
    const listed = [...system.matchAll(/^- ([\w./-]+) — /gm)].map((m) => m[1]!);
    expect(listed.length).toBe(lib.POINTERS.length);
    for (const rel of listed) expect(existsSync(path.join(ROOT, rel)), rel).toBe(true);
  });
});

describe('引継ぎパック —— 決定論・秘密・Modelfile', () => {
  it('★ 同じ木から同じ bytes (時刻も乱数も入れない)', () => {
    for (const tier of TIER_NAMES) {
      expect(lib.buildHandoff(ROOT, tier).files).toEqual(lib.buildHandoff(ROOT, tier).files);
    }
  });

  it('★ 出力に秘密の形を含まない (伏字を通しても変わらない)', () => {
    for (const tier of TIER_NAMES) {
      for (const [name, text] of Object.entries(lib.buildHandoff(ROOT, tier).files)) {
        expect(redactSecrets(text), `${tier}/${name}`).toBe(text);
      }
    }
    // 針が生きている: 伏字は実際に秘密の形を変える
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789')).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('★ Modelfile は FROM / num_ctx が tier の表どおりで、SYSTEM の三重引用符は 1 組だけ', () => {
    for (const tier of TIER_NAMES) {
      const t = lib.TIERS[tier]!;
      const mf = lib.buildHandoff(ROOT, tier).files['Modelfile']!;
      expect(mf).toContain(`FROM ${t.model}`);
      expect(mf).toContain(`PARAMETER num_ctx ${t.numCtx}`);
      expect(mf.split('"""').length).toBe(3);
      expect(mf).toMatch(/SYSTEM """[\s\S]*"""\n$/);
    }
    expect(lib.sanitizeForModelfile('a"""b\u0007c')).toBe("a'''bc");
  });

  it('tier の既定モデルは導入 script (local-llm-setup.sh) の層と同じ', () => {
    const sh = readOriginalSource('scripts/local-llm-setup.sh');
    for (const t of TIER_NAMES) {
      expect(sh, t).toContain(`${t}) `);
      expect(sh, t).toContain(`"${lib.TIERS[t]!.model}"`);
    }
  });
});

describe('引継ぎパック —— 道具の振る舞い', () => {
  const run = (args: string[]): { code: number | null; out: string } => {
    const r = spawnSync('node', ['scripts/local-llm-handoff.cjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('★ 既定は計画の表示だけで何も書かない', () => {
    const marker = 'reports/__never-written-handoff__';
    const r = run(['--out', marker]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('計画の表示だけです');
    expect(existsSync(path.join(ROOT, marker))).toBe(false);
  });

  it('不正な引数は exit 2 で断る・出力先はリポジトリの外へ出せない', () => {
    expect(run(['--tier', 'huge']).code).toBe(2);
    expect(run(['--nope']).code).toBe(2);
    const outside = run(['--write', '--out', '../outside-handoff']);
    expect(outside.code).toBe(2);
    expect(outside.out).toContain('リポジトリの中だけ');
    expect(existsSync(path.join(ROOT, '../outside-handoff'))).toBe(false);
  });

  it('writeHandoff は出力先の外へ書かない', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lh-out-'));
    try {
      expect(() => lib.writeHandoff(dir, { '../escape.txt': 'x' })).toThrow('出力先の外へは書けません');
      mkdirSync(path.join(dir, 'ok'), { recursive: true });
      lib.writeHandoff(path.join(dir, 'ok'), { 'a.txt': 'x' });
      expect(readOriginalSource(path.join(dir, 'ok', 'a.txt'))).toBe('x');
      expect(existsSync(path.join(dir, 'escape.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('この道具は子プロセスもネットワークも使わない (注記を除いた原文)', () => {
    for (const rel of ['scripts/lib/local-llm-handoff.cjs', 'scripts/local-llm-handoff.cjs']) {
      const src = stripComments(readOriginalSource(rel));
      const NEEDLE = /child_process|\bspawn|\bexecSync|\bexecFile|\bfetch\(|node:https?|node:net/;
      expect(src, rel).not.toMatch(NEEDLE);
      // 針が生きている: 実際にその綴りへ当たる (RegExp#exec は子プロセスではないので当たらない)
      expect("require('node:child_process').spawnSync(").toMatch(NEEDLE);
      expect('re.exec(text)').not.toMatch(NEEDLE);
    }
  });
});
