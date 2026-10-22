import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **脅威ウォッチ (`scripts/threat-watch.cjs`) — 世間で悪用されている弱点を毎日このアプリの守りと突き合わせる。**
 * (threat: T-164)
 *
 * `npm audit` は「名前の付いた勧告が我々の依存に在るか」しか見ない。世間を賑わせる問題 (基盤の欠陥・
 * ブラウザエンジンの 0-day・ファイル名の細工) は名前が載る前に悪用が始まり、同じ**種類**の欠陥を
 * 自前のコードが許していないかは名前の一致では分からない。ここで留めるのは:
 *
 *   ① 判定 —— KEV に載る勧告は exploited・EPSS が高ければ likely・直近 30 日の悪用を弱点の種類ごとに数え、
 *      表に無い種類が急増したら要対応にする
 *   ② 失敗の向き —— 測れなかったことを「0 件」として通さない (配信が欠ける・落ちる・上限超え・形が不正)
 *   ③ 網の口 —— 送り先は定数の 3 ホストだけ・転送に追随しない・送る物は名前と版だけ・勧告 id を URL に載せる前に検める
 *   ④ 配線 —— 毎日の報告 (dependency-audit) に組み込まれ、測れなかったものは数える
 *
 * 網には出ない: `fetchImpl` を注入して全経路を通す。
 */

const req = createRequire(import.meta.url);
type Watch = {
  exploited: { id: string; cves: string[]; classId: string | null; packages: string[] }[];
  likely: { id: string; epss: number }[];
  trend: { classId: string; count: number }[];
  gaps: { cwe: string; count: number }[];
  hotGaps: { cwe: string; count: number }[];
  naSeen: { cwe: string; count: number }[];
  stackKev: { cve: string }[];
  window: { kevEntries: number };
  notes: string[];
  problems: string[];
};
const tw = req('../../../scripts/threat-watch.cjs') as {
  FEEDS: { osvBatch: string; osvVuln: string; kev: string; epss: string };
  KEV_MIN_ENTRIES: number;
  HOT_UNMAPPED: number;
  getJson: (io: unknown, url: string, init?: unknown) => Promise<{ ok: boolean; why?: string }>;
  inventoryFromLock: (lock: unknown) => { name: string; version: string; dev: boolean }[] | null;
  runThreatWatch: (a: { lock: unknown; map: unknown; now: string; io: unknown }) => Promise<Watch>;
  renderWatch: (w: Watch, map: unknown) => string;
  watchActionable: (w: Partial<Watch>) => number;
};

const ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const NOW = '2026-10-22';

const MAP = {
  classes: [
    { id: 'path-traversal', name: 'パス', kind: 'ours', cwes: ['CWE-22'], defenses: { files: ['a.ts'], gates: ['lint:forbidden'], threats: [] } },
    { id: 'memory-safety', name: 'メモリ', kind: 'platform', cwes: ['CWE-787'], defenses: { files: [], gates: ['lint:deps'], threats: [] } },
  ],
  notApplicable: [{ cwes: ['CWE-89'], reason: 'SQL を組み立てない (テスト用の理由)' }],
};
const LOCK = {
  packages: {
    '': { name: 'root' },
    'node_modules/lodash': { version: '4.17.20' },
    'node_modules/electron': { version: '40.1.0' },
    'node_modules/devonly': { version: '1.0.0', dev: true },
  },
};
const kevEntry = (i: number, over: Record<string, unknown> = {}) => ({
  cveID: `CVE-2020-${1000 + i}`,
  vendorProject: 'Other',
  product: 'Thing',
  vulnerabilityName: 'x',
  dateAdded: '2020-01-01',
  cwes: ['CWE-22'],
  knownRansomwareCampaignUse: 'Unknown',
  ...over,
});
const FILLER = Array.from({ length: 500 }, (_, i) => kevEntry(i));
const RECENT = [
  kevEntry(9001, { cveID: 'CVE-2026-0001', vendorProject: 'Google', product: 'Chromium V8', dateAdded: '2026-10-10', cwes: ['CWE-787'] }),
  ...[2, 3, 4].map((n) => kevEntry(9000 + n, { cveID: `CVE-2026-000${n}`, dateAdded: `2026-10-1${n}`, cwes: ['CWE-1188'] })),
  kevEntry(9005, { cveID: 'CVE-2026-0005', dateAdded: '2026-10-15', cwes: ['CWE-89'] }),
  kevEntry(9006, { cveID: 'CVE-2026-0006', dateAdded: '2026-10-16', cwes: ['CWE-22'] }),
  kevEntry(9007, { cveID: 'CVE-2026-0007', dateAdded: '2026-08-01', cwes: ['CWE-999'] }),
];

type Call = { url: string; init: { redirect?: string; body?: string } };
function world(over: Record<string, (url: string, init: Call['init']) => Response | Promise<Response>> = {}) {
  const calls: Call[] = [];
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const fetchImpl = async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const hook = Object.keys(over).find((k) => url === k || (k === tw.FEEDS.epss && url.startsWith(k)));
    const handler = hook === undefined ? undefined : over[hook];
    if (handler) return handler(url, init);
    if (url === tw.FEEDS.osvBatch) {
      const q = JSON.parse(init.body as string).queries as { package: { name: string } }[];
      return json({
        results: q.map((x) => ({ vulns: x.package.name === 'lodash' ? [{ id: 'GHSA-aaaa-bbbb-cccc' }] : x.package.name === 'electron' ? [{ id: 'GHSA-eeee-ffff-gggg' }] : [] })),
      });
    }
    if (url === `${tw.FEEDS.osvVuln}GHSA-aaaa-bbbb-cccc`) {
      return json({ id: 'GHSA-aaaa-bbbb-cccc', aliases: ['CVE-2026-0006'], summary: 'path', database_specific: { cwe_ids: ['CWE-22'], severity: 'HIGH' } });
    }
    if (url === `${tw.FEEDS.osvVuln}GHSA-eeee-ffff-gggg`) {
      return json({ id: 'GHSA-eeee-ffff-gggg', aliases: ['CVE-2026-7777'], summary: 'electron', database_specific: { cwe_ids: ['CWE-1188'], severity: 'MODERATE' } });
    }
    if (url === tw.FEEDS.kev) return json({ dateReleased: '2026-10-21', vulnerabilities: [...FILLER, ...RECENT] });
    if (url.startsWith(tw.FEEDS.epss)) return json({ data: [{ cve: 'CVE-2026-7777', epss: '0.42', percentile: '0.97' }] });
    return json({}, 404);
  };
  const run = () => tw.runThreatWatch({ lock: LOCK, map: MAP, now: NOW, io: { fetchImpl, sleep: async () => {} } });
  return { calls, run };
}

describe('脅威ウォッチ — 悪用中の脆弱性と弱点の種類を毎日突き合わせる (threat: T-164)', () => {
  it('★ KEV に載る勧告が依存に当たれば exploited・種類に分類される', async () => {
    const w = await world().run();
    expect(w.exploited).toHaveLength(1);
    expect(w.exploited[0]?.cves).toContain('CVE-2026-0006');
    expect(w.exploited[0]?.classId).toBe('path-traversal');
    expect(w.exploited[0]?.packages).toEqual(['lodash@4.17.20']);
  });

  it('★ KEV に無くても EPSS が高ければ likely (悪用確率で並べる)', async () => {
    const w = await world().run();
    expect(w.likely.map((l) => l.id)).toEqual(['GHSA-eeee-ffff-gggg']);
    expect(w.likely[0]?.epss).toBe(0.42);
  });

  it('★ 直近 30 日の悪用だけを種類ごとに数える (窓の外は出ない)', async () => {
    const w = await world().run();
    expect(w.window.kevEntries).toBe(6);
    expect(w.trend.map((t) => t.classId).sort()).toEqual(['memory-safety', 'path-traversal']);
    expect(w.gaps.some((g) => g.cwe === 'CWE-999')).toBe(false);
  });

  it('★ 表に無い種類が 3 件以上悪用されたら要対応 (hotGaps)・該当なしの種類は出さない', async () => {
    const w = await world().run();
    expect(w.hotGaps).toEqual([expect.objectContaining({ cwe: 'CWE-1188', count: tw.HOT_UNMAPPED })]);
    expect(w.gaps.some((g) => g.cwe === 'CWE-89')).toBe(false);
    expect(w.naSeen).toEqual([{ cwe: 'CWE-89', count: 1 }]);
    expect(tw.watchActionable(w)).toBe(2);
  });

  it('★ 同梱の基盤 (Chromium / V8) の悪用は版を追う候補として別に挙げる', async () => {
    const w = await world().run();
    expect(w.stackKev.map((s) => s.cve)).toEqual(['CVE-2026-0001']);
    expect(tw.renderWatch(w, MAP)).toContain('Electron 40.1.0');
  });

  describe('失敗の向き — 測れなかったことを 0 件として通さない', () => {
    it('★ KEV の配信が欠けている / 500 件未満なら problems', async () => {
      for (const body of ['{}', JSON.stringify({ vulnerabilities: [kevEntry(1)] })]) {
        const w = await world({ [tw.FEEDS.kev]: () => new Response(body, { status: 200 }) }).run();
        expect(w.problems.some((p) => p.includes('CISA KEV'))).toBe(true);
        expect(tw.watchActionable(w)).toBe(0);
      }
    });

    it('★ OSV が落ちていれば 3 回で諦めて problems', async () => {
      let n = 0;
      const w = await world({ [tw.FEEDS.osvBatch]: () => { n += 1; return new Response('x', { status: 503 }); } }).run();
      expect(n).toBe(3);
      expect(w.problems.some((p) => p.includes('OSV'))).toBe(true);
    });

    it('一時的な 5xx は通れば問題にしない・4xx は繰り返さない', async () => {
      let n = 0;
      const flaky = await world({
        [tw.FEEDS.kev]: () => {
          n += 1;
          return n < 3 ? new Response('x', { status: 502 }) : new Response(JSON.stringify({ vulnerabilities: [...FILLER, ...RECENT] }), { status: 200 });
        },
      }).run();
      expect(flaky.problems).toEqual([]);
      let m = 0;
      await world({ [tw.FEEDS.kev]: () => { m += 1; return new Response('x', { status: 404 }); } }).run();
      expect(m).toBe(1);
    });

    it('EPSS が落ちても KEV の判定は残り、並べ替えをしていない旨を notes に書く', async () => {
      const w = await world({ [tw.FEEDS.epss]: () => new Response('x', { status: 500 }) }).run();
      expect(w.exploited).toHaveLength(1);
      expect(w.notes).toHaveLength(1);
      expect(w.problems).toEqual([]);
    });

    it('本文が上限 (8 MiB) を超えたら投げずに problems', async () => {
      const w = await world({ [tw.FEEDS.kev]: () => new Response('x'.repeat(8 * 1024 * 1024 + 1), { status: 200 }) }).run();
      expect(w.problems.some((p) => p.includes('CISA KEV'))).toBe(true);
    });

    it('lockfile を読めなければ problems (走査の不具合を 0 件と混ぜない)', async () => {
      const w = await tw.runThreatWatch({ lock: {}, map: MAP, now: NOW, io: { fetchImpl: world().run as never, sleep: async () => {} } });
      expect(w.problems).toHaveLength(1);
      expect(tw.inventoryFromLock({})).toBeNull();
    });
  });

  describe('網の口', () => {
    it('★ 送り先は定数のホストだけ・転送に追随しない・送る物は名前と版だけ', async () => {
      const { calls, run } = world();
      await run();
      const hosts = new Set(calls.map((c) => new URL(c.url).host));
      expect([...hosts].sort()).toEqual(['api.first.org', 'api.osv.dev', 'www.cisa.gov']);
      expect(calls.every((c) => c.init.redirect === 'error')).toBe(true);
      for (const c of calls.filter((x) => x.url === tw.FEEDS.osvBatch)) {
        expect(c.init.body).not.toMatch(/token|secret|password|authorization/i);
        expect(Object.keys(JSON.parse(c.init.body as string))).toEqual(['queries']);
      }
    });

    it('★ 勧告 id に / や .. を含む値は URL に載せない', async () => {
      const { calls, run } = world({
        [tw.FEEDS.osvBatch]: () => new Response(JSON.stringify({ results: [{ vulns: [{ id: '../../x' }, { id: 'a/b' }] }, { vulns: [] }, { vulns: [] }] }), { status: 200 }),
      });
      const w = await run();
      expect(w.exploited).toEqual([]);
      expect(calls.some((c) => c.url.includes('..') || c.url.includes('a/b'))).toBe(false);
    });

    it('ソースに資格情報・環境変数を読む綴りが無い (読むのは lockfile と対応表だけ)', () => {
      const src = read('scripts/threat-watch.cjs')
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(src).not.toMatch(/process\.env|Authorization|GITHUB_TOKEN|child_process/);
    });

    it('網の口は lint:network-targets の台帳に載っている (送り先が定数であることを理由に書く)', () => {
      const ledger = read('scripts/lint-network-targets.cjs');
      expect(ledger).toContain("file: 'scripts/threat-watch.cjs'");
      expect(ledger).toContain('FEEDS');
    });
  });

  describe('配線 — 毎日の報告に組み込まれている', () => {
    const report = read('scripts/dependency-audit-report.cjs');
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    it('★ 報告が脅威ウォッチを走らせて buildReport に渡す', () => {
      expect(report).toContain("require('./threat-watch.cjs')");
      expect(report).toContain('await runThreatWatch(');
      expect(report).toMatch(/watch,\s*\n\s*map,/);
    });

    it('★ 手で回す口 (audit:threat-watch) は自己検査つきで、verify:all には載せない (網の不調で PR を赤くしない)', () => {
      expect(pkg.scripts['audit:threat-watch']).toContain('scripts/threat-watch.cjs --self-test');
      expect(pkg.scripts['verify:all']).not.toContain('threat-watch');
    });

    it('★ 脅威ウォッチを渡し忘れた報告は「測っていない」として数える', () => {
      const r = req('../../../scripts/dependency-audit-report.cjs') as {
        buildReport: (i: Record<string, unknown>) => { actionable: number };
      };
      const base = { all: [], prod: [], floors: [], pins: [], generatedAt: NOW };
      expect(r.buildReport({ ...base, watch: undefined }).actionable).toBe(1);
      expect(r.buildReport({ ...base, watch: null }).actionable).toBe(1);
      const clean = { exploited: [], likely: [], trend: [], gaps: [], hotGaps: [], naSeen: [], stackKev: [], notes: [], problems: [] };
      expect(r.buildReport({ ...base, watch: clean }).actionable).toBe(0);
      expect(r.buildReport({ ...base, watch: { ...clean, exploited: [{ id: 'x' }] } }).actionable).toBe(1);
    });
  });
});
