import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **台帳の穴を開け直す (`scripts/threat-ablation.cjs`) —— 回帰検査が本当に鳴るかを測る。**
 * (2026-10-30 · パス 565 · threat: T-226)
 *
 * 脅威台帳の検査 (`threatLedger.test.ts`) が見るのは「名指しの回帰検査が在ること」まで。
 * ここで留めるのは:
 *
 *   ① 判定 —— vitest の JSON 報告から caught / missed / unmatched / load-error を分ける
 *      (「非 0 で終わった」を「捕まえた」と読まない —— verify-survivors が 2026-09 に踏んだ形)
 *   ② 書き換えの台帳 —— どの書き換えも今のファイルにちょうど 1 回当たる (守りの形が変わったら古びを鳴らす)
 *   ③ 被覆 —— high の脅威はすべて開け直す書き換えを持ち、これから見つかる脅威もすべて持つ
 *   ④ 配線 —— 毎日の dependency-audit が開け直しを走らせ、捕まえ損ねを要対応にする
 */

const req = createRequire(import.meta.url);
type Verdict = { verdict: string; matched: number; failed: number; message?: string };
type Ablation = { id: string; threat: string; file: string; why: string; edits?: { find: string; replace: string }[]; find?: string; replace?: string };
const tool = req('../../../scripts/threat-ablation.cjs') as {
  occurrences: (hay: string, needle: string) => number;
  titlePattern: (title: string) => string;
  titleMatcher: (title: string) => RegExp;
  staticProblems: (ablations: unknown[], ledger: unknown, readFile: (rel: string) => string) => string[];
  verdictOf: (report: unknown, title: string) => Verdict;
  combineVerdicts: (list: Verdict[]) => Verdict;
  regressionsOf: (threat: unknown) => { file: string; test: string }[];
  editsOf: (a: unknown) => { find: string; replace: string }[];
  applyEdits: (text: string, edits: { find: string; replace: string }[]) => string;
  ablationStatus: (summary: unknown, ablations: unknown[], ledger: unknown, staticList: string[]) => { actionable: number; problems: string[]; notCaught: unknown[]; measured: boolean };
  renderAblation: (st: unknown) => string;
  parseArgs: (argv: string[]) => { cmd: string; report: boolean };
};
const ROOT = path.resolve(__dirname, '../../..');
const ledger = req('../../../security/threat-ledger.json') as { threats: { id: string; severity: string; status: string; found: string; regression?: { file: string; test: string } }[] };
const { ablations } = req('../../../security/threat-ablations.json') as { ablations: Ablation[] };
const readReal = (rel: string) => readOriginalSource(path.join(ROOT, rel));

/** この日以降に台帳へ入った脅威は、入った時点で開け直す書き換えを持つ (これからの穴を測らずに閉じない)。 */
const ABLATION_REQUIRED_FROM = '2026-10-31';

const report = (rows: { title: string; status: string; ancestorTitles?: string[] }[], fileStatus = 'passed', message = '') => ({
  testResults: [{ status: fileStatus, message, assertionResults: rows }],
});

describe('判定 —— 名指しの検査の状態だけで決める (threat: T-226)', () => {
  it('★ 名指しの検査が assertion で落ちれば caught・全部通れば missed', () => {
    const title = '★ 断る (threat: T-1)';
    expect(tool.verdictOf(report([{ title, status: 'failed' }, { title: '別', status: 'passed' }]), title).verdict).toBe('caught');
    expect(tool.verdictOf(report([{ title, status: 'passed' }, { title: '別', status: 'failed' }]), title).verdict).toBe('missed');
  });

  it('★ 名指しの題名の検査が 1 件も走らなければ unmatched・読み込めなければ load-error (どちらも「捕まえた」と読まない)', () => {
    expect(tool.verdictOf(report([{ title: '別', status: 'failed' }]), '★ 断る').verdict).toBe('unmatched');
    expect(tool.verdictOf(report([], 'failed', 'Transform failed'), '★ 断る')).toMatchObject({ verdict: 'load-error', message: 'Transform failed' });
    expect(tool.verdictOf(null, '★ 断る').verdict).toBe('load-error');
    // skip された名指しの検査は数えない (走っていない検査は何も見ていない)。
    expect(tool.verdictOf(report([{ title: '★ 断る', status: 'skipped' }]), '★ 断る').verdict).toBe('unmatched');
  });

  it('it.each の題名 (%s / $name) と describe の名指しも当たる', () => {
    expect(tool.titleMatcher('★ %s を危機と判定する (threat: T-089)').test('★ 消えてしまいたい を危機と判定する (threat: T-089)')).toBe(true);
    expect(tool.titleMatcher('★ $name で断る').test('★ ZWSP で断る')).toBe(true);
    // 台帳の名指しは題名の一部でよい (★ と (threat: T-xxx) を省いた行が在る —— 台帳の検査も部分一致)。
    expect(tool.titleMatcher('重み: 全 AI 合議 (chatAll) は数える').test('★ 重み: 全 AI 合議 (chatAll) は数える (threat: T-152)')).toBe(true);
    // 正規表現の字は字のまま (題名の括弧や `.` が任意の字に化けない)。
    expect(tool.titleMatcher('a.b (c)').test('axb (c)')).toBe(false);
    expect(tool.verdictOf(report([{ title: '★ x', status: 'failed', ancestorTitles: ['確かめる段階 (threat: T-147)'] }]), '確かめる段階 (threat: T-147)').verdict).toBe('caught');
  });

  it('★ 名指しが複数在れば、どれか 1 つが捕まえれば caught・どれも通れば missed・測れない物は missed より先に言う', () => {
    const v = (verdict: string): Verdict => ({ verdict, matched: 1, failed: verdict === 'caught' ? 1 : 0 });
    expect(tool.combineVerdicts([v('missed'), v('caught')]).verdict).toBe('caught');
    expect(tool.combineVerdicts([v('missed'), v('missed')]).verdict).toBe('missed');
    expect(tool.combineVerdicts([v('missed'), v('unmatched')]).verdict).toBe('unmatched');
    expect(tool.combineVerdicts([v('caught'), v('caught')])).toMatchObject({ matched: 2, failed: 2 });
  });

  it('書き換えは順に当たり、`$` を置換の記法として読まない', () => {
    expect(tool.applyEdits('a b c', [{ find: 'b', replace: '$&$&' }, { find: 'c', replace: 'C' }])).toBe('a $&$& C');
    expect(tool.occurrences('aaaa', 'aa')).toBe(2);
    expect(tool.occurrences('abc', '')).toBe(0);
    expect(tool.editsOf({ find: 'x', replace: 'y' })).toEqual([{ find: 'x', replace: 'y' }]);
  });

  it('`--report` は捕まえ損ねで落とさない形 (毎日の報告が言う)', () => {
    expect(tool.parseArgs(['run', '--report']).report).toBe(true);
    expect(tool.parseArgs(['run']).report).toBe(false);
  });
});

describe('書き換えの台帳 —— どれも今の守りにちょうど 1 回当たる (threat: T-226)', () => {
  it('★ 実物の台帳に古びた書き換え・台帳に無い脅威・空の理由が無い', () => {
    expect(tool.staticProblems(ablations, ledger, readReal)).toEqual([]);
  });

  it('標本: 当たらない書き換え・2 回当たる書き換え・何も変えない書き換えは鳴る', () => {
    const t = { id: 'T-900', severity: 'high', status: 'fixed', found: '2026-10-30', regression: { file: 'x.test.ts', test: 'y' } };
    const lg = { threats: [t] };
    const read = () => 'gate(); gate();\nother();';
    const a = (edits: { find: string; replace: string }[]) => ({ id: 'A-900', threat: 'T-900', file: 'f.ts', why: '守りの 1 行を外す標本 (二十字以上)', edits });
    expect(tool.staticProblems([a([{ find: 'missing();', replace: '' }])], lg, read).join()).toContain('0 回');
    expect(tool.staticProblems([a([{ find: 'gate();', replace: '' }])], lg, read).join()).toContain('2 回');
    expect(tool.staticProblems([a([{ find: 'other();', replace: 'other();' }])], lg, read).join()).toContain('同じ');
    expect(tool.staticProblems([a([{ find: 'other();', replace: '' }])], lg, read)).toEqual([]);
    expect(tool.staticProblems([{ ...a([{ find: 'other();', replace: '' }]), threat: 'T-999' }], lg, read).join()).toContain('台帳に無い');
  });

  it('★ 重大度 high の脅威はすべて、開け直す書き換えを持つ', () => {
    const covered = new Set(ablations.map((a) => a.threat));
    expect(ledger.threats.filter((t) => t.severity === 'high' && t.status !== 'accepted' && !covered.has(t.id)).map((t) => t.id)).toEqual([]);
  });

  it(`★ ${ABLATION_REQUIRED_FROM} 以降に台帳へ入った脅威は、開け直す書き換えを持つ (測らずに閉じない)`, () => {
    const covered = new Set(ablations.map((a) => a.threat));
    const missing = ledger.threats.filter((t) => t.found >= ABLATION_REQUIRED_FROM && t.status !== 'accepted' && !covered.has(t.id));
    expect(missing.map((t) => t.id), 'security/threat-ablations.json に、守りを直す前の形へ戻す書き換えを足す').toEqual([]);
  });

  it('被覆は床より下がらない (書き換えを消して測る数を減らさない)', () => {
    expect(new Set(ablations.map((a) => a.threat)).size).toBeGreaterThanOrEqual(9);
  });
});

describe('配線 —— 毎日の報告が開け直しを載せる (threat: T-226)', () => {
  it('★ 捕まえ損ね・測れなかった・古びた書き換えは要対応に数える', () => {
    const lg = { threats: [{ id: 'T-1', status: 'fixed' }] };
    const one = [{ id: 'A-001', threat: 'T-1' }];
    expect(tool.ablationStatus(null, one, lg, []).actionable).toBe(1);
    expect(tool.ablationStatus(null, one, lg, []).measured).toBe(false);
    const missed = tool.ablationStatus({ rows: [{ id: 'A-001', threat: 'T-1', verdict: 'missed' }] }, one, lg, []);
    expect(missed.actionable).toBe(1);
    expect(tool.renderAblation(missed)).toContain('missed');
    expect(tool.ablationStatus({ rows: [{ id: 'A-001', threat: 'T-1', verdict: 'caught' }] }, one, lg, []).actionable).toBe(0);
    expect(tool.ablationStatus({ rows: [{ id: 'A-001', threat: 'T-1', verdict: 'caught' }] }, one, lg, ['古い']).actionable).toBe(1);
    // 途中で止まった (台帳より少ない) は「全部捕まえた」と言わない。
    expect(tool.ablationStatus({ rows: [] }, one, lg, []).actionable).toBe(1);
  });

  it('★ 毎日の workflow が開け直しを報告の前に走らせ、報告がその結果を読む', () => {
    const wf = readReal('.github/workflows/dependency-audit.yml');
    const ablate = wf.indexOf('npm run audit:threat-ablation -- --report --json orchestration/threat-ablation.json');
    expect(ablate).toBeGreaterThan(-1);
    expect(ablate).toBeLessThan(wf.indexOf('run: npm run audit:report'));
    expect(readReal('scripts/dependency-audit-report.cjs')).toMatch(/orchestration', 'threat-ablation\.json'/);
    expect(readReal('.gitignore')).toContain('orchestration/threat-ablation.json');
  });
});
