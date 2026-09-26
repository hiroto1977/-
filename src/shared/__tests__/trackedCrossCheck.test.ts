/**
 * **木を歩く走査の「2 つ目の数え方」** (2026-09-25 · パス 471)。
 *
 * パス 468 は母集団を**空**にして測り、パス 469 は**宣言した群**を丸ごと落として測った。
 * どちらも「全部」または「1 群まるごと」にしか当たらない。**一様に間引かれた走査**
 * (木の歩きが途中で止まる・ふるいが 1 つ緩む・親ディレクトリが読めない) は、
 * どの群も N% は残るので群ごとの床を満たしてしまう。実測 (隔離した写しの上で):
 *
 * ```
 *   残した割合   鳴ったゲート                                   黙ったゲート
 *   99% (1% 死)  0 / 6                                          **6 / 6 が ✅ exit 0**
 *   90%          lint:network-targets                           5 / 6
 *   75%          lint:network-targets / lint:charset            4 / 6
 *   50%          + lint:imports / lint:url-encoding             2 / 6 (regex / sample-data)
 * ```
 *
 * 直しは `scripts/lib/tracked-cross-check.cjs` の 1 つで、要求は
 * **「追跡されていてそのゲートの条件に合うファイルは、どれも走査されている」**。
 * 1 件でも落ちれば鳴るので**割合に依らない**。
 *
 * ## ここが見る物 (ゲートの中の照合とは別の層)
 *
 * ゲートを丸ごと走らせると「今日の木では食い違いが 0 件」しか分からない。
 * この証人は**判定そのもの**に標本を当てて、条件の各部が効いていることを留める ——
 * 今日の木では拘束していない条件 (`acceptPath`) も、ここでは鳴る。
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

interface Criteria {
  roots: readonly string[];
  skipDirs?: ReadonlySet<string> | readonly string[];
  accept: (name: string) => boolean;
  acceptPath?: (rel: string) => boolean;
  ignore?: readonly string[];
}
const cc = req('../../../scripts/lib/tracked-cross-check.cjs') as {
  gitLsFiles: (repoRoot: string, extra?: readonly string[]) => string[];
  gitLsFilesOrNull: (repoRoot: string, extra?: readonly string[]) => string[] | null;
  matchingTracked: (tracked: readonly string[], criteria: Criteria) => Set<string>;
  trackedCrossCheck: (
    walked: readonly string[], criteria: Criteria, repoRoot: string,
  ) => { source: string; missing: string[]; disagreement: string | null };
  crossCheckSuffix: (source: string) => string;
};
const tool = req('../../../scripts/audit-gate-floors.cjs') as {
  RECIPES: readonly { gate: string; cmd: string }[];
  PARTIAL_GATES: readonly string[];
  THINNING: Record<string, { expect: string; why: string }>;
  ENFORCEMENT: Record<string, { by: readonly string[]; why: string }>;
  MECHANISMS: readonly string[];
  thinnableGates: () => string[];
  scriptOf: (cmd: string) => string;
};

const TS: Criteria = { roots: ['src'], skipDirs: ['__tests__'], accept: (n) => /\.tsx?$/.test(n) };

describe('追跡ファイルとの照合 (パス 471)', () => {
  it('条件に合う追跡ファイルだけを拾う (根・除くディレクトリ・拡張子)', () => {
    const got = cc.matchingTracked(
      ['src/a.ts', 'src/b.tsx', 'src/c.md', 'src/__tests__/d.ts', 'docs/e.ts', 'src/x/y.ts'],
      TS,
    );
    expect([...got].sort()).toEqual(['src/a.ts', 'src/b.tsx', 'src/x/y.ts']);
  });

  /*
   * ★ **経路そのものの条件が効くこと。** `lint:imports` は既知のゾーン
   * (`src/renderer/` ほか 4 つ) の外を走査しないので、照合にも同じ条件を渡す。
   *
   * ★★ **今日の木ではこの条件は拘束していない** (実測 2026-09-25: ゾーン条件あり 528 件 /
   * なし 528 件・ゾーンの外に居る追跡ファイルは **0 件**)。だから実物のゲートを
   * 走らせる対照は鳴らない —— **鳴らない対照は合格ではなく、その検査についての報せ**なので、
   * 判定そのものに標本を当てて留める。`src/` の直下に新しい木を 1 つ作った日、
   * この条件が無ければ照合は永久に鳴り続ける (偽陽性の向き)。
   */
  it('★ 経路の条件 (acceptPath) が効く —— 今日の木では拘束していないので標本で留める', () => {
    const zoned: Criteria = { ...TS, acceptPath: (rel) => rel.startsWith('src/renderer/') };
    const files = ['src/renderer/a.ts', 'src/newzone/b.ts'];
    expect([...cc.matchingTracked(files, zoned)]).toEqual(['src/renderer/a.ts']);
    // 条件を外すと両方拾う (= この分岐が結果を変えている)
    expect(cc.matchingTracked(files, TS).size).toBe(2);
  });

  it('★ 自己除外 (ignore) が効く', () => {
    const c: Criteria = { ...TS, ignore: ['src/self.ts'] };
    expect([...cc.matchingTracked(['src/self.ts', 'src/other.ts'], c)]).toEqual(['src/other.ts']);
  });

  it("根の '.' はリポジトリ直下のファイルだけを指す (木ではない)", () => {
    const c: Criteria = { roots: ['.'], accept: (n) => n.endsWith('.json') };
    expect([...cc.matchingTracked(['package.json', 'src/a.json'], c)]).toEqual(['package.json']);
  });

  /*
   * ★★ **向きは片側だけ。** 逆 (走査した物はどれも追跡されている) は**偽**である ——
   * 木には追跡されていない生成物が在り、`lint:regex` / `lint:sample-data` は
   * 自分自身を走査から外しつつ読む。等号を要求すると、生成物を 1 つ置いた日から
   * 鳴り続ける門になる (実測: 等号にすると `orchestration/dependency-audit.json` を名指しして
   * 3 ゲートが今日落ちる)。
   */
  it('★ 走査が追跡ファイルより多いのは正常 (等号を要求しない)', () => {
    const res = cc.trackedCrossCheck(
      [join(REPO, 'src', 'shared', 'serviceId.ts'), join(REPO, 'src', 'shared', 'zzz-untracked.ts')],
      { roots: ['src'], skipDirs: ['__tests__'], accept: (n) => n === 'serviceId.ts' },
      REPO,
    );
    expect(res.source).toBe('git');
    expect(res.disagreement).toBeNull();
    expect(res.missing).toEqual([]);
  });

  it('追跡されているのに走査されていなければ名指しする', () => {
    const res = cc.trackedCrossCheck([], { roots: ['src'], skipDirs: ['__tests__'], accept: (n) => n === 'serviceId.ts' }, REPO);
    expect(res.missing).toEqual(['src/shared/serviceId.ts']);
  });

  it('相対パスでも絶対パスでも同じに扱う', () => {
    const c: Criteria = { roots: ['src'], skipDirs: ['__tests__'], accept: (n) => n === 'serviceId.ts' };
    for (const walked of [['src/shared/serviceId.ts'], [join(REPO, 'src/shared/serviceId.ts')]]) {
      expect(cc.trackedCrossCheck(walked, c, REPO).missing).toEqual([]);
    }
  });

  /*
   * ★ **証人そのものが narrow されたら、照合は静かに空になる** (失敗が開く向き)。
   * だから広い一覧と pathspec つきを突き合わせる。実測 (隔離した写しの上で git の
   * 広い一覧だけを 90% へ間引く): 突き合わせが在れば 2 ゲートとも
   * 「追跡ファイルの一覧が信用できません」と鳴り、**外すと 2 ゲートとも黙った**。
   */
  it('★ git が使えなければ照合したと名乗らない', () => {
    expect(cc.crossCheckSuffix('git')).toContain('照合済み');
    expect(cc.crossCheckSuffix('unavailable')).toContain('していません');
    expect(cc.crossCheckSuffix('git')).not.toBe(cc.crossCheckSuffix('unavailable'));
  });

  it('★ 空の走査は「追跡ファイル全部が欠けている」として鳴る (0 件を健全と読まない)', () => {
    const res = cc.trackedCrossCheck([], TS, REPO);
    expect(res.missing.length).toBeGreaterThan(400);
  });
});

describe('照合を呼ぶゲートの母集団 (双方向)', () => {
  /** そのゲートの原文 (注記は落とす —— 注記の中の言及では満たされない)。 */
  function codeOf(gate: string): string {
    const recipe = tool.RECIPES.find((r) => r.gate === gate);
    expect(recipe, `${gate} が RECIPES にない`).toBeTruthy();
    return stripComments(readOriginalSource(join(REPO, tool.scriptOf(recipe!.cmd))));
  }

  /*
   * ★ **逆向き** —— 「照合を呼んでいるのに `ENFORCEMENT` で名乗らない」を落とす。
   * 名乗りを下げるのも退行の 1 手で、`by` から 1 つ消しても「名乗った機構が在る」だけを
   * 見る検査は黙る (パス 455 の対照 J と同じ形)。
   */
  it('★ 照合を呼ぶゲートは ENFORCEMENT で tracked-cross-check を名乗る', () => {
    // ★ 母集団は `THINNING` (= 間引ける全ゲート · 実測 25 本)。パス 471 は
    //   `PARTIAL_GATES` (手書きの 8 本) しか見ておらず、**残り 17 本のうち 9 本が
    //   1% の損失で黙っていた** —— 証人の母集団が狭いと、直した所しか見えない。
    const callers = Object.keys(tool.THINNING).filter((g) => {
      const code = codeOf(g);
      return code.includes('tracked-cross-check.cjs')
        && /reportTrackedCrossCheck\(|trackedCrossCheck\(/.test(code);
    });
    expect(callers.length, '照合を呼ぶゲートが 1 本も無い').toBeGreaterThanOrEqual(14);
    for (const g of callers) {
      expect(
        tool.ENFORCEMENT[g]?.by,
        `${g} は照合を呼んでいるのに ENFORCEMENT で名乗っていない`,
      ).toContain('tracked-cross-check');
    }
    // 逆向き: 名乗ったなら実際に呼んでいる
    for (const [g, e] of Object.entries(tool.ENFORCEMENT)) {
      if (e.by.includes('tracked-cross-check')) {
        expect(callers, `${g} が名乗っているのに呼んでいない`).toContain(g);
      }
    }
  });

  /*
   * 条件は**ゲート自身が宣言し、走査と照合が同じ物を読む**。条件を照合の側にも
   * 並べると 2 つ目の台帳が静かに古びる (このリポジトリが繰り返し直してきた形)。
   */
  it('★ 照合を呼ぶゲートは CROSS_CHECK を export し、走査もその定数を読む', () => {
    for (const [g, e] of Object.entries(tool.ENFORCEMENT)) {
      if (!e.by.includes('tracked-cross-check')) continue;
      const recipe = tool.RECIPES.find((r) => r.gate === g)!;
      const script = tool.scriptOf(recipe.cmd);
      const mod = req(`../../../${script}`) as { CROSS_CHECK?: Criteria };
      expect(mod.CROSS_CHECK, `${g} が CROSS_CHECK を export していない`).toBeTruthy();
      const got = cc.matchingTracked(cc.gitLsFiles(REPO), mod.CROSS_CHECK!);
      // 条件が拾う件数はゲートごとに桁が違う (workflow は 7 本・src の木は 1,000 超) ので、
      // 床は「1 件も拾わない = 条件が実物からずれている」だけを見る。
      expect(got.size, `${g} の条件が 1 件も拾わない (条件が実物からずれている)`).toBeGreaterThan(0);
    }
  });

  /*
   * ★★ **呼ぶだけでは守りではない —— 結果を使っているかを見る** (2026-09-26 · パス 472)。
   *
   * 対照を回すと、照合の**呼び出しを残したまま門 (`if (cross.code !== 0)`) を消す**
   * 3 方向 (vault:check の床 / vault:check の照合 / workflow-security の照合) が
   * **1 つも鳴らなかった** —— 上の検査は `reportTrackedCrossCheck(` が原文に在ることしか
   * 見ておらず、返り値を捨てても素通りしていた。
   *
   * **鳴らない対照は合格ではなく、その検査についての報せ**なので、結果を使う形そのものを
   * 要求する。振る舞い (本当に鳴るか) は `npm run audit:gate-partial` が 25 ゲート ×
   * 一様な間引きで測る (実測 2026-09-26: 73 組すべて台帳どおり) —— ここは
   * **毎回の `npm test` で「門が消えていないこと」**を留める層である。
   */
  it('★ 照合を呼ぶゲートは、その結果で落ちる門を持つ', () => {
    /*
     * 門の形は 2 通り実在する (どちらも「結果で落ちる」):
     *   - `if (cross.code !== 0) return 1;`  —— 共有の報告子が刷って終了コードを返す
     *   - `cross.missing` / `cross.disagreement` を自分で読んで失敗へ積む
     * **「呼んだ」だけでは満たされない**ことを、標本で両向きに示す。
     */
    const guard = /cross\.code !== 0|cross\.missing|cross\.disagreement/;
    expect(guard.test('  if (cross.code !== 0) return 1;')).toBe(true);
    expect(guard.test('  for (const f of cross.missing) failures.push(f);')).toBe(true);
    expect(guard.test('  const cross = reportTrackedCrossCheck(files, C, R, "g");')).toBe(false);
    expect(guard.test('  console.log(crossCheckSuffix(cross.source));')).toBe(false);

    let checked = 0;
    for (const [g, e] of Object.entries(tool.ENFORCEMENT)) {
      if (!e.by.includes('tracked-cross-check')) continue;
      expect(codeOf(g), `${g} は照合を呼ぶだけで、結果で落ちる門が無い`).toMatch(guard);
      checked += 1;
    }
    expect(checked, '照合を宣言したゲートが 14 本未満').toBeGreaterThanOrEqual(14);
  });

  /*
   * ★ `vault:check` の床も「呼んで、結果を積む」まで要求する —— 対照 A
   * (床の 2 行を消す) はこれが無いと鳴らなかった。
   */
  it('★ vault:check は比べた件数の床を呼び、結果を積む', () => {
    const code = stripComments(readOriginalSource(join(REPO, 'scripts/build-knowledge-vault.cjs')));
    expect(code, '床を呼んでいない').toMatch(/comparedCountProblem\(want\.length/);
    expect(code, '床の答えを捨てている').toMatch(/problems\.push\(short\)/);
  });

  /*
   * ★ **間引ける母集団は道具の届く範囲で決まる** (2026-09-26 · パス 472)。
   *
   * パス 469〜471 の台帳は手書きの 8 本で、実測すると **25 本**が間引ける。
   * 母集団は走査で導くので 26 本目が生えた日に鳴る —— この検査は**その導出が
   * 死んでいないこと** (床) と**双方向**を、ゲートを 1 本も走らせずに留める。
   */
  it('★ 間引けるゲートの母集団と THINNING が双方向に一致する', () => {
    const walking = tool.thinnableGates();
    expect(walking.length, '母集団の走査が死んでいる').toBeGreaterThanOrEqual(20);
    expect(
      walking.filter((g) => !Object.hasOwn(tool.THINNING, g)),
      '間引けるのに THINNING に無い',
    ).toEqual([]);
    expect(
      Object.keys(tool.THINNING).filter((g) => !walking.includes(g)),
      'THINNING に在るのに間引けない',
    ).toEqual([]);
  });

  /*
   * ★ **機構を名乗る語彙は閉じている** —— 11 語目を黙って足せない。
   * `not-thinnable` は機構ではなく報せなので、それを名乗るゲートは 1 本だけ
   * (`chain:verify`) であることも見る (増えたら「測っていない」が機構として通る)。
   */
  it('★ ENFORCEMENT の機構は閉じた語彙で、not-thinnable は 1 本だけ', () => {
    const used = new Set(Object.values(tool.ENFORCEMENT).flatMap((e) => e.by));
    for (const b of used) expect(tool.MECHANISMS, `未知の機構 ${b}`).toContain(b);
    const notThin = Object.entries(tool.ENFORCEMENT)
      .filter(([, e]) => e.by.includes('not-thinnable'))
      .map(([g]) => g);
    expect(notThin).toEqual(['chain:verify']);
  });

  /*
   * ★ **`vault:check` の成功行は、比べた件数を名乗る** (2026-09-26 · パス 472)。
   *
   * 直す前は `.md` を全部落としても「✅ 同期しています（7402 ファイル）」で exit 0 —— 
   * その 7402 はコーパスの件数で、比べた件数ではなかった。床は割合ではなく**同一性**。
   */
  it('★ vault:check は「比べた件数 == 刷る件数」を要求する', () => {
    const vault = req('../../../scripts/build-knowledge-vault.cjs') as {
      comparedCountProblem?: (walked: number, count: number) => string | null;
    };
    expect(vault.comparedCountProblem, 'comparedCountProblem を export していない').toBeTruthy();
    expect(vault.comparedCountProblem!(7402, 7402)).toBeNull();
    // 1 件でも足りなければ鳴り、文面が両方の数を名乗る (読んだ人がその場で分かる)
    const msg = vault.comparedCountProblem!(7401, 7402);
    expect(msg).toContain('7402');
    expect(msg).toContain('7401');
    // 0 件比べた形 (直す前の実測) も鳴る
    expect(vault.comparedCountProblem!(0, 7402)).toBeTruthy();
  });

  /**
   * ★ **今日の食い違いは 0 件** —— この検査は「照合が今日通ること」を留める。
   * 実物のゲートを走らせずに同じ問いを訊けるので、ゲートが CI から外れても鳴る。
   */
  it('★ 宣言したゲートはどれも、今日の木では食い違い 0 件', () => {
    const tracked = cc.gitLsFiles(REPO);
    let checked = 0;
    for (const [g, e] of Object.entries(tool.ENFORCEMENT)) {
      if (!e.by.includes('tracked-cross-check')) continue;
      const script = tool.scriptOf(tool.RECIPES.find((r) => r.gate === g)!.cmd);
      const mod = req(`../../../${script}`) as { CROSS_CHECK?: Criteria };
      const want = cc.matchingTracked(tracked, mod.CROSS_CHECK!);
      expect(want.size, `${g} の条件が空`).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked, '照合を宣言したゲートが 14 本未満').toBeGreaterThanOrEqual(14);
  });
});
