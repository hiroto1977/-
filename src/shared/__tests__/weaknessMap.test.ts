import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **弱点の種類 → このアプリの守り の対応表 (`security/weakness-map.json`) が散文でないこと。**
 * (threat: T-164 — 脅威ウォッチが毎日この表と「今悪用されている種類」を突き合わせる)
 *
 * 表の各行が名指す守りは実在しなければならない。実在しない守りを名乗る行は、脅威ウォッチに
 * 「この種類には守りがある」と誤って答えさせる (見張っているつもり)。表は進化する: 新しい種類は
 * 守り (門・検査) を足してから載せ、該当しない種類は理由つきで `notApplicable` に置く。
 */

const ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => readOriginalSource(path.join(ROOT, f));
type Cls = { id: string; name: string; kind: string; cwes: string[]; defenses: { files: string[]; gates: string[]; threats: string[] } };
const map = JSON.parse(read('security/weakness-map.json')) as {
  kinds: Record<string, string>;
  classes: Cls[];
  notApplicable: { cwes: string[]; reason: string }[];
};
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const ledger = JSON.parse(read('security/threat-ledger.json')) as { threats: { id: string }[] };
const threatIds = new Set(ledger.threats.map((t) => t.id));

const SHORTHAND = /^(同上|TBD|TODO|要検討)/;

describe('弱点の対応表 (threat: T-164)', () => {
  it('省略形の針は実際に省略形へ当たる (空の検査にしない)', () => {
    expect('同上').toMatch(SHORTHAND);
    expect('SQL を組み立てない (本物の理由)').not.toMatch(SHORTHAND);
  });

  it('★ 種類の id は一意で、kind は決まった語彙、守りが 1 つ以上ある', () => {
    const ids = map.classes.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of map.classes) {
      expect(Object.keys(map.kinds), c.id).toContain(c.kind);
      expect(c.defenses.files.length + c.defenses.gates.length, `${c.id} に守りが無い`).toBeGreaterThan(0);
      expect(c.cwes.length, c.id).toBeGreaterThan(0);
    }
  });

  it('★ CWE は形が正しく、種類をまたいで 1 度しか現れない (どちらの守りか曖昧にしない)', () => {
    const all = [...map.classes.flatMap((c) => c.cwes), ...map.notApplicable.flatMap((n) => n.cwes)];
    for (const w of all) expect(w).toMatch(/^CWE-\d{1,5}$/);
    const dup = all.filter((w, i) => all.indexOf(w) !== i);
    expect(dup, `重複: ${dup.join(', ')}`).toEqual([]);
  });

  it('★ 名指した守りは実在する (ファイル・npm の門・台帳の脅威)', () => {
    for (const c of map.classes) {
      for (const f of c.defenses.files) expect(existsSync(path.join(ROOT, f)), `${c.id}: ${f} が無い`).toBe(true);
      for (const g of c.defenses.gates) expect(pkg.scripts[g], `${c.id}: 門 ${g} が package.json に無い`).toBeTruthy();
      for (const t of c.defenses.threats) expect(threatIds.has(t), `${c.id}: 台帳に ${t} が無い`).toBe(true);
    }
  });

  it('★ 該当なしの種類は理由を持つ (「同上」「TBD」は理由にならない)', () => {
    expect(map.notApplicable.length).toBeGreaterThan(0);
    for (const n of map.notApplicable) {
      expect(n.reason.length, n.cwes.join(',')).toBeGreaterThanOrEqual(30);
      expect(n.reason).not.toMatch(SHORTHAND);
    }
  });

  it('基盤 (platform) の種類は更新で追うので、依存の門を守りに持つ', () => {
    for (const c of map.classes.filter((x) => x.kind === 'platform')) {
      expect(c.defenses.gates, c.id).toContain('lint:deps');
    }
  });

  it('このセッションまでに直した種類 (ファイル名・遠隔実行・ReDoS) が表に載っている', () => {
    const has = (cwe: string) => map.classes.some((c) => c.cwes.includes(cwe));
    expect(has('CWE-22') && has('CWE-78') && has('CWE-1333')).toBe(true);
  });
});
