import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { LAWS, LAW_FAMILIES, validateLawLedger, type Law, type LawLedgerFacts } from '../ontology/laws';
import { BUILDS, BUILD_IDS, ENTITY_CLASSES, ZONES, ZONE_IDS } from '../ontology/vocabulary';
import { lawsWithoutMachine } from '../ontology/render';
import { REPO_ROOT, verifyAllGates } from '../../__tests__/ontologyFacts';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **オントロジーの語彙と法則の台帳を、実物と突き合わせる。** (2026-09-18)
 *
 * 台帳が指す物 (ゲート・検査・workflow・文書) が消えれば落ち、法則が執行者を
 * 持たなければ落ちる。「機械の無い法則」の集合は字面で留める —— 増えるのも減るのも
 * 意図した変更でなければならない (散文で述べた規則は落ちない、を知っている上での分母)。
 *
 * ここには法則の台帳が「機械あり」と名乗るのに機械が無かった 3 つの機械も置く:
 *   - negative-control: 自作ゲートが --self-test を持つ (例外は理由つき)
 *   - fold-must-pair: 「必ず … と併用する」の注記は台帳の分だけ
 *   - key-bound-to-slot: vault は暗号文を保管場所 (additionalData) に束ねる
 */

const req = createRequire(join(REPO_ROOT, 'package.json'));
const exists = (rel: string): boolean => existsSync(join(REPO_ROOT, rel));

function facts(): LawLedgerFacts {
  const pkg = JSON.parse(readOriginalSource(join(REPO_ROOT, 'package.json'))) as { scripts: Record<string, string> };
  return {
    scripts: new Set(Object.keys(pkg.scripts)),
    verifyAll: new Set(verifyAllGates()),
    exists,
  };
}

const sample = (over: Partial<Law>): Law => ({
  id: 'sample-law',
  family: 'gate-hygiene',
  name: '標本',
  statement: '標本',
  provenance: ['標本'],
  enforcedBy: [{ kind: 'gate', script: 'lint:imports' }],
  ...over,
});

describe('法則の台帳は実物を指している', () => {
  const f = facts();

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(f.scripts.size).toBeGreaterThan(40);
    expect(f.verifyAll.size).toBeGreaterThanOrEqual(30);
    expect(LAWS.length).toBeGreaterThanOrEqual(60);
  });

  it('執行者が指す物はすべて実在し、法則は執行者と出典を持つ', () => {
    expect(validateLawLedger(LAWS, f)).toEqual([]);
  });

  it('全部の家系に法則が 2 つ以上在る', () => {
    for (const family of Object.keys(LAW_FAMILIES)) {
      expect(LAWS.filter((l) => l.family === family).length, family).toBeGreaterThanOrEqual(2);
    }
  });

  it('★ 標本: 実在しない検査・verify:all に無いゲート・執行者なし・重複 id はそれぞれ鳴る', () => {
    const ghost = sample({ id: 'ghost', enforcedBy: [{ kind: 'test', file: 'src/shared/__tests__/noSuchFile.test.ts' }] });
    expect(validateLawLedger([ghost], f).map((p) => p.problem)).toEqual(['検査が実在しない: src/shared/__tests__/noSuchFile.test.ts']);
    const notGate = sample({ id: 'not-gate', enforcedBy: [{ kind: 'gate', script: 'e2e' }] });
    expect(validateLawLedger([notGate], f).map((p) => p.problem)).toEqual(['ゲート e2e が verify:all に並んでいない']);
    const unknownGate = sample({ id: 'unknown-gate', enforcedBy: [{ kind: 'gate', script: 'lint:nope' }] });
    expect(validateLawLedger([unknownGate], f)).toHaveLength(1);
    const none = sample({ id: 'none', enforcedBy: [] });
    expect(validateLawLedger([none], f).map((p) => p.problem)).toEqual(['執行者が 1 つも無い (散文だけなら prose を書く)']);
    const dup = [sample({ id: 'dup' }), sample({ id: 'dup' })];
    expect(validateLawLedger(dup, f).map((p) => p.problem)).toEqual(['id が重複している']);
    const emptyWhy = sample({ id: 'empty-why', enforcedBy: [{ kind: 'prose', where: 'CLAUDE.md', why: '  ' }] });
    expect(validateLawLedger([emptyWhy], f).map((p) => p.problem)).toEqual(['機械が無い理由が空']);
    // 対照の対照: 正しい標本は鳴らない
    expect(validateLawLedger([sample({})], f)).toEqual([]);
  });

  it('機械の無い法則は、この台帳の分だけ (双方向)', () => {
    /*
     * 増やすときは理由 (`prose.why`) を書き、ここへ足す。減らすとき (機械を付けたとき) は
     * ここから消す。どちらも意図した変更としてこの行で鳴る。
     */
    const PROSE_ONLY = [
      'claim-unit-not-file',
      'manual-check-becomes-gate',
      'measure-before-claim',
      'no-weakness-as-spec',
      'parity-is-not-correctness',
    ];
    expect(lawsWithoutMachine(LAWS).map((l) => l.id).sort()).toEqual([...PROSE_ONLY].sort());
  });
});

describe('語彙は実物と一致する', () => {
  it('層の import 許可表は lint:imports の ALLOW と同じ (写しを検査で留める)', () => {
    const gate = req(join(REPO_ROOT, 'scripts', 'check-import-boundaries.cjs')) as {
      ALLOW: Record<string, string[]>;
      ZONES: Record<string, string>;
    };
    expect(Object.keys(gate.ZONES).sort()).toEqual([...ZONE_IDS].sort());
    for (const z of ZONES) {
      expect([...z.mayImport].sort(), z.id).toEqual([...gate.ALLOW[z.id]!].sort());
    }
  });

  it('層とビルドの帰属は両方向に一致する', () => {
    for (const b of BUILDS) {
      for (const z of b.zones) expect(ZONE_IDS).toContain(z);
    }
    for (const z of ZONES) {
      for (const b of z.shipsIn) expect(BUILD_IDS).toContain(b);
      for (const b of BUILDS) {
        expect(b.zones.includes(z.id), `${z.id} ∈ ${b.id}`).toBe(z.shipsIn.includes(b.id));
      }
    }
    // node を読める層はデスクトップにしか出荷されない
    for (const z of ZONES) {
      if (z.nodeAccess !== 'none') expect(z.shipsIn).toEqual(['desktop']);
    }
  });

  it('実体クラスの台帳と機械はすべて実在し、id は一意', () => {
    const ids = ENTITY_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ENTITY_CLASSES) {
      expect(c.ledger.length, c.id).toBeGreaterThan(0);
      expect(c.machines.length, c.id).toBeGreaterThan(0);
      for (const p of [...c.ledger, ...c.machines]) expect(exists(p), `${c.id}: ${p}`).toBe(true);
    }
  });
});

describe('negative-control: 自作ゲートは --self-test を持つ', () => {
  /** --self-test を持たないゲートと、その理由 (双方向)。 */
  const WITHOUT_SELF_TEST: Readonly<Record<string, string>> = {
    typecheck: '外部ツール (tsc)。対照は typecheckCoverage.test.ts が「型の誤りを植えると 1 件出る」で持つ',
    lint: '外部ツール (eslint)',
    'lint:doi-prefix': '知識コーパス系。2026-08-25 に実物へ違反を植えて鳴ることを確かめた (ARCHITECTURE TL;DR)',
    'lint:knowledge-refs': '同上',
    'verify:orchestration': '同上',
    'chain:verify': '対照は integrityChainWitness.test.ts (保護対象を改変すると鳴る) が持つ',
  };

  it('verify:all の各ゲートは --self-test を走らせる (例外は台帳の分だけ)', () => {
    const pkg = JSON.parse(readOriginalSource(join(REPO_ROOT, 'package.json'))) as { scripts: Record<string, string> };
    const gates = verifyAllGates();
    expect(gates.length).toBeGreaterThanOrEqual(30);
    const without = gates.filter((g) => !/--self-test\b/.test(pkg.scripts[g] ?? ''));
    expect(without.sort()).toEqual(Object.keys(WITHOUT_SELF_TEST).sort());
    for (const why of Object.values(WITHOUT_SELF_TEST)) expect(why.trim().length).toBeGreaterThan(0);
  });
});

describe('fold-must-pair: 「必ず … と併用する」の注記は台帳の分だけ', () => {
  const NOTE = /必ず[^\n]{0,40}併用/;

  /** 出荷 code の中で許す出現と理由。 */
  const LEDGER: Readonly<Record<string, { count: number; why: string }>> = {
    'src/shared/ontology/laws.ts': {
      count: 1,
      why: '法則 fold-must-pair の名前がその注記の形を名指しで述べる。規則の説明であって、併用を求める注記ではない',
    },
    'src/shared/httpLimits.ts': {
      count: 2,
      why: '1 つは畳んだ記録 (2026-08-31 に readBodyWithCap の中へ畳んだ経緯)、1 つは畳んだ先から呼ばれる側 (declaredLengthExceeds) の注記。対は既に畳まれていて、注記は「単独では守りにならない」を述べる',
    },
  };

  function shippedSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readOriginalDirEntries(dir)) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
      }
    };
    walk(join(REPO_ROOT, 'src'));
    return out;
  }

  it('★ 標本: 注記の形に当たる', () => {
    expect(NOTE.test('必ず `readBodyWithCap` と併用する')).toBe(true);
    expect(NOTE.test('併用してもよい (必ずではない)')).toBe(false);
  });

  it('出荷 code の出現は台帳と一致する (双方向)', () => {
    const found = new Map<string, number>();
    for (const file of shippedSources()) {
      const n = readOriginalSource(file).split('\n').filter((l) => NOTE.test(l)).length;
      if (n > 0) found.set(file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'), n);
    }
    const expected = new Map(Object.entries(LEDGER).map(([k, v]) => [k, v.count]));
    expect([...found.entries()].sort()).toEqual([...expected.entries()].sort());
    expect(readdirSync(join(REPO_ROOT, 'src')).length).toBeGreaterThan(0);
  });
});

describe('safety-limits-not-parameters: 安全上限は parameters.ts の台帳に載らない', () => {
  /*
   * `writeFieldLimits.test.ts` は書く欄の天井 3 つの名前を見ている。ここは**単位と名前の形**で
   * 台帳全体を見る —— 締切 (ms / 秒)・大きさ (byte)・暗号の反復・入力長は利用者に触らせない
   * (CLAUDE.md Conventions)。台帳の `unit` と `id` から機械的に決まる。
   */
  const SAFETY_UNITS = new Set(['ms', 'ミリ秒', '秒', 'byte', 'bytes', 'B', 'KiB', 'MiB', 'MB', 'KB']);
  const SAFETY_ID = /timeout|byte|iteration|ceiling|maxchars|deadline/i;

  it('台帳の単位と id に安全上限の形が無い (標本つき)', () => {
    const params = readOriginalSource(join(REPO_ROOT, 'src/shared/parameters.ts'));
    const units = [...params.matchAll(/unit:\s*'([^']*)'/g)].map((m) => m[1]!);
    const ids = [...params.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(units.length, '台帳が読めていない').toBeGreaterThanOrEqual(100);
    expect(ids.length).toBeGreaterThanOrEqual(100);
    expect(units.filter((u) => SAFETY_UNITS.has(u))).toEqual([]);
    expect(ids.filter((id) => SAFETY_ID.test(id))).toEqual([]);
    // 標本: 針は安全上限の形に当たる (綴りが外れて空の検査になっていない)
    expect(SAFETY_UNITS.has('ms')).toBe(true);
    expect(SAFETY_ID.test('http.timeoutMs')).toBe(true);
    expect(SAFETY_ID.test('deduction.spouseSpecialIncomeLimit')).toBe(false); // 「限度額」は法定値であって安全上限ではない
  });
});

describe('key-bound-to-slot: vault は暗号文を保管場所に束ねる', () => {
  it('封緘と解錠の両方が additionalData を渡す', () => {
    const vault = readOriginalSource(join(REPO_ROOT, 'src/renderer/security/vault.ts'));
    const calls = vault.split('\n').filter((l) => /\{\s*name:\s*'AES-GCM'.*additionalData:\s*aad\b/.test(l));
    expect(calls.length, '封緘と解錠の 2 か所').toBeGreaterThanOrEqual(2);
  });

  it('★ 標本: additionalData を落とした行は数えない', () => {
    const line = "        : { name: 'AES-GCM', iv: iv as BufferSource },";
    expect(/\{\s*name:\s*'AES-GCM'.*additionalData:\s*aad\b/.test(line)).toBe(false);
  });
});
