/**
 * **品質の頁は、点数が数えた集合を分母として名乗る** (2026-09-27 · パス 490)。
 *
 * ## 何が在ったか
 *
 * 公開中の `docs/QUALITY.md` は「Overall: 100.00%」の下に「分母の範囲: `stryker.config.json` の
 * `mutate` が名指しする **296 本**」と書いていた。表は **246 行** (2026-09-01 の全掃引) で、
 * 生成時点の `mutate` は **302 本** —— 点数が数えた集合と、分母として名乗る集合が別だった。
 * 生成側 (`scripts/quality-report.cjs`) は範囲の文を**生成時点の設定**から作っていたので、
 * 生成し直しても同じ取り違えが起きる: `--mutate` で絞った run の報告 (1 ファイル) から作ると、
 * その 1 ファイルの点数が「`mutate` の 302 本」を分母として名乗る。
 *
 * 同じ頁の他の 4 つの偽も同じ家系 (「頁が名乗ることを、頁が測っていない」):
 * 相対時間「Report age: 0.1h」を 26 日前の報告に固めていた / 分母 0 の行を「0.00」と刷っていた /
 * 被覆の範囲 (`src/main/**`) を名乗っていなかった / 検査が落ちると「0 passing」と書き FAILING を
 * 出さなかった (vitest の要約の形を読み違えていた)。
 *
 * ## この検査が留めるもの
 *
 * 生成側の**純粋な部分** —— 集計・範囲の判定と文・vitest の要約の読み・頁の組み立て —— を
 * 標本と対照で。最後の節は**生成側が書いた頁を、門 (`lint:docs` の `checkMutationPageScope`) が
 * そのまま受け付けること**と、**部分の報告から書いた頁を門が断ること**を、実物どうしで結ぶ
 * (片方だけ直すと、生成し直した頁が CI で落ちるか、門が偽の頁を通す)。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

const req = createRequire(import.meta.url);
const REPO = join(__dirname, '..', '..', '..');

interface Mutant {
  status: string;
}
interface Report {
  files?: Record<string, { mutants: Mutant[] }>;
  config?: { mutate?: unknown };
}
interface Row {
  file: string;
  killed: number;
  survived: number;
  noCov: number;
  ignored: number;
  invalid: number;
  valid: number;
  pct: string | null;
  covered: string | null;
}
interface Summary {
  rows: Row[];
  invalidFiles: { file: string; invalid: number }[];
  totals: Omit<Row, 'file'>;
}
interface Judgement {
  noMutants: string[];
  unexplained: string[];
  notInRun: string[];
  droppedSince: string[];
  partial: boolean;
}
interface VitestCounts {
  failed: number;
  passed: number;
  skipped: number;
  todo: number;
  total: number | null;
}

type Coverage =
  | Record<'lines' | 'statements' | 'branches' | 'functions', number | null>
  | { failedCode: number; missing?: boolean }
  | null;

const gen = req('../../../scripts/quality-report.cjs') as {
  coverageFrom: (code: number, summaryText: string | null) => Exclude<Coverage, null>;
  coverageRows: (coverage: Coverage) => string;
  scorePct: (detected: number, denom: number) => string | null;
  pctCell: (p: string | null) => string;
  repoRelative: (file: string, root: string) => string;
  summarizeReport: (report: Report, root: string) => Summary;
  isLiteralPath: (p: unknown) => boolean;
  runMutateOf: (report: Report) => string[] | null;
  judgeScope: (a: { rows: string[]; runNamed: string[] | null; named: string[] }) => Judgement;
  scopeStatement: (a: {
    rows: string[];
    runNamed: string[] | null;
    named: string[];
    shipped: string[];
    reportAt: string;
  }) => { text: string; judgement: Judgement };
  parseVitestSummary: (out: string) => { files: VitestCounts | null; tests: VitestCounts | null };
  utcMinute: (ms: number) => string;
  reportMeasuredMs: (report: unknown, mtimeMs: number) => number;
  renderPage: (a: {
    now: string;
    typecheck: { code: number };
    tests: { code: number; summary: { files: VitestCounts | null; tests: VitestCounts | null } };
    coverage: Coverage;
    summary: Summary;
    scope: { text: string; judgement: Judgement; reportAt: string };
  }) => string;
};

const gate = req('../../../scripts/cross-doc-consistency.cjs') as {
  checkMutationPageScope: (failures: { fact: string; reason: string }[], page: string | null) => number;
};

/** 状態を数だけ持つ変異体の並び。 */
function mutants(counts: Partial<Record<string, number>>): Mutant[] {
  return Object.entries(counts).flatMap(([status, n]) => Array.from({ length: n ?? 0 }, () => ({ status })));
}

const REPORT_AT = '2026-09-27 01:00 UTC';
const SHIPPED = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/outside.ts'];

function fullReport(): Report {
  return {
    files: {
      'src/a.ts': { mutants: mutants({ Killed: 9, Timeout: 1, Ignored: 2 }) },
      'src/b.ts': { mutants: mutants({ Ignored: 3 }) }, // 分母 0 (静的変異体だけ)
      'src/c.ts': { mutants: mutants({ Killed: 4 }) },
    },
    config: { mutate: ['src/a.ts', 'src/b.ts', 'src/c.ts'] },
  };
}

describe('集計 —— 点数の定義は Stryker に合わせる', () => {
  it('分母は Killed + Timeout + Survived + NoCoverage (Ignored と評価不成立は外す)', () => {
    const s = gen.summarizeReport(
      { files: { 'src/x.ts': { mutants: mutants({ Killed: 3, Timeout: 1, Survived: 1, NoCoverage: 1, Ignored: 5, RuntimeError: 2 }) } } },
      '/repo',
    );
    const r = s.rows[0]!;
    expect([r.killed, r.survived, r.noCov, r.ignored, r.invalid, r.valid]).toEqual([4, 1, 1, 5, 2, 6]);
    expect(r.pct).toBe('66.67');
    expect(r.covered).toBe('80.00');
    expect(s.invalidFiles).toEqual([{ file: 'src/x.ts', invalid: 2 }]);
  });

  it('★ 分母 0 の率は null で、頁には「—」と刷る (0.00 は「1 つも殺せていない」と読める)', () => {
    expect(gen.scorePct(0, 0)).toBeNull();
    expect(gen.pctCell(null)).toBe('—');
    const s = gen.summarizeReport(fullReport(), '/repo');
    const b = s.rows.find((r) => r.file === 'src/b.ts')!;
    expect(b.valid).toBe(0);
    expect(b.pct).toBeNull();
    expect(b.covered).toBeNull();
    // 対照: 分母が在れば数を返す (null は分母 0 のときだけ)。
    expect(gen.scorePct(0, 5)).toBe('0.00');
  });

  it('総計は行の和で、行は道の順に並ぶ', () => {
    const s = gen.summarizeReport(fullReport(), '/repo');
    expect(s.rows.map((r) => r.file)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect([s.totals.killed, s.totals.ignored, s.totals.valid, s.totals.pct]).toEqual([14, 5, 14, '100.00']);
  });

  it('報告の鍵が絶対パスでも repo 相対へ直す (古い報告の形)', () => {
    expect(gen.repoRelative('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(gen.repoRelative('/repo/src/a.ts', '/repo/')).toBe('src/a.ts');
    expect(gen.repoRelative('src/a.ts', '/repo')).toBe('src/a.ts');
    expect(gen.repoRelative('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts');
  });
});

describe('★ 分母の範囲 —— 報告が測った物は報告から、生成時点の物は生成時点として', () => {
  it('run の `mutate` は報告に残る (glob や行の範囲なら比べない)', () => {
    expect(gen.runMutateOf(fullReport())).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(gen.runMutateOf({ config: { mutate: ['src/**/*.ts'] } })).toBeNull();
    expect(gen.runMutateOf({ config: { mutate: ['src/a.ts:10-20'] } })).toBeNull();
    expect(gen.runMutateOf({ config: { mutate: [] } })).toBeNull();
    expect(gen.runMutateOf({})).toBeNull();
    expect(gen.isLiteralPath('src/shared/a.ts')).toBe(true);
    expect(gen.isLiteralPath('!src/x.ts')).toBe(false);
  });

  it('全掃引: run が生成時点の `mutate` をすべて名指ししていれば部分ではない', () => {
    const j = gen.judgeScope({
      rows: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      runNamed: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      named: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    });
    expect(j).toEqual({ noMutants: [], unexplained: [], notInRun: [], droppedSince: [], partial: false });
  });

  it('★ 公開中だった形 —— 報告は 246 本の run、生成時点の `mutate` は 302 本 → 部分として 56 本を名指しする', () => {
    const run = Array.from({ length: 246 }, (_, i) => `src/f${String(i).padStart(3, '0')}.ts`);
    const named = [...run, ...Array.from({ length: 56 }, (_, i) => `src/added${String(i).padStart(2, '0')}.ts`)];
    const st = gen.scopeStatement({ rows: run, runNamed: run, named, shipped: named, reportAt: REPORT_AT });
    expect(st.judgement.partial).toBe(true);
    expect(st.judgement.notInRun).toHaveLength(56);
    expect(st.text).toContain('表の行は **246 本**');
    expect(st.text).toContain('`mutate` は **302 本**');
    expect(st.text).toContain('**部分の報告である** —— **56 本はこの run に含まれない**');
    // 直す前の文面は、測っていない 302 本を分母として名乗っていた。
    expect(st.text).not.toContain('`mutate` が名指しする **302 本**');
    expect(st.text).not.toContain('全掃引');
  });

  it('★ 1 ファイルだけの run (--mutate) は部分の報告で、残りの本数を名指しする', () => {
    const st = gen.scopeStatement({
      rows: ['src/a.ts'],
      runNamed: ['src/a.ts'],
      named: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      shipped: SHIPPED,
      reportAt: REPORT_AT,
    });
    expect(st.judgement.partial).toBe(true);
    expect(st.judgement.notInRun).toEqual(['src/b.ts', 'src/c.ts']);
    expect(st.text).toContain('**2 本はこの run に含まれない**');
  });

  it('run が名指ししたのに変異体が 0 の本は「行が無い」と言い、部分とは数えない', () => {
    const st = gen.scopeStatement({
      rows: ['src/a.ts'],
      runNamed: ['src/a.ts', 'src/types.ts'],
      named: ['src/a.ts', 'src/types.ts'],
      shipped: SHIPPED,
      reportAt: REPORT_AT,
    });
    expect(st.judgement.partial).toBe(false);
    expect(st.judgement.noMutants).toEqual(['src/types.ts']);
    expect(st.text).toContain('**1 本は変異体が 1 つも無く表に行が無い**');
    expect(st.text).toContain('(全掃引)');
  });

  it('run の `mutate` を持たない報告は、全掃引とは名乗らない (分からないことを分かったように言わない)', () => {
    const st = gen.scopeStatement({ rows: ['src/a.ts'], runNamed: null, named: ['src/a.ts'], shipped: SHIPPED, reportAt: REPORT_AT });
    expect(st.judgement.partial).toBe(true);
    expect(st.text).toContain('**全掃引とは名乗らない**');
  });

  it('表に在るのに run が名指ししていない行は、部分 (壊れた報告) として扱う', () => {
    const j = gen.judgeScope({ rows: ['src/a.ts', 'src/z.ts'], runNamed: ['src/a.ts'], named: ['src/a.ts'] });
    expect(j.unexplained).toEqual(['src/z.ts']);
    expect(j.partial).toBe(true);
  });

  it('run の後に `mutate` から外した本は、そう名乗る (部分とは数えない)', () => {
    const j = gen.judgeScope({ rows: ['src/a.ts', 'src/old.ts'], runNamed: ['src/a.ts', 'src/old.ts'], named: ['src/a.ts'] });
    expect(j.droppedSince).toEqual(['src/old.ts']);
    expect(j.partial).toBe(false);
  });

  it('`mutate` の外の本数は、生成時点の数として述べる', () => {
    const st = gen.scopeStatement({
      rows: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      runNamed: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      named: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      shipped: SHIPPED,
      reportAt: REPORT_AT,
    });
    expect(st.text).toContain('生成時点の `src/` の `.ts` (検査と `.d.ts` を除く) は **4 本**で、**1 本は `mutate` の外**');
  });
});

describe('★ vitest の要約を語ごとに読む (落ちた検査を頁から消さない)', () => {
  const PASS = ' Test Files  929 passed (929)\n      Tests  19522 passed (19522)\n';
  const FAIL = ' Test Files  1 failed | 928 passed (929)\n      Tests  2 failed | 19520 passed (19522)\n';
  const SKIP = ' Test Files  929 passed (929)\n      Tests  19520 passed | 2 skipped (19522)\n';

  it('全部通った形', () => {
    const s = gen.parseVitestSummary(PASS);
    expect(s.tests).toEqual({ failed: 0, passed: 19522, skipped: 0, todo: 0, total: 19522 });
    expect(s.files?.passed).toBe(929);
  });

  it('★ 落ちた件がある形 —— failed が先頭に来ても読む', () => {
    const s = gen.parseVitestSummary(FAIL);
    expect(s.tests).toEqual({ failed: 2, passed: 19520, skipped: 0, todo: 0, total: 19522 });
    expect(s.files).toEqual({ failed: 1, passed: 928, skipped: 0, todo: 0, total: 929 });
    // 標本: 直す前の読み (`Tests +(\d+) passed`) は、この形で何も拾えなかった。
    expect(/Tests +(\d+) passed/.exec(FAIL)).toBeNull();
  });

  it('skipped も読む', () => {
    expect(gen.parseVitestSummary(SKIP).tests).toEqual({ failed: 0, passed: 19520, skipped: 2, todo: 0, total: 19522 });
  });

  it('要約が無ければ null (0 件と読まない)', () => {
    expect(gen.parseVitestSummary('Error: something broke').tests).toBeNull();
  });
});

/**
 * ★ **被覆の数は、この run が成功して書いた物だけを載せる** (docblock の 6)。
 *
 * vitest 4 の `coverage.reportOnFailure` は既定で false —— 検査が 1 件でも落ちると要約を書かない。
 * 直す前の生成側は終了コードを見ずに「要約が在れば読む」だったので、落ちた run の後には
 * **前の run の要約**を今の数として刷る形だった。しかも CI (`npm run test:cov` = src/main の検査だけ) と
 * 違う母集団 (全検査) で測っていた。
 */
describe('★ 被覆 —— 成功した run の要約だけを読み、CI と同じ測り方をする', () => {
  const SUMMARY = JSON.stringify({
    total: { lines: { pct: 99.1 }, statements: { pct: 98 }, branches: { pct: 96.5 }, functions: { pct: 95 } },
  });

  it('★ 終了コードが 0 でなければ、要約の本文が手元に在っても数を読まない (前の run の数を載せない)', () => {
    expect(gen.coverageFrom(1, SUMMARY)).toEqual({ failedCode: 1 });
    const row = gen.coverageRows(gen.coverageFrom(1, SUMMARY));
    expect(row).toContain('❌ 計測が失敗 (終了コード 1)');
    expect(row).not.toContain('99.10%');
    // 行は範囲を名乗る (門は被覆の行に src/main/** を要求する)
    expect(row).toContain('`src/main/**`');
  });

  it('終了コード 0 で要約が無ければ、そう言う (0% とも「読めた」とも言わない)', () => {
    expect(gen.coverageFrom(0, null)).toEqual({ failedCode: 0, missing: true });
    expect(gen.coverageRows(gen.coverageFrom(0, null))).toContain('要約が書かれなかった');
  });

  it('成功して要約が在れば、4 つの数を読む', () => {
    expect(gen.coverageFrom(0, SUMMARY)).toEqual({ lines: 99.1, statements: 98, branches: 96.5, functions: 95 });
    expect(gen.coverageRows(gen.coverageFrom(0, SUMMARY))).toContain('| Coverage (`src/main/**` のみ) — lines | 99.10% |');
  });

  it('★ 生成側は古い要約を消してから、CI と同じ `npm run test:cov` を走らせる', () => {
    const src = readOriginalSource(join(REPO, 'scripts', 'quality-report.cjs'));
    const rm = src.indexOf('fs.rmSync(summaryPath');
    const runCov = src.indexOf("run('npm run test:cov')");
    expect(rm).toBeGreaterThan(-1);
    expect(runCov).toBeGreaterThan(rm); // 消してから測る
    // 直す前の形 (全検査を走らせる別の測り方) は残っていない
    expect(src).not.toContain("run('npx vitest run --coverage");
    // CI が同じ命令を走らせている (測り方が 2 通りにならない)
    const ci = readOriginalSource(join(REPO, '.github', 'workflows', 'ci.yml'));
    expect(ci).toMatch(/run: npm run test:cov\b/);
  });
});

describe('頁の組み立て', () => {
  const summary = gen.summarizeReport(fullReport(), '/repo');
  const named = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
  const scopeOf = (runNamed: string[] | null, namedNow: string[]) => ({
    ...gen.scopeStatement({ rows: summary.rows.map((r) => r.file), runNamed, named: namedNow, shipped: SHIPPED, reportAt: REPORT_AT }),
    reportAt: REPORT_AT,
  });
  const passTests = { code: 0, summary: gen.parseVitestSummary(' Test Files  3 passed (3)\n      Tests  30 passed (30)\n') };
  const cov = { lines: 99, statements: 98.5, branches: 96, functions: 95 };
  const page = (o: Partial<Parameters<typeof gen.renderPage>[0]> = {}) =>
    gen.renderPage({
      now: '2026-09-27 03:00:00 UTC',
      typecheck: { code: 0 },
      tests: passTests,
      coverage: cov,
      summary,
      scope: scopeOf(named, named),
      ...o,
    });

  it('★ 併合報告は自分の時刻 (mergedAt) を名乗り、mtime に頼らない (パス 501e)', () => {
    // `gh run download` はファイルの mtime を保たないので、最大 90 日前に併合した報告が
    // 「取ってきた今日」の日時として頁に載る。併合 (`merge-mutation-reports.cjs`) は
    // 自分の時刻を `mergedAt` に持つ。壊れた・型違い・無いときは mtime に戻る (Stryker が直接書いた報告)。
    const merged = '2026-09-30T12:34:56.000Z';
    expect(gen.reportMeasuredMs({ mergedAt: merged }, 0)).toBe(Date.parse(merged));
    expect(gen.reportMeasuredMs({ mergedAt: 'not a date' }, 7)).toBe(7);
    expect(gen.reportMeasuredMs({ mergedAt: 5 }, 8)).toBe(8);
    expect(gen.reportMeasuredMs({}, 9)).toBe(9);
    expect(gen.reportMeasuredMs(null, 10)).toBe(10);
    // 頁に載る日時は mergedAt から (mtime が 0 = 1970 年でも 2026 年と書く)。
    expect(gen.utcMinute(gen.reportMeasuredMs({ mergedAt: merged }, 0))).toBe('2026-09-30 12:34 UTC');
  });

  it('絶対時刻で書き、相対時間を固めない', () => {
    const p = page();
    expect(p).toContain('報告ファイルの日時 **2026-09-27 01:00 UTC**');
    expect(p).not.toMatch(/Report age/i);
    expect(gen.utcMinute(Date.UTC(2026, 8, 1, 5, 13, 42))).toBe('2026-09-01 05:13 UTC');
  });

  it('分母 0 の行は「—」、被覆は範囲 (src/main/**) を名乗る', () => {
    const p = page();
    expect(p).toContain('| src/b.ts | — | — | 0 | 0 | 0 | 3 | 0 |');
    expect(p).toContain('| Coverage (`src/main/**` のみ) — lines | 99.00% |');
    expect(p).not.toMatch(/^\| Coverage — /m);
  });

  it('★ 検査が落ちたら FAILING を出す (直す前は「0 passing」と書いていた)', () => {
    const failing = { code: 1, summary: gen.parseVitestSummary(' Test Files  1 failed | 2 passed (3)\n      Tests  2 failed | 28 passed (30)\n') };
    const p = page({ tests: failing });
    expect(p).toContain('| ユニットテスト | ❌ 2 FAILING / 28 passing (終了コード 1) |');
    expect(p).not.toContain('0 passing');
  });

  it('★ 型検査は終了コードで決める (「error TS」の綴りに頼らない)', () => {
    expect(page({ typecheck: { code: 2 } })).toContain('| TypeScript 型検査 | ❌ FAIL (終了コード 2) |');
    expect(page()).toContain('| TypeScript 型検査 | ✅ pass |');
  });

  it('★ 生成側が書いた全掃引の頁を、門はそのまま受け付ける (実物どうしで結ぶ)', () => {
    const failures: { fact: string; reason: string }[] = [];
    gate.checkMutationPageScope(failures, page());
    expect(failures).toEqual([]);
  });

  it('★ 部分の報告から書いた頁は、門が断る (生成側は既定で書かないが、--allow-partial で書いても通らない)', () => {
    const failures: { fact: string; reason: string }[] = [];
    gate.checkMutationPageScope(failures, page({ scope: scopeOf(['src/a.ts', 'src/b.ts', 'src/c.ts'], [...named, 'src/d.ts']) }));
    expect(failures.map((f) => f.reason).join('\n')).toContain('部分の報告');
  });

  it('★ 門は 0.00 と刷った分母 0 の行を断る (生成側の直しを戻すと鳴る)', () => {
    const failures: { fact: string; reason: string }[] = [];
    gate.checkMutationPageScope(failures, page().replace('| src/b.ts | — | — |', '| src/b.ts | 0.00 | 0.00 |'));
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toContain('src/b.ts');
  });
});
