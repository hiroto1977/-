/**
 * **閉じるべき生存が何百件も在るとき、全件を 1 本のログで位置つきに読めること。**
 * (2026-09-30 · パス 502)
 *
 * ## 何が足りなかったか
 *
 * `scripts/triage-mutations.cjs` の表は `Survived` だけを `--top` 件で切り、元のソースも
 * 列も出さない。`mutation.yml` の merge-full が出すのはその上位 30 件だけで、PR の外に
 * 残った生存 660 件 (92 ファイル) を仕分けるには、artifact (環境によっては取れない) か
 * 22 本の塊の job のログを 1 本ずつ読むしか無かった。
 *
 * `--list` は `Survived` と `NoCoverage` (どちらも「殺されていない」) を全部、ファイルごと・
 * 位置順に 1 行ずつ出し、元の綴りは報告が持つ `source` から位置で切り出す。
 *
 * ## この検査が留めるもの
 *
 * 1. 位置の読み方 —— **行も列も 1 始まり・end は排他** (Stryker の報告の実測・パス 499)。
 *    1 始まりを 0 始まりと取り違えると前後の 1 字を食って別の綴りを見せる
 * 2. 殺された物 (Killed / Timeout) と無視した物 (Ignored) を**出さない**こと
 * 3. 件数の見出しと、ファイルごとの見出しの件数が同じ母集団であること
 * 4. `mutation.yml` の merge-full が併合した報告へ `--list` を当てること (配線)
 * 5. 生存の行の末尾に、その行を通した検査のファイルが付くこと (`coveredBy` → `testFiles`・
 *    多い順に 3 つまで・残りは `+N`・未知の id は無視・未到達には付かない)
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(__filename);

interface Loc {
  start: { line: number; column: number };
  end: { line: number; column: number };
}
interface Mut {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  static?: boolean;
  coveredBy?: string[];
  location: Loc;
}
interface Report {
  files: Record<string, { source?: string; mutants: Mut[] }>;
  testFiles?: Record<string, { tests: { id: string }[] }>;
}

const triage = req(path.join(REPO, 'scripts/triage-mutations.cjs')) as {
  compact: (text: string, max?: number) => string;
  sliceSource: (source: unknown, loc: unknown) => string;
  listNonKilled: (
    report: Report,
    fileFilter?: string,
  ) => { lines: string[]; survived: number; noCoverage: number; files: number };
};

// 1 行目: `const a = "abc";` ・ 2〜4 行目: 複数行の if ブロック。
const SOURCE = ['const a = "abc";', 'if (a === "x") {', '  run();', '}'].join('\n');

const at = (sl: number, sc: number, el: number, ec: number): Loc => ({
  start: { line: sl, column: sc },
  end: { line: el, column: ec },
});

describe('sliceSource — Stryker の位置 (行も列も 1 始まり・end は排他)', () => {
  it('1 行に収まる物は、開始列の字から終了列の手前までを返す', () => {
    // `"abc"` は 1 行目の 11〜15 列目 (1 始まり)・end は 16 (排他)。
    expect(triage.sliceSource(SOURCE, at(1, 11, 1, 16))).toBe('"abc"');
    // 0 始まりと取り違えると前後 1 字ずつ食う (標本: この主張が針に当たること)。
    expect(SOURCE.split('\n')[0]!.slice(11, 16)).not.toBe('"abc"');
  });

  it('複数行は、最初の行の途中から最後の行の途中までを改行つきで返す', () => {
    // `{` は 2 行目の 16 列目・`}` は 4 行目の 1 列目 (end 2 = 排他)。
    expect(triage.sliceSource(SOURCE, at(2, 16, 4, 2))).toBe('{\n  run();\n}');
  });

  it('位置が source に収まらない・source が無いときは空文字を返す', () => {
    expect(triage.sliceSource(SOURCE, at(9, 1, 9, 3))).toBe('');
    expect(triage.sliceSource(SOURCE, at(3, 1, 2, 1))).toBe('');
    expect(triage.sliceSource(undefined, at(1, 1, 1, 2))).toBe('');
    expect(triage.sliceSource(SOURCE, undefined)).toBe('');
  });
});

describe('compact — 1 行に収める', () => {
  it('空白の並びを 1 つにし、長ければ … で切る (全体で max 字)', () => {
    expect(triage.compact('  a \n\n  b\t c ')).toBe('a b c');
    const long = triage.compact('x'.repeat(200), 10);
    expect(long).toBe(`${'x'.repeat(9)}…`);
    expect(long.length).toBe(10);
  });
});

function report(): Report {
  const mk = (id: string, status: string, loc: Loc, extra: Partial<Mut> = {}): Mut => ({
    id,
    mutatorName: 'ConditionalExpression',
    replacement: 'false',
    status,
    location: loc,
    ...extra,
  });
  return {
    files: {
      'src/b.ts': {
        source: SOURCE,
        mutants: [
          // 位置順に並べ直されること (2 行目が先に書いてあるのに 1 行目が先に出る)。
          mk('1', 'Survived', at(2, 5, 2, 14), { replacement: 'false', coveredBy: ['10', '11', '12'] }),
          mk('2', 'NoCoverage', at(1, 11, 1, 16), { mutatorName: 'StringLiteral', replacement: '""' }),
          mk('3', 'Killed', at(3, 3, 3, 8)),
          mk('4', 'Timeout', at(3, 3, 3, 8)),
          mk('5', 'Ignored', at(3, 3, 3, 8)),
          mk('6', 'Survived', at(2, 16, 4, 2), { mutatorName: 'BlockStatement', replacement: '{}', static: true, coveredBy: ['10'] }),
          mk('7', 'CompileError', at(3, 3, 3, 8)),
        ],
      },
      'src/clean.ts': { source: 'x', mutants: [mk('9', 'Killed', at(1, 1, 1, 2))] },
      'src/nosrc.ts': { mutants: [mk('8', 'Survived', at(1, 1, 1, 2), { replacement: '' })] },
    },
    // id 10・11 は alpha の検査、12 は beta の検査 (ファイル名は `.test.ts` を落として短くして出す)。
    testFiles: {
      'src/x/__tests__/alpha.test.ts': { tests: [{ id: '10' }, { id: '11' }] },
      'src/x/__tests__/beta.test.ts': { tests: [{ id: '12' }] },
    },
  };
}

describe('listNonKilled — 殺されていない全件を 1 行ずつ', () => {
  const r = triage.listNonKilled(report());

  it('Survived と NoCoverage だけを数え、見出しの件数は行の数と一致する', () => {
    expect({ s: r.survived, n: r.noCoverage, f: r.files }).toEqual({ s: 3, n: 1, f: 2 });
    const rows = r.lines.filter((l) => /^L\d+:\d+ /.test(l));
    expect(rows).toHaveLength(r.survived + r.noCoverage);
    // 全部殺されているファイルは見出しも出ない。
    expect(r.lines.join('\n')).not.toContain('src/clean.ts');
    // ファイルごとの見出しの件数の合計も同じ母集団。
    const heads = r.lines.map((l) => /^## .* \((\d+)\)$/.exec(l)).filter((m): m is RegExpExecArray => m !== null);
    expect(heads.map((m) => Number(m[1]))).toEqual([3, 1]);
  });

  it('位置順に並び、S / N・mutator・(static)・元の綴り ⇒ 置き換えを 1 行で出す', () => {
    expect(r.lines).toEqual([
      '',
      '## src/b.ts (3)',
      'L1:11 N StringLiteral "abc" ⇒ ""',
      'L2:5 S ConditionalExpression a === "x" ⇒ false ← alpha×2, beta',
      'L2:16 S BlockStatement (static) { run(); } ⇒ {} ← alpha',
      '',
      '## src/nosrc.ts (1)',
      'L1:1 S ConditionalExpression ? ⇒ (空)',
    ]);
  });

  it('--file 相当の絞り込みは、ファイル名に含まれる物だけを出す', () => {
    const only = triage.listNonKilled(report(), 'nosrc');
    expect({ s: only.survived, n: only.noCoverage, f: only.files }).toEqual({ s: 1, n: 0, f: 1 });
  });

  it('殺されていない物が 1 つも無い報告は、行を 1 つも出さない', () => {
    const none = triage.listNonKilled({ files: { 'src/clean.ts': report().files['src/clean.ts']! } });
    expect(none).toEqual({ lines: [], survived: 0, noCoverage: 0, files: 0 });
  });
});

describe('listNonKilled — 行を通した検査のファイル (← a×3, b, c +N)', () => {
  const one = (coveredBy: string[] | undefined, status = 'Survived'): string[] => {
    const rep: Report = {
      files: { 'src/a.ts': { source: 'x', mutants: [{ id: '1', mutatorName: 'M', replacement: 'y', status, coveredBy, location: at(1, 1, 1, 2) }] } },
      testFiles: {
        'a/__tests__/one.test.ts': { tests: [{ id: '1' }] },
        'a/__tests__/two.test.ts': { tests: [{ id: '2' }, { id: '3' }] },
        'a/__tests__/three.test.ts': { tests: [{ id: '4' }, { id: '5' }, { id: '6' }] },
        'a/__tests__/four.test.tsx': { tests: [{ id: '7' }] },
        'a/__tests__/tool.audit.ts': { tests: [{ id: '8' }] },
      },
    };
    return triage.listNonKilled(rep).lines.filter((l) => l.startsWith('L1:1 '));
  };

  it('件数の多い順に 3 ファイルまで出し、残りは +N (同数は名前順・1 件は ×1 を付けない)', () => {
    // three×3 / two×2 / 同数 1 件は four・one・tool の名前順 → four が先で 3 つ目、one と tool は +2
    expect(one(['1', '2', '3', '4', '5', '6', '7', '8'])).toEqual(['L1:1 S M x ⇒ y ← three×3, two×2, four +2']);
    // 3 ファイル以内なら +N は付かない
    expect(one(['4', '5', '1'])).toEqual(['L1:1 S M x ⇒ y ← three×2, one']);
  });

  it('.test.ts / .test.tsx / .audit.ts の拡張子を落として短くする', () => {
    expect(one(['7'])).toEqual(['L1:1 S M x ⇒ y ← four']);
    expect(one(['8'])).toEqual(['L1:1 S M x ⇒ y ← tool']);
  });

  it('coveredBy が無い・空・どの検査にも当たらない id だけなら、何も付けない', () => {
    expect(one(undefined)).toEqual(['L1:1 S M x ⇒ y']);
    expect(one([])).toEqual(['L1:1 S M x ⇒ y']);
    expect(one(['999'])).toEqual(['L1:1 S M x ⇒ y']);
    // 知らない id は数えず、知っている id だけが残る
    expect(one(['999', '1'])).toEqual(['L1:1 S M x ⇒ y ← one']);
  });

  it('未到達 (N) には付けない (どの検査も通っていない)', () => {
    expect(one(['1'], 'NoCoverage')).toEqual(['L1:1 N M x ⇒ y']);
  });

  it('testFiles が無い報告でも落ちず、何も付けない', () => {
    const rep: Report = {
      files: { 'src/a.ts': { source: 'x', mutants: [{ id: '1', mutatorName: 'M', replacement: 'y', status: 'Survived', coveredBy: ['1'], location: at(1, 1, 1, 2) }] } },
    };
    expect(triage.listNonKilled(rep).lines.filter((l) => l.startsWith('L1:1 '))).toEqual(['L1:1 S M x ⇒ y']);
  });
});

describe('--list の配線', () => {
  it('CLI は --report の報告を読み、見出しの次から全件を出す', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // 実物の main を呼ぶ (合成の報告を一時ファイルへ書く代わりに、読むのは --report の先)。
      // 一時ファイルを作らずに済むよう、報告は fs の読みを差し替えて渡す。
      const fs = req('node:fs') as typeof import('node:fs');
      const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(report()) as never);
      try {
        (req(path.join(REPO, 'scripts/triage-mutations.cjs')) as { main: (a: string[]) => void }).main(['--list', '--report=/x.json']);
      } finally {
        exists.mockRestore();
        read.mockRestore();
      }
      const out = log.mock.calls.map((c) => String(c[0]));
      expect(out[0]).toBe('# 殺されていない変異体 — 生存 3 件 / 未到達 1 件 (2 ファイル)');
      expect(out).toContain('L2:5 S ConditionalExpression a === "x" ⇒ false ← alpha×2, beta');
    } finally {
      log.mockRestore();
    }
  });

  it('mutation.yml の merge-full は、併合した報告へ --list を当てる (失敗しても出す)', () => {
    const yml = readOriginalSource(path.join(REPO, '.github/workflows/mutation.yml'));
    const start = yml.indexOf('\n  merge-full:');
    const end = yml.indexOf('\n  mutate-some:');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const job = yml.slice(start, end);
    const step = /- name: List every non-killed mutant\n((?: {8}.*\n)+)/.exec(job);
    expect(step, 'merge-full に「List every non-killed mutant」の step が在る').not.toBeNull();
    const body = step![1]!;
    expect(body).toContain("if: always() && hashFiles('reports/mutation/mutation.json') != ''");
    expect(body).toContain('run: node scripts/triage-mutations.cjs --list');
  });
});
