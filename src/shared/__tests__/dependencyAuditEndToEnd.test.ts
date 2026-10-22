import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **毎日の依存監査を、架空のデータで端から端まで通す** (脅威ウォッチ → 報告 → 常設 Issue)。
 *
 * 単体の検査は部品ごとに偽物を持つ (脅威ウォッチは自前の世界・Issue 同期は自前の偽 GitHub)。
 * 2026-10-22 の実走で、部品が緑のまま**つなぎ目**が壊れていた: 常設 Issue の探索を作者で絞った (T-142)
 * とき、self-test の偽 Issue が古いままで毎日の実行が「Issue に反映」の手前で止まり、Issue が更新されなかった。
 * ここでは**実物の対応表** (`security/weakness-map.json`) と**実物の報告の組み立て** (`buildReport`)・
 * **実物の Issue 同期** (`syncIssue`) を、**状態を持つ偽の GitHub** と**架空の勧告・KEV・EPSS** でつないで、
 * 何日か続けて回す。
 *
 * 架空のデータの決まり (`lint:sample-data` と同じ向き): 実在の個人・会社・実際の CVE を使わない。
 * CVE は 2099 年・パッケージは `acme-*`・GHSA は `GHSA-fake-*` で、実物と取り違えられない。
 * 網には出ない (`fetchImpl` を注入)。
 */

const req = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../../..');

type Watch = { problems: string[] };
const tw = req(path.join(ROOT, 'scripts/threat-watch.cjs')) as {
  FEEDS: { osvBatch: string; osvVuln: string; kev: string; epss: string };
  runThreatWatch: (a: { lock: unknown; map: unknown; now: string; io: unknown }) => Promise<Watch>;
};
const audit = req(path.join(ROOT, 'scripts/dependency-audit-report.cjs')) as {
  buildReport: (a: Record<string, unknown>) => {
    actionable: number;
    markdown: string;
    summary: { watch: number; unmeasured: number; prod: number };
  };
};
const issue = req(path.join(ROOT, 'scripts/dependency-audit-issue.cjs')) as {
  TITLE: string;
  syncIssue: (a: { github: unknown; context: unknown; report: unknown }) => Promise<{ action: string; number: number | null }>;
};
const MAP = req(path.join(ROOT, 'security/weakness-map.json')) as unknown;

const LOCK = {
  packages: {
    '': { name: 'acme-root' },
    'node_modules/acme-widget': { version: '1.2.3' },
    'node_modules/acme-safe': { version: '2.0.0' },
  },
};

// 実物の対応表に載っていない CWE (架空の「新しい種類」)。実物に載ったらこの検査が教える。
const UNMAPPED_CWE = 'CWE-1188';

type Scenario = { exploited: boolean; hotGap: boolean; kevShort: boolean };
const kevRow = (i: number, over: Record<string, unknown> = {}) => ({
  cveID: `CVE-2099-${String(1000 + i)}`,
  vendorProject: 'Acme',
  product: 'Thing',
  vulnerabilityName: '架空',
  dateAdded: '2020-01-01',
  cwes: ['CWE-22'],
  knownRansomwareCampaignUse: 'Unknown',
  ...over,
});

function world(s: Scenario) {
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const old = Array.from({ length: s.kevShort ? 20 : 500 }, (_, i) => kevRow(i));
  const recent = [
    ...(s.exploited ? [kevRow(9001, { cveID: 'CVE-2099-0001', dateAdded: '2026-10-10', cwes: ['CWE-22'] })] : []),
    ...(s.hotGap ? [1, 2, 3].map((n) => kevRow(9100 + n, { cveID: `CVE-2099-010${n}`, dateAdded: '2026-10-12', cwes: [UNMAPPED_CWE] })) : []),
  ];
  const fetchImpl = async (url: string, init: { body?: string }) => {
    if (url === tw.FEEDS.osvBatch) {
      const q = JSON.parse(init.body as string).queries as { package: { name: string } }[];
      return json({ results: q.map((x) => ({ vulns: s.exploited && x.package.name === 'acme-widget' ? [{ id: 'GHSA-fake-0001' }] : [] })) });
    }
    if (url === `${tw.FEEDS.osvVuln}GHSA-fake-0001`) {
      return json({ id: 'GHSA-fake-0001', aliases: ['CVE-2099-0001'], summary: '架空のパス細工', database_specific: { cwe_ids: ['CWE-22'], severity: 'HIGH' } });
    }
    if (url === tw.FEEDS.kev) return json({ dateReleased: '2026-10-21', vulnerabilities: [...old, ...recent] });
    if (url.startsWith(tw.FEEDS.epss)) return json({ data: [{ cve: 'CVE-2099-0001', epss: '0.55', percentile: '0.99' }] });
    return json({}, 404);
  };
  return { fetchImpl, sleep: async () => {} };
}

/** 状態を持つ偽の GitHub (作者は本物と同じ bot)。Issue は何日またいでも 1 つでなければならない。 */
function statefulGithub() {
  type I = { number: number; title: string; state: string; body: string; user: { login: string } };
  const issues: I[] = [];
  let next = 1;
  return {
    issues,
    rest: {
      issues: {
        async listForRepo(a: { state?: string }) {
          const want = a.state ?? 'open';
          // 本物の API は呼ぶたびに別の複製を返す (生の参照を返すと update が先に state を書き換えて比較が壊れる)
          return { data: issues.filter((i) => want === 'all' || i.state === want).map((i) => ({ ...i })) };
        },
        async update(a: { issue_number: number; body: string; state: string }) {
          const i = issues.find((x) => x.number === a.issue_number)!;
          i.body = a.body;
          i.state = a.state;
          return { data: {} };
        },
        async create(a: { title: string; body: string }) {
          const i = { number: next++, title: a.title, state: 'open', body: a.body, user: { login: 'github-actions[bot]' } };
          issues.push(i);
          return { data: { number: i.number } };
        },
      },
    },
  };
}

const context = { repo: { owner: 'o', repo: 'r' } };
async function oneDay(s: Scenario, gh: ReturnType<typeof statefulGithub>, day: string) {
  const watch = await tw.runThreatWatch({ lock: LOCK, map: MAP, now: day, io: world(s) });
  const report = audit.buildReport({ all: [], prod: [], floors: [], pins: [], watch, map: MAP, generatedAt: day });
  const sync = await issue.syncIssue({ github: gh, context, report });
  return { report, sync };
}

const CALM: Scenario = { exploited: false, hotGap: false, kevShort: false };

describe('毎日の依存監査 — 架空のデータで脅威ウォッチ → 報告 → 常設 Issue を端から端まで通す', () => {
  it('★ 前提: 架空の「新しい種類」は実物の対応表に載っていない (載ったらこの検査の台本を替える)', () => {
    const m = MAP as { classes: { cwes: string[] }[]; notApplicable: { cwes: string[] }[] };
    const known = [...m.classes.flatMap((c) => c.cwes), ...m.notApplicable.flatMap((n) => n.cwes)];
    expect(known).not.toContain(UNMAPPED_CWE);
    expect(known).toContain('CWE-22');
  });

  it('★ 何も無い日は Issue を作らない (要対応 0)', async () => {
    const gh = statefulGithub();
    const { report, sync } = await oneDay(CALM, gh, '2026-10-22');
    expect(report.actionable).toBe(0);
    expect(sync.action).toBe('none');
    expect(gh.issues).toHaveLength(0);
  });

  it('★ 悪用中の依存が当たる日は Issue に包名・CVE・種類・守りが載る', async () => {
    const gh = statefulGithub();
    const { report, sync } = await oneDay({ ...CALM, exploited: true }, gh, '2026-10-22');
    expect(report.summary.watch).toBeGreaterThanOrEqual(1);
    expect(sync.action).toBe('created');
    const body = gh.issues[0]!.body;
    expect(body).toContain('acme-widget');
    expect(body).toContain('CVE-2099-0001');
    expect(body).toContain('パス・ファイル名の細工');
    expect(body).toContain('safeFilename');
  });

  it('★ 表に無い種類が 3 件悪用された日は要対応になり、Issue にその CWE が出る', async () => {
    const gh = statefulGithub();
    const { report } = await oneDay({ ...CALM, hotGap: true }, gh, '2026-10-22');
    expect(report.summary.watch).toBe(1);
    expect(gh.issues[0]!.body).toContain(UNMAPPED_CWE);
    expect(gh.issues[0]!.body).toContain('表に無い種類');
  });

  it('★ 配信が欠けた日は「0 件」にせず測れなかった項目として Issue に出る', async () => {
    const gh = statefulGithub();
    const { report } = await oneDay({ ...CALM, kevShort: true }, gh, '2026-10-22');
    expect(report.actionable).toBeGreaterThan(0);
    expect(gh.issues[0]!.body).toContain('測れなかった項目');
    expect(gh.issues[0]!.body).toContain('脅威ウォッチ');
  });

  it('★ 数日続けても常設 Issue は 1 つ: 作る → 更新 → 閉じる → 再開 (2 つ目を作らない)', async () => {
    const gh = statefulGithub();
    const hot = { ...CALM, exploited: true };
    expect((await oneDay(hot, gh, '2026-10-22')).sync.action).toBe('created');
    expect((await oneDay(hot, gh, '2026-10-23')).sync.action).toBe('updated');
    expect((await oneDay(CALM, gh, '2026-10-24')).sync.action).toBe('closed');
    expect(gh.issues[0]!.state).toBe('closed');
    expect((await oneDay(CALM, gh, '2026-10-25')).sync.action).toBe('updated');
    expect((await oneDay(hot, gh, '2026-10-26')).sync.action).toBe('reopened');
    expect(gh.issues).toHaveLength(1);
    expect(gh.issues[0]!.state).toBe('open');
    expect(gh.issues[0]!.body).toContain('CVE-2099-0001');
  });

  it('★ 他人が同じ題名の Issue を先に立てても、報告はそこへ書かれず bot の Issue が作られる (T-142)', async () => {
    const gh = statefulGithub();
    gh.issues.push({ number: 50, title: issue.TITLE, state: 'open', body: '乗っ取り', user: { login: 'someone-else' } });
    const { sync } = await oneDay({ ...CALM, exploited: true }, gh, '2026-10-22');
    expect(sync.action).toBe('created');
    expect(gh.issues.find((i) => i.number === 50)!.body).toBe('乗っ取り');
    expect(gh.issues.filter((i) => i.user.login === 'github-actions[bot]')).toHaveLength(1);
  });

  it('★ 対照: 悪用中の依存が無い世界では Issue 本文に架空の CVE が出ない (出るなら取り違え)', async () => {
    const gh = statefulGithub();
    const { report } = await oneDay({ ...CALM, hotGap: true }, gh, '2026-10-22');
    expect(report.markdown).not.toContain('CVE-2099-0001');
    expect(report.markdown).not.toContain('acme-widget');
  });
});
