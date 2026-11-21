import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * 王冠の宝石 —— 確率に依らない守り (2026-10-23 · threat: T-169)。
 * 『侵入確率が極めて低いから』を守りの根拠にしない。守る物ごとに、破られた後を前提にした
 * 4 層 (防ぐ・封じ込める・気付く・戻す) が別々の強制物で揃っていることを機械で見る。
 */
const req = createRequire(import.meta.url);
const root = path.join(__dirname, '../../..');
const cj = req('../../../scripts/crown-jewels.cjs') as {
  analyzeCrownJewels: (r: unknown, exists: (e: string) => boolean) => { jewels: { id: string; kinds: string[]; distinctEnforcers?: number }[]; problems: string[]; actionable: number };
  realExists: (root: string) => (e: string) => boolean;
  dismissalIn: (t: string) => string | null;
  KINDS: string[];
};
const registry = JSON.parse(readOriginalSource(path.join(root, 'security/crown-jewels.json'))) as { jewels: { id: string; impact: string; layers: { kind: string; what: string; enforcedBy: string[] }[] }[] };
const exists = cj.realExists(root);
const clone = () => JSON.parse(JSON.stringify(registry)) as typeof registry;
type Jewel = (typeof registry)['jewels'][number];
const jewelAt = (g: typeof registry, i: number): Jewel => g.jewels[i]!;
const layerAt = (j: Jewel, i: number): Jewel['layers'][number] => j.layers[i]!;

describe('王冠の宝石 — 確率に依らない 4 層 (threat: T-169)', () => {
  it('★ 実物の台帳は問題 0 件で、宝石が 5 つ以上、すべて 4 層・catastrophic', () => {
    const r = cj.analyzeCrownJewels(registry, exists);
    expect(r.problems).toEqual([]);
    expect(r.jewels.length).toBeGreaterThanOrEqual(5);
    for (const j of registry.jewels) expect(j.impact, j.id).toBe('catastrophic');
    for (const j of r.jewels) expect(j.kinds.length, j.id).toBe(4);
  });

  it('★ 4 層のどれかを消すと落ちる (層ごと)', () => {
    for (const kind of cj.KINDS) {
      const g = clone();
      jewelAt(g, 0).layers = jewelAt(g, 0).layers.filter((l) => l.kind !== kind);
      const r = cj.analyzeCrownJewels(g, exists);
      expect(r.problems.some((p) => p.includes(`${kind} 層が無い`)), kind).toBe(true);
    }
  });

  it('★ 実在しない強制物 (綴り違い) を不在として落とす', () => {
    const g = clone();
    layerAt(jewelAt(g, 0), 0).enforcedBy = ['src/main/doesNotExist.ts'];
    expect(cj.analyzeCrownJewels(g, exists).problems.join('\n')).toContain('実在しない');
  });

  it('★ prevent と contain が同じ強制物に頼ると落ちる (threat: T-169)', () => {
    const g = clone();
    const j = jewelAt(g, 0);
    const p = j.layers.find((l) => l.kind === 'prevent')!;
    const c = j.layers.find((l) => l.kind === 'contain')!;
    c.enforcedBy = [...c.enforcedBy, p.enforcedBy[0]!];
    expect(cj.analyzeCrownJewels(g, exists).problems.join('\n')).toContain('共有している');
  });

  it('★ 別々の強制物が 3 個未満だと落ちる', () => {
    const g = clone();
    const j = jewelAt(g, 0);
    j.layers = j.layers.map((l, i) => ({ ...l, enforcedBy: [i % 2 === 0 ? 'electron-builder.json' : 'package.json'] }));
    expect(cj.analyzeCrownJewels(g, exists).problems.join('\n')).toContain('別々の強制物');
  });

  it('★ 確率で守りを諦める言い回しを層の説明に書けない (針が当たる標本つき)', () => {
    for (const t of ['確率が低いので省く', '起きにくい', 'まず起きない', '実害は今日 0', 'This is unlikely', '到達しない']) {
      expect(cj.dismissalIn(t), t).not.toBeNull();
    }
    expect(cj.dismissalIn('破られても平文はレンダラーに返らない')).toBeNull();
    const g = clone();
    layerAt(jewelAt(g, 1), 2).what = 'まず起きないので検知は置かない';
    expect(cj.analyzeCrownJewels(g, exists).problems.join('\n')).toContain('確率で諦める');
  });

  it('台帳が読めない・空なら 0 件と混ぜず要対応', () => {
    expect(cj.analyzeCrownJewels(null, exists).actionable).toBe(1);
    expect(cj.analyzeCrownJewels({ jewels: [] }, exists).actionable).toBe(1);
  });

  it('毎日の報告が同じ測定を載せ、台帳は CODEOWNERS で覆われる', () => {
    const report = readOriginalSource(path.join(root, 'scripts/dependency-audit-report.cjs'));
    expect(report).toContain("require('./crown-jewels.cjs')");
    expect(report).toContain('analyzeCrownJewels(');
    const owners = readOriginalSource(path.join(root, '.github/CODEOWNERS'));
    expect(owners).toContain('/src/shared/__tests__/crownJewels.test.ts');
  });
});
