/**
 * **空にすると消える検査には床を置く —— ただし正当に 0 になる母集団には置かない**
 * (2026-09-25 · パス 467)。
 *
 * ## 見つけた物 (実測)
 *
 * `verify:orchestration` は同じ家系を 2 度直している —— 2026-08-22 に `org` を、
 * 同じ日に `policy.cycles` を「鍵を必須にする」で閉じた。どちらも**キーを消すと
 * 不変条件が丸ごと検査対象外になる**形で、ゲートの docblock に対照実験まで
 * 書いてある。ところが**配列を空にする**側は残っていた。実測 (2026-09-25 ·
 * 実物の `orchestration/registry.json` を 1 か所ずつ壊して門を叩く):
 *
 * | 壊し方 | exit | 何が起きたか |
 * | --- | ---: | --- |
 * | `rounds: []` | **0** | 「rounds: 0 / 直近 round 0 は 0 チーム」と刷って ✅ |
 * | `policy.minTeamsForRound: []` | **0** | 最低チーム数 (不変条件 3) が消えて ✅ |
 * | `org.secretaries` を消す | **0** | 「秘書室 0室(計0体)」と刷って ✅ |
 * | `backlog: []` | **0** | **これは正しい** (下記) |
 *
 * ★ **いちばん重いのは秘書室で、そこには「決めない」と書いてあった** ——
 * ゲートの注記が「秘書室を必須にはしない … **0 室になったら CI の出力でそう
 * 分かる**」と述べていた。**緑のゲートの成功行は誰も読まない**ので、
 * 出力に出すことは検査することではない (法則 `no-weakness-as-spec` の、
 * 保留をゲートに書き残した形)。しかも「どちらが意図かコードからは決まらない」
 * も偽で、**冒頭の不変条件 9b と `--plan` の組織図がどちらも「常設」と述べて
 * いる** —— 決まっていなかったのではなく、囲いだけがそれを読んでいなかった。
 *
 * ★ **`backlog` には床を置かない** —— 着手候補が片付けば 0 件になりうるので、
 * 実測に張り付けた床は**直した日に落ちる門**になる (パス 378)。
 * **確かめる物が無いことと、検査が消えたことは別である。**
 *
 * ## ここが見る物
 *
 * 門の self-test は「床が当たるか」を見る。ここが見るのは**実物の registry が
 * その床の上に居るか**と、**床を置かないと決めた母集団がそのままか**で、
 * `verify:orchestration` が CI から外れても `npm test` が鳴る。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

const gate = req('../../../scripts/verify-orchestration.cjs') as {
  checkPopulations: (reg: unknown) => string[];
};

interface Registry {
  teams: unknown[];
  rounds: unknown[];
  backlog: unknown[];
  policy: { minTeamsForRound: unknown[] };
  org: { executives: unknown[]; managers: unknown[]; secretaries: { supports: string; id: string }[] };
}

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function registry(): Registry {
  return JSON.parse(readOriginalSource(join(REPO, 'orchestration', 'registry.json'))) as Registry;
}

/** 実物の registry の 1 か所を空にした写しを作る。 */
function without(mut: (r: Registry) => void): Registry {
  const r = registry();
  mut(r);
  return r;
}

describe('空にすると消える検査には床が在る (パス 467)', () => {
  it('★ 走査が実物に当たる (母集団が空で通っていない)', () => {
    const r = registry();
    expect(r.teams.length, 'teams が空 = 床の主張が空虚').toBeGreaterThanOrEqual(1);
    expect(r.rounds.length, 'rounds が空').toBeGreaterThanOrEqual(1);
    expect(r.org.secretaries.length, '秘書室が空').toBeGreaterThanOrEqual(1);
    expect(r.policy.minTeamsForRound.length, 'minTeamsForRound が空').toBeGreaterThanOrEqual(1);
  });

  it('実物の registry は床を通る', () => {
    expect(gate.checkPopulations(registry()), '実物が床を下回っている').toEqual([]);
  });

  it('★ 空にすると鳴る母集団 (実測で exit 0 だった 3 つを含む)', () => {
    const muts: [string, (r: Registry) => void][] = [
      ['rounds', (r) => { r.rounds = []; }],
      ['policy.minTeamsForRound', (r) => { r.policy.minTeamsForRound = []; }],
      ['org.secretaries', (r) => { (r.org as { secretaries?: unknown }).secretaries = undefined; }],
      ['teams', (r) => { r.teams = []; }],
      ['org.executives', (r) => { r.org.executives = []; }],
      ['org.managers', (r) => { r.org.managers = []; }],
    ];
    for (const [name, mut] of muts) {
      const got = gate.checkPopulations(without(mut));
      expect(got.length, `${name} を空にしても鳴らない`).toBe(1);
      expect(got[0], `${name} を名指ししていない`).toContain(name);
    }
  });

  it('★ backlog には床を置かない (正当に 0 になる母集団)', () => {
    // 着手候補が片付けば 0 件になる。実測に張り付けた床は「直した日に落ちる門」になる。
    expect(gate.checkPopulations(without((r) => { r.backlog = []; })), 'backlog に床が付いている').toEqual([]);
  });

  /*
   * ★ **注記は落としてから探す** —— 最初に書いた版は原文をそのまま走査しており、
   * **この検査自身とゲートの docblock が直す前の形を引用している**ために鳴った
   * (法則 `mention-vs-declaration`。パス 464 / 465 / 466 と同じ家系で、
   * このパスでも 1 度踏んだ)。共有の走査器を通す。
   */
  /*
   * ★ **門を丸ごと走らせる** —— 上の 3 件は `checkPopulations` を借りるので
   * **床の中身**しか見ない。対照 (床を `main` から外す = 呼ばなくする) を回すと
   * **self-test ✗0 / この検査 0 失敗**で、実物は exit 0 へ戻った (2026-09-25 実測)。
   * 床が在ることと、床が当たることは別である。
   */
  it('★ 床が実際に門から当たる (差し替えた registry を通す)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestration-'));
    tmpDirs.push(dir);
    const run = (reg: Registry): number => {
      const f = join(dir, `r-${tmpDirs.length}-${Math.random().toString(36).slice(2)}.json`);
      writeFileSync(f, JSON.stringify(reg), 'utf8');
      return spawnSync('node', [join(REPO, 'scripts', 'verify-orchestration.cjs'), '--registry', f], {
        encoding: 'utf8',
      }).status ?? -1;
    };
    expect(run(registry()), '実物の写しで門が落ちている').toBe(0);
    expect(run(without((r) => { r.rounds = []; })), 'rounds を空にしても門が通る').toBe(1);
    expect(run(without((r) => { (r.org as { secretaries?: unknown }).secretaries = undefined; })),
      '秘書室を消しても門が通る').toBe(1);
    expect(run(without((r) => { r.backlog = []; })), 'backlog を空にすると門が落ちる (床を置かないと決めた側)').toBe(0);
  });

  it('★ 秘書室の完全性検査が、また条件で囲まれていない', () => {
    // 床は「0 室」を見る。1 室だけ欠けた形は本体の完全性検査が見る (囲いを外した側)。
    const WRAPPED = /if\s*\(\(org\.secretaries[^)]*\)\.length\s*>\s*0\)/;
    const code = stripComments(readOriginalSource(join(REPO, 'scripts', 'verify-orchestration.cjs')));
    expect(code, '秘書室の完全性検査がまた条件で囲まれている').not.toMatch(WRAPPED);
    // 針が的に当たる標本 (直す前の形) と、注記の中では数えない標本。
    expect('if ((org.secretaries || []).length > 0) {', '針が死んでいる').toMatch(WRAPPED);
    expect(stripComments('// if ((org.secretaries || []).length > 0) {'), '注記を落としていない').not.toMatch(WRAPPED);
    expect(code, '未配置を名指しする文が消えている').toContain('に秘書室が未配置');
  });
});
