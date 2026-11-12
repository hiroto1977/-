/**
 * **製品が読む派生索引 `teamFirstRound`** (2026-09-26 · パス 483)。
 *
 * ## なぜ在るか (実測)
 *
 * 村のディスパッチ計画 (`villageData.buildDispatchPlan`) が `rounds` から読むのは
 * **「チーム → 初出ラウンド」の対応だけ**だった。ところが `rounds` を名前で import すると
 * Vite の JSON の tree-shaking は**鍵の単位**でしか落とさないので、102 ラウンドの
 * 編成表とリリースノート (minified **160,558 B**) が両ビルドへ丸ごと入っていた
 * (パス 396 が測り、`registryBundleCost.test.ts` が代金として留めていた)。
 * パス 482 で LITE が CI の警告線 3,400,000 B を 1,457 B 超えたので、製品は `rounds` を
 * やめて 2,610 B の索引を読む形にした。**開発側の履歴 (`rounds`) は台帳にそのまま残る。**
 *
 * ## この検査が見ること
 *
 * 1. **実物の索引は `rounds` から独立に数え直した物と一致する** —— 数え直しは
 *    直す前の製品と同じ算法 (配列を順に読んで初めて現れた round) で書く。
 *    これが一致する限り、置き換えで村の並び順は 1 つも動かない。
 * 2. **書き手が引き直す** —— `orchestrate.cjs record` で round を足した写しが
 *    門 (`verify-orchestration.cjs`) を通り、新しいチームの初出が記録される。
 * 3. **対照: 引き直さない台帳は門が落とす** —— round だけ足して索引を放置した写しは
 *    exit 1 で、欠けたチームを名指しする (門が結果を**使っている**ことの確認でもある
 *    —— 判定を関数として呼ぶ検査だけだと、`main` が使わなくなっても黙る · パス 472 / 475)。
 * 4. 導出の端 (`__proto__` の id・余分な行・番号の最小) を振る舞いで留める。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readOriginalSource } from './originalSource';

const REPO = resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const lib = req('../../../scripts/lib/team-first-round.cjs') as {
  deriveTeamFirstRound: (rounds: readonly { round: number; teams: readonly string[] }[]) => Record<string, number>;
  teamFirstRoundProblems: (stored: unknown, rounds: readonly { round: number; teams: readonly string[] }[]) => string[];
};

interface Round { round: number; teamCount: number; teams: string[]; shipped?: string[] }
interface Team { id: string; domain: string; focus: string; active: boolean; manager: string }
interface Registry {
  teams: Team[];
  rounds: Round[];
  teamFirstRound: Record<string, number>;
  org: { managers: { id: string; teams: string[] }[] };
}

function registry(): Registry {
  return JSON.parse(readOriginalSource(join(REPO, 'orchestration', 'registry.json'))) as Registry;
}

/** 直す前の製品 (`buildDispatchPlan`) と同じ算法 —— 配列を順に読み、初めて現れた round。 */
function firstAppearance(rounds: readonly Round[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rounds) for (const t of r.teams) if (!m.has(t)) m.set(t, r.round);
  return m;
}

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function tmpFile(reg: Registry): string {
  const dir = mkdtempSync(join(tmpdir(), 'team-first-round-'));
  tmpDirs.push(dir);
  const f = join(dir, 'registry.json');
  writeFileSync(f, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
  return f;
}

function gate(file: string): { status: number; out: string } {
  const r = spawnSync('node', [join(REPO, 'scripts', 'verify-orchestration.cjs'), '--registry', file], { encoding: 'utf8' });
  return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** 写しに新しいチームを 1 つ足す (管理職の配下にも入れる —— 門の不変条件 11)。 */
function withNewTeam(id: string): Registry {
  const reg = registry();
  const mgr = reg.org.managers[0]!;
  reg.teams.push({ id, domain: '検査用', focus: '索引の引き直し', active: true, manager: mgr.id });
  mgr.teams.push(id);
  return reg;
}

describe('派生索引 teamFirstRound (パス 483)', () => {
  it('★ 実物の索引は rounds から独立に数え直した物と一致する (置き換えで並びが動かない)', () => {
    const reg = registry();
    const witness = firstAppearance(reg.rounds);
    expect(witness.size, '数え直しが空 = この主張が空虚').toBeGreaterThanOrEqual(100);
    expect(Object.keys(reg.teamFirstRound).length).toBe(witness.size);
    for (const [id, round] of witness) {
      expect(reg.teamFirstRound[id], `${id} の初出`).toBe(round);
    }
    // 導出の実装とも一致する (門が見る物と同じ)。
    expect(lib.teamFirstRoundProblems(reg.teamFirstRound, reg.rounds)).toEqual([]);
  });

  it('★ 書き手: record で round を足すと索引が引き直され、門が通る', () => {
    const reg = withNewTeam('zz-first-round-probe');
    const last = reg.rounds[reg.rounds.length - 1]!;
    const next = last.round + 1;
    const file = tmpFile(reg);
    const rec = spawnSync('node', [
      join(REPO, 'scripts', 'orchestrate.cjs'), 'record',
      '--round', String(next),
      '--teams', [...last.teams, 'zz-first-round-probe'].join(','),
      '--shipped', '索引の引き直しの検査',
      '--registry', file,
    ], { encoding: 'utf8' });
    expect(rec.status, `${rec.stdout}${rec.stderr}`).toBe(0);

    const written = JSON.parse(readOriginalSource(file)) as Registry;
    expect(written.teamFirstRound['zz-first-round-probe'], '新しいチームの初出が記録されていない').toBe(next);
    // 既存の行は動かない (初出は過去の事実)。
    for (const [id, round] of Object.entries(reg.teamFirstRound)) {
      expect(written.teamFirstRound[id], id).toBe(round);
    }
    const g = gate(file);
    expect(g.status, g.out).toBe(0);
  });

  it('★ 対照: round だけ足して索引を引き直さない台帳は、門が落として名指しする', () => {
    const reg = withNewTeam('zz-stale-probe');
    const last = reg.rounds[reg.rounds.length - 1]!;
    const teams = [...last.teams, 'zz-stale-probe'];
    reg.rounds.push({ round: last.round + 1, teamCount: teams.length, teams, shipped: ['検査'] });
    const g = gate(tmpFile(reg));
    expect(g.status).toBe(1);
    expect(g.out).toContain('teamFirstRound に "zz-stale-probe" がありません');
  });

  it('★ 対照: 索引の値を 1 つ書き換えた台帳は、門が落とす', () => {
    const reg = registry();
    const [id, round] = Object.entries(reg.teamFirstRound)[0]!;
    reg.teamFirstRound[id] = round + 1;
    const g = gate(tmpFile(reg));
    expect(g.status).toBe(1);
    expect(g.out).toContain(`teamFirstRound["${id}"]`);
  });

  it('★ 対照: 索引の鍵そのものが無い台帳は、門が落とす (必須の鍵)', () => {
    const reg = registry() as Partial<Registry>;
    delete reg.teamFirstRound;
    const g = gate(tmpFile(reg as Registry));
    expect(g.status).toBe(1);
    expect(g.out).toContain('必須キー "teamFirstRound"');
  });
});

describe('導出の端 (scripts/lib/team-first-round.cjs)', () => {
  it('初出は配列の順ではなく番号の最小', () => {
    const got = lib.deriveTeamFirstRound([
      { round: 5, teams: ['a'] },
      { round: 2, teams: ['a', 'b'] },
    ]);
    expect(got).toEqual({ a: 2, b: 2 });
  });

  it('鍵の並びは初めて現れた順 (新しいチームは末尾に足される —— 差分が読める)', () => {
    const got = lib.deriveTeamFirstRound([
      { round: 1, teams: ['b', 'a'] },
      { round: 2, teams: ['c', 'a'] },
    ]);
    expect(Object.keys(got)).toEqual(['b', 'a', 'c']);
  });

  it('★ id が __proto__ でも prototype を差し替えない (自分の属性として持つ)', () => {
    const got = lib.deriveTeamFirstRound([{ round: 1, teams: ['__proto__'] }]);
    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
    expect(Object.hasOwn(got, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(got, '__proto__')?.value).toBe(1);
  });

  it('★ 両方向に名指しする (足りない行・違う値・余分な行)', () => {
    const rounds = [{ round: 1, teams: ['a'] }, { round: 2, teams: ['a', 'b'] }];
    expect(lib.teamFirstRoundProblems({ a: 1, b: 2 }, rounds)).toEqual([]);
    expect(lib.teamFirstRoundProblems({ a: 1 }, rounds)).toEqual([
      'teamFirstRound に "b" がありません (rounds では round 2 が初出)',
    ]);
    expect(lib.teamFirstRoundProblems({ a: 2, b: 2 }, rounds)).toEqual([
      'teamFirstRound["a"] = 2 が rounds の初出 (round 1) と違います',
    ]);
    expect(lib.teamFirstRoundProblems({ a: 1, b: 2, gone: 1 }, rounds)).toEqual([
      'teamFirstRound の "gone" はどの round にも現れません',
    ]);
    expect(lib.teamFirstRoundProblems([], rounds)).toHaveLength(1);
    expect(lib.teamFirstRoundProblems(null, rounds)).toHaveLength(1);
  });
});
