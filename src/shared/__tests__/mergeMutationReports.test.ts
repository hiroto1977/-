/**
 * **週次の全掃引を塊に分けて測り、塊の報告を 1 つへ併合する仕組みが、噛み合っていること。**
 * (2026-09-30 · パス 501e)
 *
 * ## 何が起きていたか
 *
 * 週次の全掃引は全件を 1 つの job で測る形で、**6 時間で cancel された**
 * (2026-09-27 の #172・対象は 304 本・45,547 変異体)。push 側は 501d で対象を行数で塊に
 * 分けて別々の job で測るようにしたので、週次・手動も同じ塊 (`scripts/mutate-changed.cjs
 * --all --chunks`) で測り、塊ごとの報告を `scripts/merge-mutation-reports.cjs` が 1 つの
 * `mutation.json` へ併合する。下流の 4 つの道具 (quality-report / triage / suggest-next-kill /
 * verify-survivors) は 1 つのファイルを前提にするため。
 *
 * ## この検査が留めるもの
 *
 * 1. 併合 script の自己検査が全件通る (22 件・実物の chunker との対照を含む)
 * 2. **併合した報告は quality-report から見て全掃引になり、1 塊欠ければ部分になる**
 *    (併合と生成側が別々に直って食い違う日を作らない)
 * 3. workflow の配線 (`mutate-full` の塊が artifact になり、`merge-full` が同じ接頭辞で集める)
 * 4. `scope` は全件を必ず塊にして出す (空を skip と読んで緑にしない)
 * 5. `run:` に `${{` を置かない (lint:workflow-security と二重に —— 新しい job も)
 * 6. `package.json` の `mutate:merge` は本体が末尾で、workflow が併合 script の自己検査を走らせる
 *
 * 不在の主張 (「actions/cache を持たない」「`${{` を置かない」) には、その針が実際に
 * 当たる標本を同じ `it` の中で添える (規約)。
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';
import { scriptSegments, segmentRunsTheTool } from '../ontology/laws';

const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(__filename);

interface Chunk {
  label: string;
  report: Record<string, unknown>;
}
interface Merged {
  report: (Record<string, unknown> & { config: { mutate: string[] }; files: Record<string, unknown> }) | null;
  fatal: string[];
  partial: string[];
  warnings: string[];
  stats: { files: number; chunks: number };
}

const merge = req(path.join(REPO, 'scripts/merge-mutation-reports.cjs')) as {
  REPORT_KEYS: string[];
  mergeReports: (chunks: Chunk[], opts?: Record<string, unknown>) => Merged;
  selfTest: () => number;
};
const quality = req(path.join(REPO, 'scripts/quality-report.cjs')) as {
  isLiteralPath: (p: unknown) => boolean;
  runMutateOf: (r: unknown) => string[] | null;
  judgeScope: (a: { rows: string[]; runNamed: string[] | null; named: string[] }) => { partial: boolean; notInRun: string[] };
  summarizeReport: (r: unknown, root: string) => { rows: { file: string }[] };
  reportMeasuredMs: (r: unknown, mtime: number) => number;
};
const changed = req(path.join(REPO, 'scripts/mutate-changed.cjs')) as {
  allTargets: () => string[];
  chunksOutput: (t: string[]) => { parts: string[]; json: string };
  MAX_MATRIX_JOBS: number;
};

const YAML = readOriginalSource(path.join(REPO, '.github/workflows/mutation.yml'));
const PKG = JSON.parse(readOriginalSource(path.join(REPO, 'package.json'))) as { scripts: Record<string, string> };

/** 注記の行を落とす (説明文の中の綴りを配線として数えない)。 */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/** `jobs:` 直下の job (2 字下げの `name:`) ごとの本文。 */
function jobBlocks(text: string): Record<string, string> {
  const body = withoutComments(text);
  const jobs = body.slice(body.indexOf('\njobs:') + 1);
  const out: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of jobs.split('\n').slice(1)) {
    const m = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (m !== null) {
      cur = m[1]!;
      out[cur] = '';
    } else if (cur !== null) {
      out[cur] += `${line}\n`;
    }
  }
  return out;
}

/** すべての `run:` の本文 (1 行の形とブロックの形)。 */
function runBodies(text: string): string[] {
  const lines = withoutComments(text).split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]!);
    if (m === null) continue;
    const indent = m[1]!.length;
    if (m[2]!.startsWith('|') || m[2]!.startsWith('>')) {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const l = lines[j]!;
        if (l.trim() !== '' && l.length - l.trimStart().length <= indent) break;
        block.push(l);
      }
      out.push(block.join('\n'));
    } else {
      out.push(m[2]!);
    }
  }
  return out;
}

const has = (block: string | undefined, needle: string): boolean => (block ?? '').includes(needle);

/** 合成の 1 塊 (1 ファイルに 1 変異体)。 */
function chunk(label: string, files: string[]): Chunk {
  const fs: Record<string, unknown> = {};
  for (const f of files) {
    fs[f] = {
      language: 'typescript',
      source: '',
      mutants: [{ id: '0', mutatorName: 'BlockStatement', replacement: '{}', status: 'Killed', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } }],
    };
  }
  return {
    label,
    report: {
      files: fs,
      schemaVersion: '1.0',
      thresholds: { high: 100, low: 99.9, break: 99.8 },
      testFiles: {},
      projectRoot: '/work',
      config: { mutate: files, timeoutMS: 30000 },
      framework: { name: 'StrykerJS', version: '9.6.1' },
    },
  };
}

describe('併合 script (パス 501e)', () => {
  it('★ 併合 script の self-test が全件通る (実物の chunker との対照を含む)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(merge.selfTest()).toBe(0);
    } finally {
      log.mockRestore();
      err.mockRestore();
      out.mockRestore();
    }
    expect(merge.REPORT_KEYS).toEqual(['files', 'schemaVersion', 'thresholds', 'testFiles', 'projectRoot', 'config', 'framework']);
  });

  it('★ 併合した報告は quality-report から見て全掃引になり、1 塊欠ければ部分になる', () => {
    const named = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'];
    const chunks = [chunk('c-0', ['src/a.ts', 'src/b.ts']), chunk('c-1', ['src/c.ts', 'src/d.ts']), chunk('c-2', ['src/e.ts', 'src/f.ts'])];
    const whole = merge.mergeReports(chunks, { expectMutate: named, expectChunks: 3 });
    expect(whole.fatal).toEqual([]);
    expect(whole.partial).toEqual([]);
    const report = whole.report!;
    // 生成側は併合報告の mutate を「比べられる形」と読み、全件を名指ししていたと判定する。
    expect(quality.runMutateOf(report)).toEqual(named);
    const rows = quality.summarizeReport(report, '/repo').rows.map((r) => r.file);
    expect(rows).toEqual(named);
    expect(quality.judgeScope({ rows, runNamed: quality.runMutateOf(report), named }).partial).toBe(false);
    // 1 塊を落とした併合 (手元の試し) は、落とした塊の全ファイルを名指しする部分になる。
    const lost = merge.mergeReports(chunks.slice(1), { expectMutate: named, expectChunks: 3, allowPartial: true }).report!;
    const lostRows = quality.summarizeReport(lost, '/repo').rows.map((r) => r.file);
    const j = quality.judgeScope({ rows: lostRows, runNamed: quality.runMutateOf(lost), named });
    expect(j.partial).toBe(true);
    expect(j.notInRun).toEqual(['src/a.ts', 'src/b.ts']);
    // 併合報告の mutate の判定は quality-report と同じ規則 (写しのパリティ)。
    // 併合が「ファイルのパスの配列ではありません」と断る物と、quality-report が「比べられない形」と
    // 読む物は、同じ標本で必ず一致する。
    const samples = ['src/a.ts', 'src/a.tsx', 'src/**/*.ts', 'src/a.ts:12', '', 'src/{a,b}.ts', 'src/a?.ts', 'src/[a].ts', 'src/!a.ts'];
    const refused: boolean[] = [];
    for (const p of samples) {
      const r = merge.mergeReports([chunk('y', [p])]);
      const byMerge = r.fatal.some((f) => f.includes('ファイルのパスの配列ではありません'));
      expect(byMerge, JSON.stringify(p)).toBe(!quality.isLiteralPath(p));
      refused.push(byMerge);
    }
    // 針が生きている: 断る標本も通す標本も在る。
    expect(refused.filter(Boolean).length).toBeGreaterThanOrEqual(6);
    expect(refused.filter((x) => !x).length).toBeGreaterThanOrEqual(2);
    // 併合報告は自分の時刻を持ち、mtime に頼らない。
    const at = report['mergedAt'];
    expect(typeof at).toBe('string');
    expect(quality.reportMeasuredMs(report, 0)).toBe(Date.parse(at as string));
  });
});

describe('workflow の配線 (パス 501e)', () => {
  const jobs = jobBlocks(YAML);

  it('★ mutate-full と merge-full が同じ接頭辞の artifact でつながる', () => {
    expect(Object.keys(jobs)).toEqual(['scope', 'mutate-full', 'merge-full', 'mutate-some']);
    const full = jobs['mutate-full']!;
    const mergeJob = jobs['merge-full']!;
    expect(has(full, 'chunk: ${{ fromJson(needs.scope.outputs.chunks) }}')).toBe(true);
    for (const needle of ['fail-fast: false', 'max-parallel:', 'rm -f .stryker-incremental.json', '--mutate "$TARGETS"', '--dryRunTimeoutMinutes']) {
      expect(has(full, needle), needle).toBe(true);
    }
    // 不在の主張には標本を添える: 針は実際にその綴りへ当たる (cache を使う job を作ればこの検査が鳴る)。
    expect(has('      - uses: actions/cache@v4\n', 'actions/cache')).toBe(true);
    expect(has(full, 'actions/cache')).toBe(false);
    const prefix = 'mutation-report-full-chunk-';
    expect(has(full, `name: ${prefix}\${{ strategy.job-index }}`)).toBe(true);
    expect(has(mergeJob, `pattern: ${prefix}*`)).toBe(true);
    // Re-run failed jobs で同名の artifact があっても落ちない。
    expect(has(full, 'overwrite: true')).toBe(true);
    expect(has(mergeJob, 'overwrite: true')).toBe(true);
    // merge-full は塊が全部終わってから (失敗した塊があっても) 走り、環境変数で結果と数を受ける。
    expect(has(mergeJob, 'needs: [scope, mutate-full]')).toBe(true);
    expect(has(mergeJob, '!cancelled()')).toBe(true);
    expect(has(mergeJob, 'CHUNKS_RESULT: ${{ needs.mutate-full.result }}')).toBe(true);
    expect(has(mergeJob, 'EXPECTED_CHUNKS: ${{ needs.scope.outputs.count }}')).toBe(true);
    // 併合後の upload 名は下流 (quality-report の文書・手順) が読む `mutation-report`。
    expect(has(mergeJob, '          name: mutation-report\n')).toBe(true);
    expect(has(mergeJob, '--self-test')).toBe(true);
    expect(has(mergeJob, '--out reports/mutation/mutation.json')).toBe(true);
    expect(has(mergeJob, '--expect-chunks')).toBe(true);
    // 併合は Node の組み込みしか読まないので npm ci は要らない (無駄に依存を入れない)。
    expect(has('        run: npm ci\n', 'npm ci')).toBe(true);
    expect(has(mergeJob, 'npm ci')).toBe(false);
    // push 側は 501d のまま (塊の artifact は別の名前・週次の塊と混ざらない)。
    expect(has(jobs['mutate-some'], 'name: mutation-report-chunk-${{ strategy.job-index }}')).toBe(true);
  });

  it('★ scope は全件を必ず塊にして出す (空を skip と読んで緑にしない)', () => {
    const scope = jobs['scope']!;
    const runs = runBodies(YAML).filter((b) => b.includes('EVENT_NAME'));
    expect(runs.length).toBe(1);
    const body = runs[0]!;
    expect(body.split('--all --chunks').length - 1).toBe(1);
    expect(body).toContain('mode=skip');
    // skip の枝にだけ ["none"] を置く (測る mode に読めない値を残さない)。
    const skip = body.slice(body.indexOf('elif [ -z "$CHUNKS" ]'), body.indexOf('exit 0'));
    expect(skip).toContain('mode=skip');
    expect(skip).toContain('chunks=["none"]');
    expect(body.split('chunks=["none"]').length - 1).toBe(1);
    expect(body.split('mode=skip').length - 1).toBe(1);
    expect(body).toContain('count=');
    expect(has(scope, 'count: ${{ steps.scope.outputs.count }}')).toBe(true);
    expect(has(scope, 'node scripts/mutate-changed.cjs --self-test')).toBe(true);
  });

  it('★ 全ジョブの run: に ${{ を置かない (新しい job も lint:workflow-security と二重に)', () => {
    const bodies = runBodies(YAML);
    expect(bodies.length).toBeGreaterThanOrEqual(8);
    // 針が実際に当たる標本: 埋め込みを持つ run と持たない run。
    const sample = 'jobs:\n  a:\n    steps:\n      - run: echo ${{ github.ref }}\n      - run: |\n          echo ok\n          echo ${{ matrix.chunk }}\n      - run: echo plain\n';
    const found = runBodies(sample).filter((b) => b.includes('${{'));
    expect(found.length).toBe(2);
    expect(runBodies(sample).length).toBe(3);
    expect(bodies.filter((b) => b.includes('${{'))).toEqual([]);
  });
});

describe('道具の入口 (パス 501e)', () => {
  it('★ mutate:merge は本体が末尾で、workflow が自己検査を走らせ、chunker と併合が過不足なく噛み合う', () => {
    const segs = scriptSegments(PKG.scripts['mutate:merge'] ?? '');
    expect(segs.length).toBe(2);
    // npm は `--` のあとの引数を末尾の命令へ足す —— 自己検査が先・本体が末尾。
    expect(segmentRunsTheTool(segs[0]!)).toBe(false);
    expect(segmentRunsTheTool(segs[1]!)).toBe(true);
    expect(segs[1]).toContain('scripts/merge-mutation-reports.cjs');
    expect(PKG.scripts['mutate']).toBe('stryker run');
    expect(withoutComments(YAML)).toContain('node scripts/merge-mutation-reports.cjs --self-test');
    // 外側の証人: config の mutate を独立に読み直し、chunker の塊が過不足なく覆うこと。
    const cfg = JSON.parse(readOriginalSource(path.join(REPO, 'stryker.config.json'))) as { mutate: string[] };
    const want = [...cfg.mutate].sort();
    expect(changed.allTargets()).toEqual(want);
    const parts = changed.chunksOutput(want).parts;
    const seen = parts.flatMap((p) => p.split(','));
    expect([...seen].sort()).toEqual(want);
    expect(new Set(seen).size).toBe(seen.length);
    expect(parts.length).toBeLessThanOrEqual(changed.MAX_MATRIX_JOBS);
  });
});
