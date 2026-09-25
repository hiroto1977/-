import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **`mutate` 台帳のファイルを原文で読む検査は、`readOriginalSource` を通す。**
 *
 * 2026-09-07 の実測: 原文を読む検査 56 件のうち **37 件が `mutate` 台帳のファイルを
 * 読んでいた**。Stryker は台帳のファイルを**書き換えてから** sandbox に置くので、
 * 綴りに当てる走査は sandbox の中で 0 件になり、「無いこと」の主張は
 * **どの入力でも通る空の検査**になる。床を持っていたのは 1 件だけで、
 * 残り 36 件は黙って空の検査になっていた (`originalSource.ts` の冒頭に経緯)。
 *
 * 1 件ずつ直しても**次に足す人が同じ穴に落ちる**ので、規則そのものを機械に持たせる。
 * これは静的に決まるので **Stryker を回さずに検査できる** (全件走査はこの箱で約 5 時間)。
 *
 * 規則は 2 本ある:
 *
 *   1. **道が読める生の読み**は、その道が台帳に在るなら違反 (`★ 台帳のファイルを…`)。
 *      台帳に無いファイル (文書・ワークフロー・`package.json`・資産) は書き換わらないので規則の外。
 *   2. **道が読めない生の読み** (変数・ファイル局所の定数・一時ファイル) は、
 *      何を読んでいるか機械には決められない。**理由つきで台帳に登録する** (`★ 道が読めない…`)。
 *
 * **規則 2 は後から足した。** 規則 1 だけだった時、`readdirSync` で木を歩いて
 * `readFileSync(p)` する走査 —— つまり「この綴りはどこにも無い」を主張する census そのもの ——
 * は道が変数なので**規則から丸ごと外れていた** (実測 15 ファイル)。
 * 一番空になりやすい形が一番の死角だった。
 *
 * ## 2026-09-15 (パス 269): **網が同期の綴りしか見ていなかった**
 *
 * 走査は `readFileSync` / `readdirSync` を探していた。`node:fs/promises` の
 * **非同期の綴り** (`readFile` / `readdir`) は 1 件も見ていない —— つまり
 * `await readFile(new URL('../../main/clients/assistant.ts', import.meta.url), 'utf8')`
 * は、台帳のファイルを原文で読んでいるのに**規則の外に在った**。
 *
 * 実測で 1 件在った: `assistantTurnsParity.test.ts` が
 * `src/main/clients/assistant.ts` (台帳に在る) を非同期で読み、
 * **`not.toContain('system.slice(0, MAX_SYSTEM)')` という「無いこと」の主張をしていた**。
 * sandbox の中ではその綴りは計器に書き換えられているので、主張は
 * **どの入力でも通る空の検査**になる —— 2026-09-07 に 36 件直したのと同じ欠陥が、
 * 綴りを 1 つ変えただけで戻ってきていた。
 *
 * だから `Sync` を**省略可**にした (`read(?:File|dir)(?:Sync)?`)。
 * これで非同期の読みも規則 1・2 の両方に掛かる。
 * 規則が見る綴りを増やすと**規則 2 の台帳が 8 → 19 件に増える** ——
 * 増えた 11 件はどれも自分が `mkdtemp` で作った一時ファイルを読み戻す検査で、
 * repo のファイルではないから書き換わらない (1 件ずつ確かめて理由を書いた)。
 *
 * **網の目の大きさは、網そのものと同じくらい確かめる必要がある。**
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * 生の読みの綴り。**この検査は禁じている綴りを標本として持つ**ので、
 * 自分が自分の規則に掛からないよう **綴りを 2 つに割って組み立てる** (値は同じ)。
 * 割らずに書くと、この本文の中の標本が「未解決の生の読み」として数えられる。
 */
const READ = `${'read'}FileSync`;
const READDIR = `${'read'}dirSync`;
/** 非同期の綴り (`node:fs/promises`)。**穴だったのはこちら** —— 下の規則 3 を見よ。 */
const READ_ASYNC = `${'read'}File`;
const RAW_READ = /read(?:File|dir)(?:Sync)?\s*\(/g;

/** `stryker.config.json` の `mutate` (= Stryker が書き換えるファイル)。 */
function mutateLedger(): Set<string> {
  const raw = readOriginalSource(path.join(REPO_ROOT, 'stryker.config.json'));
  const config = JSON.parse(raw) as { mutate?: string[] };
  return new Set(config.mutate ?? []);
}

/** `src/**\/__tests__/**\/*.test.ts` を全部集める。 */
function testFiles(dir = path.join(REPO_ROOT, 'src')): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(p));
    else if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

/**
 * 引数の窓の先頭から、**連なる文字列リテラル**を読む。
 * `'a', 'b')` → `['a','b']` / `'a', rel)` → null (最後が変数) / `rel)` → null。
 *
 * `join(REPO_ROOT, 'ingest', 'x', 'y.json')` のような**多段の join** を読むために要る。
 * 最初の版は 1 段しか見ておらず、多段は先頭の `'ingest'` だけを道として拾っていた
 * (台帳と当たらないので害は出なかったが、抽出としては誤り)。
 */
export function literalSegments(rest: string): string[] | null {
  const out: string[] = [];
  let s = rest;
  for (;;) {
    const m = /^\s*(['"])((?:[^'"\\]|\\.)*)\1\s*/.exec(s);
    if (m === null) return null;
    out.push(m[2]!);
    s = s.slice(m[0].length);
    if (s.startsWith(',')) {
      s = s.slice(1);
      continue;
    }
    if (s.startsWith(')')) return out;
    return null;
  }
}

/**
 * 生の読み 1 件から、**読んでいる repo 相対の道**を取り出す (読めなければ null)。
 *
 * 読めるのは根が一意に決まる 3 通りだけ:
 *   `new URL('../../main/main.ts', import.meta.url)`  → 検査から相対
 *   `join(REPO_ROOT, 'src', 'shared/ollama.ts')`      → repo 直下から (多段可)
 *   `resolve(__dirname, '../fxCurrency.ts')`          → 検査から相対 (多段可)
 *
 * `join(SRC, rel)` のようにファイル局所の定数や変数が入る形は **読めない (null)**。
 * ここで「読めないから違反」にすると一時ファイルの読みまで巻き込むので、
 * 読めない物は規則 2 (台帳) が受け持つ。
 */
export function readTarget(arg: string, dir: string): string | null {
  const rel = (abs: string): string => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

  const url = /^\s*new URL\(\s*(['"])((?:[^'"\\]|\\.)*)\1/.exec(arg);
  if (url !== null) return rel(path.resolve(dir, url[2]!));

  const fromRoot = /^\s*(?:\w+\.)?(?:join|resolve)\(\s*REPO_ROOT\s*,/.exec(arg);
  if (fromRoot !== null) {
    const segs = literalSegments(arg.slice(fromRoot[0].length));
    return segs === null ? null : rel(path.resolve(REPO_ROOT, ...segs));
  }

  const fromDir = /^\s*(?:\w+\.)?(?:join|resolve)\(\s*__dirname\s*,/.exec(arg);
  if (fromDir !== null) {
    const segs = literalSegments(arg.slice(fromDir[0].length));
    return segs === null ? null : rel(path.resolve(dir, ...segs));
  }

  const cwd = /^\s*(?:\w+\.)?resolve\(\s*process\.cwd\(\)\s*,/.exec(arg);
  if (cwd !== null) {
    const segs = literalSegments(arg.slice(cwd[0].length));
    return segs === null ? null : rel(path.resolve(REPO_ROOT, ...segs));
  }

  const bare = literalSegments(arg);
  if (bare !== null && bare.length === 1) return rel(path.resolve(REPO_ROOT, bare[0]!));

  return null;
}

/** その検査の生の読みを、道が読めた物 / 読めなかった件数に分ける。 */
export function rawReads(testAbsPath: string, text: string): { targets: string[]; unresolved: number } {
  const code = stripComments(text);
  const dir = path.dirname(testAbsPath);
  const targets: string[] = [];
  let unresolved = 0;
  // **引数を「最初の `)` まで」で切ってはいけない** —— `path.join(REPO_ROOT, 'x')` の
  // 中のカンマと括弧で捕獲が切れ、`join(...)` の綴りが 1 件も見えなかった
  // (最初の版はこれで実測 4 件しか拾えず、床の検査が教えてくれた)。
  //
  // **窓は先読みで見る。** 窓を捕獲に含めると `matchAll` が窓ごと消費し、
  // **200 字以内に続く 2 件目の読みが飛ぶ**。この形は実在した (`scriptEmbedGate` は
  // 2 件を 1 件と数えていた) —— 台帳の件数と実測が食い違って初めて分かった。
  for (const m of code.matchAll(/read(?:File|dir)(?:Sync)?\s*\((?=([\s\S]{0,200}))/g)) {
    const t = readTarget(m[1] ?? '', dir);
    if (t === null) unresolved += 1;
    else targets.push(t);
  }
  return { targets, unresolved };
}

/**
 * 規則 1 の外に置く検査の台帳。**理由を書くこと** —— 書けないなら直すべきである。
 */
const ALLOWED: Readonly<Record<string, string>> = {};

/**
 * 規則 2 の台帳 —— **道が読めない生の読み**を持つ検査。
 * `count` は実測の件数で、**増えたら鳴る** (台帳が白紙委任にならないように)。
 */
const VARIABLE_PATH_ALLOWED: Readonly<Record<string, { count: number; why: string }>> = {
  'src/main/__tests__/fileReadSizeGateCensus.test.ts': {
    count: 9,
    why: 'この census の母集団は `readFile` の呼び出しそのものなので、台帳の needle と標本が**数える綴りを引用する**。実際の読みは `readOriginalSource` だけを通しており、引用は文字列リテラルで走らない —— 綴りを分割して走査を避けるより、理由つきで載せる方が読める (パス 326)。**件数は 2026-09-25 (パス 462) に 6 → 9 へ実測で直した** —— 自前の注記除去が glob の `**` から始まる偽の注記で 45 行を食っており、その中の引用 3 件が見えていなかった',
  },
  'src/shared/__tests__/trackedPopulationWitness.test.ts': {
    count: 1,
    why: '**この検査自身は 1 度も読まない** —— 当たっているのは子プロセスへ渡すコード文字列の中の `readdirSync` で、'
      + '「走査を一部だけ殺す細工が木を無傷のまま残しているか」を別のプロセスで確かめるためのもの (パス 470)。'
      + '読むのは `scripts/` の**一覧**で中身ではないし、この検査は前置きで `fs` を書き換えた状態を測るので'
      + '**この worker の中では走らせられない** (原文の道具へ移す先が無い)',
  },
  'src/main/__tests__/electronFuses.test.ts': {
    count: 1,
    why: 'ファイル局所の定数 CONFIG (electron-builder の設定) を読む。台帳の外のファイルで、書き換わらない',
  },
  'src/main/__tests__/exportSymlinkContainment.test.ts': {
    count: 1,
    why: 'その場で作った symlink の指す先 (一時ファイル) を読む。repo のファイルではないので原文へ戻す物が無い',
  },
  'src/shared/__tests__/dependencyAuditWorkflow.test.ts': {
    count: 1,
    why: '引数で受けた道 (.github/workflows/*.yml と package.json) を読む。どれも台帳の外で書き換わらない',
  },
  'src/shared/__tests__/dependencyOverrides.test.ts': {
    count: 1,
    why: '引数で受けた道 (package.json / package-lock.json) を読む。どちらも台帳の外で書き換わらない',
  },
  'src/shared/__tests__/linkRedirectGuard.test.ts': {
    count: 1,
    why: 'ファイル局所の定数 AUTOPILOT (scripts/ の .cjs) を読む。scripts/ は台帳の外で書き換わらない',
  },
  'src/shared/__tests__/ollamaSetup.test.ts': {
    count: 2,
    why: '一時ファイル (走らせた記録) と、ファイル局所の定数 SCRIPT (scripts/ の .sh) を読む。どちらも台帳の外',
  },
  'src/renderer/__tests__/tickSensitivityLedger.test.ts': {
    count: 1,
    why: 'この検査は `scripts/audit-tick-sensitivity.cjs` が「元へ戻したことを内容で確かめる」形を持つかを見るので、**その綴りを文字列として引用する** (読み戻した本文と控えを比べる形)。引用は文字列リテラルで走らない —— `verifySurvivors.test.ts` と同じ理由で、綴りを分割して走査を避けるより理由つきで載せる (パス 369)。**綴りは再現しない** —— この行はこの検査自身の本文なので、写すとこの検査の自己検査 (★ この検査自身は生の読みを 1 件も持たない) が偽になる (2026-09-25 · パス 462 の実測)',
  },
  'src/shared/__tests__/verifySurvivors.test.ts': {
    count: 1,
    why: 'この検査は `scripts/verify-survivors.cjs` が「原文へ戻したことを内容で確かめる」形を持つかを見るので、**その綴りを文字列として引用する** (原文へ戻した本文と控えを比べる形)。引用は文字列リテラルで走らない —— `fileReadSizeGateCensus.test.ts` と同じ理由で、綴りを分割して走査を避けるより理由つきで載せる (パス 356)。**綴りは再現しない** (同上)',
  },
  'src/shared/__tests__/scriptEmbedGate.test.ts': {
    count: 2,
    why: 'ファイル局所の定数 SCRIPTS (scripts/ ディレクトリ) を歩いて読む。scripts/ は台帳の外で書き換わらない',
  },
  'src/shared/__tests__/workflowShellAssumptions.test.ts': {
    count: 3,
    why: 'ファイル局所の定数 WORKFLOW_DIR (.github/workflows) を歩いて読む。台帳の外で書き換わらない',
  },

  /*
   * ここから下は 2026-09-15 (パス 269) に規則が非同期の綴りへ広がって見えるようになった 11 件。
   * **どれも自分が `mkdtemp` で作った一時ディレクトリの中を読み戻す**検査で、
   * repo のファイルを読んでいないので Stryker に書き換えられる物が無い
   * (1 件ずつ読んで確かめた。道は `dir` / `tmpDir` / `storePath()` / `result.path` のような
   * ファイル局所の値なので、機械には行き先が決められない = 規則 2 の担当)。
   */
  'src/main/__tests__/atomicWrite.test.ts': {
    count: 13,
    why: 'mkdtemp で作った一時ディレクトリに atomicWriteFile が書いた物 (本体と .prev) を読み戻す。repo のファイルではない',
  },
  'src/main/__tests__/secretsUnreadableWrite.test.ts': {
    count: 4,
    why: 'userData を差し替えた一時ディレクトリの secrets.json を読み戻す。repo のファイルではない',
  },
  'src/main/__tests__/secretsWrite.test.ts': {
    count: 5,
    why: '同じく一時 userData の secrets.json と .prev を読み戻す。repo のファイルではない',
  },
  'src/main/__tests__/stateWritePolicy.test.ts': {
    count: 3,
    why: '一時ディレクトリを歩き (readdir)、そこへ書いた状態ファイル (封緘済み talent.json) を 2 度読み戻す。どれも repo のファイルではない。**件数は 2026-09-25 (パス 462) に 1 → 3 へ実測で直した** —— 自前の注記除去が glob の `**` から始まる偽の注記で 71 行 (68〜139 行) を食っており、3 件のうち 2 件が台帳に載っていなかった',
  },
  'src/main/clients/__tests__/emotions.test.ts': {
    count: 10,
    why: '一時 userData の service-hub-emotions.json (封緘済み) を読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/exportPaths.test.ts': {
    count: 1,
    why: '一時 home に書き出した Markdown を読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/skills.test.ts': {
    count: 2,
    why: '一時ディレクトリに組んだ skill の SKILL.md を読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/stocks.test.ts': {
    count: 1,
    why: '一時 userData のウォッチリスト状態ファイルを読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/teamradar.realfs.test.ts': {
    count: 3,
    why: '一時 home に書き出した SVG と、封緘した状態ファイルを読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/teamradar.test.ts': {
    count: 1,
    why: '一時 userData の封緘済み状態ファイルを読み戻す。repo のファイルではない',
  },
  'src/main/clients/__tests__/templates.realfs.test.ts': {
    count: 1,
    why: '一時 home に書き出したテンプレートを読み戻す。repo のファイルではない',
  },
};

const ledger = mutateLedger();
const files = testFiles();
const relOf = (abs: string): string => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

/** その検査が台帳のファイルを原文で読んでいるか (repo 相対の道の一覧)。 */
function ledgerReads(abs: string, text: string): string[] {
  return rawReads(abs, text).targets.filter((rel) => ledger.has(rel));
}

describe('mutate 台帳のファイルを原文で読む検査は readOriginalSource を通す', () => {
  it('走査が生きている (台帳・検査ファイル・生の読み・原文の道具の 4 つに床)', () => {
    expect(ledger.size, 'stryker.config.json の mutate を読めていない').toBeGreaterThan(200);
    expect(files.length, '検査ファイルを集められていない').toBeGreaterThan(400);

    // 生の読みを道つきで呼んでいる検査 (実測 2026-09-10: 12 件。すべて文書・ワークフロー・
    // 資産・scripts/ を読む物で、規則の外)。**抽出器が死ぬとここが 0 になる** ——
    // 最初の版は引数を最初の `)` で切っていて 4 件しか拾えず、この床が教えてくれた。
    const readers = files.filter((f) => rawReads(f, readOriginalSource(f)).targets.length > 0);
    expect(readers.length, '生の読みが見つからない (抽出器の死)').toBeGreaterThanOrEqual(5);

    // 原文の道具を通している検査 (実測 2026-09-10: 60 件超)。**規則が実際に効いている**
    // ことの床で、違反 0 件という結果が「規則が適用されているから 0」だと言える。
    const converted = files.filter((f) =>
      /readOriginal(?:Source|Dir|DirEntries)\s*\(/.test(stripComments(readOriginalSource(f))),
    );
    expect(converted.length, '原文の道具を通す検査が無い (規則が死んでいる)').toBeGreaterThan(40);
  });

  it('★ 台帳のファイルを読む検査はすべて readOriginalSource を通している', () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relOf(abs);
      if (rel in ALLOWED) continue;
      // **判定は読みごと。** 最初の版は「ファイルがどこかで `readOriginalSource` に
      // 触れていれば全体を免除」にしていたが、それは別名や注記でも満たされ、
      // **同じファイルの中で 1 つだけ生で読む**形を見逃す。免除そのものが要らない ——
      // 抽出器は生の綴りしか拾わないので、原文の道具へ直した読みは初めから挙がらない。
      const reads = ledgerReads(abs, readOriginalSource(abs));
      if (reads.length === 0) continue;
      offenders.push(`${rel} → ${reads.join(' / ')}`);
    }
    expect(offenders, '台帳のファイルを生の読みで読んでいます').toEqual([]);
  });

  it('★ 道が読めない生の読みは、理由つきで台帳に載っている', () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relOf(abs);
      const { unresolved } = rawReads(abs, readOriginalSource(abs));
      const row = VARIABLE_PATH_ALLOWED[rel];
      if (unresolved === 0) {
        if (row !== undefined) offenders.push(`${rel}: 台帳に在るが読めない読みは 0 件 (台帳から消すこと)`);
        continue;
      }
      if (row === undefined) {
        offenders.push(`${rel}: 道が読めない生の読み ${unresolved} 件 — 原文の道具へ直すか、理由つきで台帳へ`);
        continue;
      }
      if (row.count !== unresolved) {
        offenders.push(`${rel}: 台帳は ${row.count} 件だが実測 ${unresolved} 件`);
      }
    }
    expect(offenders, '道が読めない生の読みが台帳と合っていません').toEqual([]);
  });

  it('規則 2 の台帳にはすべて理由がある', () => {
    expect(Object.keys(VARIABLE_PATH_ALLOWED).length, '台帳が空 (規則が死んでいる)').toBeGreaterThan(5);
    for (const [file, row] of Object.entries(VARIABLE_PATH_ALLOWED)) {
      expect(row.why.trim().length, `${file} の理由が短い`).toBeGreaterThan(20);
      expect(row.count, `${file} の件数が 0 以下`).toBeGreaterThan(0);
    }
  });

  it('台帳の除外は実在する検査を指している (掃除)', () => {
    const known = new Set(files.map((f) => relOf(f)));
    for (const file of [...Object.keys(ALLOWED), ...Object.keys(VARIABLE_PATH_ALLOWED)]) {
      expect(known.has(file), `${file} は実在しません — 台帳から消すこと`).toBe(true);
    }
  });

  /*
   * **対照。** 規則が実際に当たることを、合成の標本で確かめる
   * (実物が 0 件のときに空の検査にならないため)。
   */
  describe('対照 — 規則が当たる標本と、当たらない標本', () => {
    const inLedger = [...ledger][0]!;
    const fake = path.join(REPO_ROOT, 'src/shared/__tests__/fake.test.ts');
    const up = path.relative(path.dirname(fake), path.join(REPO_ROOT, inLedger)).split(path.sep).join('/');

    it('★ 台帳のファイルを new URL + 生の読みで読む形を拾う', () => {
      const text = `const S = ${READ}(new URL('${up}', import.meta.url), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([inLedger]);
    });

    it('★ join(REPO_ROOT, …) の形も拾う', () => {
      const text = `const S = ${READ}(path.join(REPO_ROOT, '${inLedger}'), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([inLedger]);
    });

    it('★ 多段の join(REPO_ROOT, …) も 1 本の道として読む', () => {
      const segs = inLedger.split('/');
      const quoted = segs.map((s) => `'${s}'`).join(', ');
      const text = `const S = ${READ}(path.join(REPO_ROOT, ${quoted}), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([inLedger]);
    });

    it('★ resolve(__dirname, …) の形も拾う — 最初に見落とした形', () => {
      const text = `const S = ${READ}(path.resolve(__dirname, '${up}'), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([inLedger]);
    });

    /*
     * **非同期の綴り** (パス 269 で網に入れた)。同期の綴りしか見ていなかった間、
     * この形は規則 1 の外に在り、台帳のファイルに対する「無いこと」の主張が
     * 黙って空の検査になっていた (`assistantTurnsParity.test.ts` に実在した 1 件)。
     */
    it('★ 台帳のファイルを非同期の readFile で読む形も拾う (2026-09-15 に網へ入れた)', () => {
      const text = `const S = await ${READ_ASYNC}(new URL('${up}', import.meta.url), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([inLedger]);
    });

    it('★ 同期の綴りも同じ 1 件として拾う (Sync を省略可にして二重に数えていない)', () => {
      const text = `const S = ${READ}(new URL('${up}', import.meta.url), 'utf8');`;
      const r = rawReads(fake, text);
      expect(r.targets).toEqual([inLedger]);
      expect(r.targets.length + r.unresolved, '1 件の読みを 2 件に数えている').toBe(1);
    });

    it('★ 非同期で道が変数なら「読めない 1 件」に数える (一時ファイルの読み戻し)', () => {
      const r = rawReads(fake, `const S = await ${READ_ASYNC}(target, 'utf8');`);
      expect(r.targets).toEqual([]);
      expect(r.unresolved).toBe(1);
    });

    it('原文の道具 (readOriginalSource) は生の読みとして拾わない', () => {
      const r = rawReads(fake, `const S = readOriginalSource(path.join(REPO_ROOT, '${inLedger}'));`);
      expect(r.targets).toEqual([]);
      expect(r.unresolved).toBe(0);
    });

    it('台帳に無いファイル (文書) は拾わない', () => {
      const text = `const D = ${READ}(path.join(REPO_ROOT, 'docs/DATA_PROTECTION.md'), 'utf8');`;
      expect(ledgerReads(fake, text)).toEqual([]);
    });

    it('注記の中の綴りは拾わない', () => {
      const text = `// const S = ${READ}(path.join(REPO_ROOT, '${inLedger}'), 'utf8');\nconst x = 1;`;
      expect(ledgerReads(fake, text)).toEqual([]);
    });

    it('ブロック注記の中も拾わない', () => {
      const text = `/* ${READ}(path.join(REPO_ROOT, '${inLedger}')) */\nconst x = 1;`;
      expect(ledgerReads(fake, text)).toEqual([]);
    });

    it('★ 道が変数なら「読めない 1 件」に数える (規則 2 が受け持つ)', () => {
      const r = rawReads(fake, `const S = ${READ}(path.join(REPO_ROOT, rel));`);
      expect(r.targets).toEqual([]);
      expect(r.unresolved).toBe(1);
    });

    it('★ ファイル局所の定数を歩く形も「読めない」に数える', () => {
      const r = rawReads(fake, `for (const n of ${READDIR}(SCRIPTS)) { void n; }`);
      expect(r.targets).toEqual([]);
      expect(r.unresolved).toBe(1);
    });

    it('道が読めた読みは「読めない」に数えない', () => {
      const r = rawReads(fake, `const S = ${READ}(path.join(REPO_ROOT, 'docs/SECURITY.md'), 'utf8');`);
      expect(r.targets).toEqual(['docs/SECURITY.md']);
      expect(r.unresolved).toBe(0);
    });

    it('★ この検査自身は生の読みを 1 件も持たない (標本は綴りを割って組み立てている)', () => {
      const self = readOriginalSource(path.join(REPO_ROOT, 'src/shared/__tests__/originalSourcePolicy.test.ts'));
      expect(stripComments(self).match(RAW_READ), '標本の綴りが本文に露出している').toBeNull();
    });
  });
});
