/**
 * **追跡ファイルの母集団は、本当に「追跡ファイル全部」か** (2026-09-25 · パス 470)。
 *
 * `verify:all` の 37 ゲートのうち 2 本は母集団を `readdirSync` で歩かず、
 * `git ls-files` の出力を使う (`lint:shell` / `lint:repo-size`)。パス 469 の前置きは
 * `readdirSync` しか包まなかったので、この 2 本は**走査が一部だけ死んだときの振る舞いを
 * 1 度も測られていなかった**。パス 470 で前置きが `child_process` も包み、実測したら:
 *
 * ```
 *   lint:repo-size  root:knowledge-vault (7,402 件) を一覧から落とす → ✅ exit 0
 *                   ── 12.40 MB の生成物を追跡させた木でも「合計 47.1 MB ✅ 予算内」。
 *                      95% の警告まで消える (落ちた分は合計から引かれるので**より安心に見える**)
 *   lint:shell      一覧から `.sh` を全部落とす → ✅ exit 0「Checked 9 (追跡ファイル全体から収集)」
 *                   ── フォールバックが `scripts/` 直下から**詰め直していた**。
 *                      成功行そのものが偽で、件数も素の木と同じなので見分けが付かない
 *   lint:shell      一覧から 1 本 (`tools/deploy.sh`) を落とす → ✅ exit 0「Checked 9」
 *                   ── その 1 本は strict mode 無し + `curl … | sh` + `dd of=/dev/sda` を持っていた
 * ```
 *
 * ## ここが見る物 (門の中の検査とは別の層)
 *
 * ゲートの中の `crossCheckProblem` は「権威 (git) に 2 度訊いて食い違いを見る」。
 * **それが捕まえられないのは「両方の呼び出しを同時に narrow する編集」と
 * 「その検査そのものを消す編集」**で、この証人がそこを見る —— 追跡一覧を*この検査が*
 * 独立に数え、ゲートの母集団と双方向に突き合わせる。
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);
/** 定期点検の道具の前置き (走査を「一部だけ」殺す)。2 つ目を作らずこれを借りる。 */
const PREAMBLE = join(REPO, 'scripts', 'lib', 'partial-scan-preamble.cjs');

const shell = req('../../../scripts/lint-shell.cjs') as {
  shellFiles: () => string[];
  shellFilesWithSource: () => { source: string; files: string[]; witness: string[] | null };
  crossCheckProblem: (p: { source: string; files: string[]; witness: string[] | null }) => string | null;
  summaryLine: (count: number, source: string, selfTested: number) => string;
};
const repoSize = req('../../../scripts/lint-repo-size.cjs') as {
  trackedFiles: () => { files: { rel: string; size: number }[]; raw: string[] };
  crossCheckProblem: (raw: readonly string[]) => string | null;
};

/** この検査が**自分で**数える追跡一覧 (ゲートの実装を借りない)。 */
function tracked(pathspec: readonly string[] = []): string[] {
  const out = execFileSync('git', ['-C', REPO, 'ls-files', '-z', ...pathspec], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter((f) => f.length > 0).sort();
}

describe('lint:shell の母集団 (外側の証人)', () => {
  const population = shell.shellFilesWithSource();

  it('★ 出どころは git である (フォールバックで走っていない)', () => {
    expect(population.source, 'この木には git が在るのでフォールバックは通らない').toBe('git');
  });

  it('★ 母集団は「追跡されている .sh 全部」と双方向に一致する', () => {
    const mine = tracked().filter((f) => f.endsWith('.sh'));
    expect(mine.length, '追跡された .sh が 3 本未満 —— 走査が壊れている').toBeGreaterThanOrEqual(3);
    expect([...population.files].sort(), 'ゲートの母集団が実物とずれている').toEqual(mine);
  });

  it('★ shellFiles() は同じ答えを返す (別名が別の物を数えていない)', () => {
    expect([...shell.shellFiles()].sort()).toEqual([...population.files].sort());
  });

  it('★ 実物では食い違いが無い (偽陽性を出さない)', () => {
    expect(shell.crossCheckProblem(population)).toBeNull();
  });

  it('★ 1 本抜けたら鳴り、その名前を言う', () => {
    const dropped = population.files[0]!;
    const problem = shell.crossCheckProblem({ ...population, files: population.files.slice(1) });
    expect(problem, '1 本落ちても黙っている').not.toBeNull();
    expect(problem!, '落ちた本を名指ししていない').toContain(dropped);
  });

  it('★ git に無い物が混ざっても鳴る (逆向き)', () => {
    const problem = shell.crossCheckProblem({
      ...population,
      files: [...population.files, 'nowhere/ghost.sh'],
    });
    expect(problem).not.toBeNull();
    expect(problem!).toContain('nowhere/ghost.sh');
  });

  it('★ 2 度目を訊けなければ鳴る (fail closed)', () => {
    expect(shell.crossCheckProblem({ ...population, witness: null })).not.toBeNull();
  });

  it('★ フォールバックで走ったときは照合しない (2 度目が無いので比べる相手がいない)', () => {
    expect(shell.crossCheckProblem({ source: 'scripts-dir', files: [], witness: null })).toBeNull();
  });

  /*
   * ★ **フォールバックは「git が使えない」ときだけ。**
   *
   * 直す前は「git の一覧に `.sh` が 1 件も無ければ落ちる」形で、それは
   * 「git が居ない」と「一覧が narrow された」を見分けられなかった。PATH を空にした
   * 子プロセスで実際に走らせて、出どころが変わることを見る (この worker の env は触らない)。
   */
  it('★ git が使えないときだけ scripts/ 直下へ落ちる', () => {
    const code = `
      const m = require(${JSON.stringify(join(REPO, 'scripts', 'lint-shell.cjs'))});
      console.log(JSON.stringify(m.shellFilesWithSource().source));
    `;
    const withGit = execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim();
    const withoutGit = execFileSync(process.execPath, ['-e', code], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    }).trim();
    expect(withGit, 'git が在るのに落ちている').toBe('"git"');
    expect(withoutGit, 'git が無いのに落ちていない').toBe('"scripts-dir"');
  });

  /*
   * ★★ **一覧が narrow されたとき、フォールバックが詰め直さない。**
   *
   * ここがこのパスで閉じた本体である。直す前の引き金は「git の一覧に `.sh` が 1 件も
   * 無ければ `scripts/` 直下へ落ちる」で、**「git が居ない」と「一覧が narrow された」を
   * 見分けられなかった**。この木には `.sh` が 9 本あるので、上の「PATH を空にする」検査では
   * この違いが**出ない** —— 実測 (対照 A を植えて 15 件すべて緑だった) でそう分かった。
   * **鳴らない対照は合格ではなく、その検査についての報せである。**
   *
   * 見分けるには「git の一覧だけを間引く」必要がある。定期点検の道具の前置き
   * (`audit:gate-partial` が使う物) がその形を持っているので、それを借りる ——
   * 新しい仕掛けを 2 つ目に作らない。
   */
  it('★ 一覧から .sh が落ちたら空を返す (scripts/ から詰め直さない)', () => {
    const code = `
      const m = require(${JSON.stringify(join(REPO, 'scripts', 'lint-shell.cjs'))});
      const p = m.shellFilesWithSource();
      console.log(JSON.stringify({ source: p.source, n: p.files.length }));
    `;
    const out = execFileSync(process.execPath, ['-r', PREAMBLE, '-e', code], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_PARTIAL_MODE: 'ext',
        AUDIT_PARTIAL_ARG: '.sh',
        AUDIT_PARTIAL_TARGET: 'git', // 木は無傷・git の一覧だけを殺す
      },
    }).trim();
    expect(JSON.parse(out), 'フォールバックが scripts/ 直下から詰め直している').toEqual({
      source: 'git',
      n: 0,
    });
  });

  /*
   * ★ **針が的に当たる標本** —— 上の細工が本当に効いていること (木は生きたまま
   * git の一覧だけが死ぶ)。効いていなければ上の検査は「何もしていない」ので通る。
   */
  it('★ 細工は git の一覧だけを殺す (木は無傷)', () => {
    const code = `
      const fs = require('node:fs');
      const cp = require('node:child_process');
      const git = cp.execFileSync('git', ['-C', ${JSON.stringify(REPO)}, 'ls-files', '-z'], { encoding: 'utf8' })
        .split(String.fromCharCode(0)).filter((x) => x.endsWith('.sh')).length;
      const tree = fs.readdirSync(${JSON.stringify(join(REPO, 'scripts'))}).filter((f) => f.endsWith('.sh')).length;
      console.log(JSON.stringify({ git, tree }));
    `;
    const out = execFileSync(process.execPath, ['-r', PREAMBLE, '-e', code], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_PARTIAL_MODE: 'ext',
        AUDIT_PARTIAL_ARG: '.sh',
        AUDIT_PARTIAL_TARGET: 'git',
      },
    }).trim();
    const seen = JSON.parse(out) as { git: number; tree: number };
    expect(seen.git, 'git の一覧が殺せていない').toBe(0);
    expect(seen.tree, '木まで殺している (フォールバックの検査が空になる)').toBeGreaterThanOrEqual(3);
  });

  /*
   * ★ **成功行は、実際に使った出どころを名乗る。**
   *
   * 直す前は出どころに関わらず「(追跡ファイル全体から収集)」と刷っていた ——
   * フォールバックで走った回も同じ文・同じ件数なので、読んだ人には走査範囲が
   * 縮んだことが見分けられなかった。針が的に当たることを、直す前の文で示す。
   */
  it('★ 出どころごとに違う主張になる', () => {
    const OLD_CLAIM = '追跡ファイル全体から収集';
    const gitLine = shell.summaryLine(9, 'git', 3);
    const fallbackLine = shell.summaryLine(9, 'scripts-dir', 3);
    expect(gitLine, '出どころで文が変わらない').not.toBe(fallbackLine);
    expect(gitLine).toContain('git ls-files');
    expect(fallbackLine).toContain('scripts/');
    expect(fallbackLine, 'フォールバックが全件を名乗っている').not.toContain(OLD_CLAIM);
    // 針の確認: この綴りは実際に当たる (直す前の文はここで鳴る)。
    expect(`Checked 9 shell script(s) (${OLD_CLAIM})`).toContain(OLD_CLAIM);
  });
});

describe('lint:repo-size の母集団 (外側の証人)', () => {
  const { files, raw } = repoSize.trackedFiles();

  it('★ 生の一覧は追跡ファイル全部と双方向に一致する', () => {
    const mine = tracked();
    expect(mine.length, '追跡ファイルが 1000 件未満 —— 走査が壊れている').toBeGreaterThanOrEqual(1000);
    expect([...raw].sort(), 'ゲートの母集団が実物とずれている').toEqual(mine);
  });

  it('★ 大きさを測る側は生の一覧の部分集合 (非ファイルを飛ばすだけ)', () => {
    const rawSet = new Set(raw);
    for (const f of files) expect(rawSet.has(f.rel), `${f.rel} が生の一覧に無い`).toBe(true);
    expect(files.length).toBeLessThanOrEqual(raw.length);
  });

  it('★ 実物では食い違いが無い (偽陽性を出さない)', () => {
    expect(repoSize.crossCheckProblem(raw)).toBeNull();
  });

  /*
   * ★ **割合に依らない。** 合計の床 (MIN_TRACKED_FILES 1000) は実測 9,084 の 11% に在るので、
   * 一部の死には当たらない —— 実測で 80% を落としても exit 0 だった。権威との照合は
   * 1 件でも鳴る。
   */
  it('★ どの割合で間引いても鳴る (1 件・半分・99%)', () => {
    for (const keep of [raw.length - 1, Math.floor(raw.length / 2), Math.floor(raw.length * 0.99)]) {
      const problem = repoSize.crossCheckProblem(raw.slice(0, keep));
      expect(problem, `${raw.length - keep} 件落としても黙っている`).not.toBeNull();
      expect(problem!, '件数を名乗っていない').toContain(String(raw.length));
    }
  });

  it('★ 根が 1 つ丸ごと落ちても鳴る (実測で 7,402 件が黙っていた形)', () => {
    const withoutVault = raw.filter((f) => !f.startsWith('knowledge-vault/'));
    expect(raw.length - withoutVault.length, '標本が的に当たっていない').toBeGreaterThan(1000);
    expect(repoSize.crossCheckProblem(withoutVault)).not.toBeNull();
  });
});
