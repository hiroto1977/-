import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * 言語の網羅 —— 見張りが無い言語・依存の生態系を作らない (2026-10-25 · threat: T-187)。
 * 追跡している実物から言語・生態系・起動子を導き、台帳 (security/language-coverage.json) と突き合わせる。
 * 新しい言語が入ると落ち、足す守りを名指しする。
 */
const req = createRequire(import.meta.url);
const root = path.join(__dirname, '../../..');
interface Result {
  rows: { id: string; files: number; viaLauncher: boolean; scanners: number; covered: boolean }[];
  problems: string[];
  actionable: number;
  observed: { languages: string[]; ecosystems: string[]; launched: string[] };
}
interface Reg {
  languages: { id: string; status: string; what: string; scanners: string[]; launcherOnly?: boolean }[];
  ecosystems: { id: string; scanners: string[] }[];
  ifAdded: Record<string, string>;
}
const lc = req('../../../scripts/language-coverage.cjs') as {
  analyzeLanguageCoverage: (r: unknown, files: string[], launchers: string[], exists: (e: string) => boolean) => Result;
  observe: (files: string[], launchers: string[]) => { languages: Map<string, number>; manifests: Map<string, string[]>; launched: Set<string> };
  launchersOf: (root: string) => string[];
  realExists: (root: string) => (e: string) => boolean;
  EXTENSION_LANGUAGE: Record<string, string>;
  MANIFEST_ECOSYSTEM: Record<string, string>;
};
const tracked = req('../../../scripts/lib/tracked-cross-check.cjs') as { gitLsFiles: (root: string) => string[] };
const registry = JSON.parse(readOriginalSource(path.join(root, 'security/language-coverage.json'))) as Reg;
const files = tracked.gitLsFiles(root);
const launchers = lc.launchersOf(root);
const exists = lc.realExists(root);
const clone = (): Reg => JSON.parse(JSON.stringify(registry)) as Reg;
const run = (reg: unknown, extra: string[] = [], extraLaunchers: string[] = []): Result =>
  lc.analyzeLanguageCoverage(reg, [...files, ...extra], [...launchers, ...extraLaunchers], exists);

describe('言語の網羅 — 見張りが無い言語を作らない (threat: T-187)', () => {
  it('★ 実物の台帳は、今在る言語・起動子・生態系のすべてを覆い、問題 0 件', () => {
    const r = run(registry);
    expect(r.problems).toEqual([]);
    // 床: 走査が空虚でない (実物の主な言語が見えている)
    expect(r.observed.languages).toEqual(expect.arrayContaining(['javascript-family', 'shell', 'github-actions-yaml']));
    expect(r.observed.ecosystems).toContain('npm');
    expect(r.observed.launched).toEqual(expect.arrayContaining(['javascript-family', 'python']));
  });

  it('★ 新しい言語のファイルが入ると落ち、足す守りを名指しする (threat: T-187)', () => {
    for (const [file, hint] of [['cmd/main.go', 'govulncheck'], ['src/Main.java', 'SpotBugs'], ['Dockerfile', 'hadolint']] as const) {
      const r = run(registry, [file]);
      expect(r.problems.length, file).toBe(1);
      expect(r.problems[0], file).toContain(hint);
    }
    // python はソースごと台帳に在る。同じ言語のファイルを足しても新しい言語にはならない。
    expect(run(registry, ['local-ai/orchestrator/another.py']).problems).toEqual([]);
  });

  it('★ 新しい依存の生態系の定義ファイルが入ると落ちる (threat: T-187)', () => {
    for (const mf of ['go.mod', 'pom.xml', 'Gemfile.lock', 'composer.lock']) {
      const r = run(registry, [`vendor/${mf}`]);
      expect(r.problems.some((p) => p.includes('台帳の ecosystems に載っていない')), mf).toBe(true);
    }
  });

  it('★ PyPI は台帳に在る —— 2 本目の一覧が黙って増えないことは lint:deps の規則 12 が見る (2026-11-21)', () => {
    // 生態系が台帳に載った後は、同じ生態系の定義ファイルが増えてもこの門は鳴らない (言語と同じ)。
    expect(run(registry, ['vendor/requirements.txt']).problems).toEqual([]);
    // 対照: 台帳から pypi の行を消すと、実物の一覧で落ちる。
    const g = clone();
    g.ecosystems = g.ecosystems.filter((e) => e.id !== 'pypi');
    expect(run(g, ['zero-trust-gateway/requirements.txt']).problems.some((p) => p.includes('台帳の ecosystems に載っていない'))).toBe(true);
    // 増えた一覧を名指しするのは、一覧の台帳 (PYPI_LOCKS) との両方向の突き合わせ。
    const locks = req('../../../scripts/lib/pypi-locks.cjs') as {
      PYPI_LOCKS: string[];
      trackedPypiManifests: (files: string[]) => string[];
      checkPypiLedger: (tracked: string[], ledger?: string[]) => string[];
    };
    const tracked = locks.trackedPypiManifests(['zero-trust-gateway/requirements.txt', 'vendor/requirements.txt', 'vendor/notes.txt']);
    expect(tracked).toEqual(['vendor/requirements.txt', 'zero-trust-gateway/requirements.txt']);
    const problems = locks.checkPypiLedger(tracked);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('vendor/requirements.txt');
    expect(locks.checkPypiLedger(['zero-trust-gateway/requirements.txt'])).toEqual([]);
    expect(locks.checkPypiLedger([])).toHaveLength(locks.PYPI_LOCKS.length);
  });

  it('★ 台帳から今在る言語の行を消すと落ちる (網が無いまま増えた形)', () => {
    for (const lang of ['javascript-family', 'shell', 'github-actions-yaml', 'windows-batch']) {
      const g = clone();
      g.languages = g.languages.filter((l) => l.id !== lang);
      expect(run(g).problems.some((p) => p.startsWith(`${lang}:`)), lang).toBe(true);
    }
  });

  it('★ 起動子 (uvx) の Python は台帳に必要 —— リポジトリに .py が無くても実行時に入る', () => {
    const g = clone();
    g.languages = g.languages.filter((l) => l.id !== 'python');
    expect(run(g).problems.some((p) => p.includes('python') && p.includes('起動子'))).toBe(true);
  });

  it('強制物が実在しない・空・古い行は落ちる (双方向)', () => {
    const noFile = clone();
    noFile.languages[0]!.scanners = ['scripts/does-not-exist.cjs'];
    expect(run(noFile).problems.some((p) => p.includes('実在しない'))).toBe(true);
    const empty = clone();
    empty.languages[1]!.scanners = [];
    expect(run(empty).problems.some((p) => p.includes('強制物 (scanners) が無い'))).toBe(true);
    const stale = clone();
    stale.languages.push({ id: 'ruby', status: 'present', what: 'rb', scanners: ['package.json'] });
    expect(run(stale).problems.some((p) => p.startsWith('ruby:') && p.includes('古い行'))).toBe(true);
    const noIfAdded = clone();
    noIfAdded.ifAdded = {};
    expect(run(noIfAdded).problems.some((p) => p.includes('ifAdded'))).toBe(true);
  });

  it('台帳が読めなければ 0 件と混ぜず「読めない」と言う', () => {
    for (const bad of [null, {}, { languages: [] }, { languages: 'x' }]) {
      const r = run(bad);
      expect(r.actionable).toBeGreaterThanOrEqual(1);
      expect(r.problems[0]).toContain('読めない');
    }
  });

  it('ifAdded は拡張子表・定義ファイル表のすべての言語・生態系の守りを持つ (まだ無い言語に何を足すか)', () => {
    const langs = new Set(Object.values(lc.EXTENSION_LANGUAGE));
    // 今在る言語は台帳の languages が持つので、ifAdded が要るのは**まだ無い**言語。
    const present = new Set(registry.languages.map((l) => l.id));
    const missing = [...langs].filter((l) => !present.has(l) && !(l in registry.ifAdded));
    expect(missing, 'ifAdded に守りが書かれていない言語').toEqual([]);
    const ecos = new Set(Object.values(lc.MANIFEST_ECOSYSTEM));
    const presentEco = new Set(registry.ecosystems.map((e) => e.id));
    const missingEco = [...ecos].filter((e) => !presentEco.has(e) && !(e in registry.ifAdded));
    expect(missingEco, 'ifAdded に守りが書かれていない生態系').toEqual([]);
    for (const [k, v] of Object.entries(registry.ifAdded)) expect(v.trim().length, k).toBeGreaterThan(10);
  });

  it('導出の針: 拡張子・名前・定義ファイル・起動子が言語・生態系へ引ける (標本)', () => {
    const o = lc.observe(['a.py', 'b/c.GO', 'Dockerfile', 'x/go.mod', 'README.md', 'noext'], ['uvx', '/usr/bin/npx']);
    expect([...o.languages.keys()].sort()).toEqual(['dockerfile', 'go', 'python']);
    expect([...o.manifests.keys()]).toEqual(['go']);
    expect([...o.launched].sort()).toEqual(['javascript-family', 'python']);
  });
});
