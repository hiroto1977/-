/**
 * **製品が読む派生索引 `teamBacklogStatus`** (2026-09-26 · パス 486)。
 *
 * ## なぜ在るか (実測)
 *
 * 村 (`villageData.backlogByTeam` → 輪の色とディスパッチ計画の並び) が backlog から読むのは
 * **`team` と `status` だけ**だった。ところが `VillagePage.tsx` が `backlog` を名前で import
 * しており、Vite の JSON の tree-shaking は**鍵の単位**でしか落とさないので、題名・note・
 * priority まで両ビルドへ入っていた (**題名 43 / 43・note 1 / 1 が逐語で**・UTF-8 7,323 B)。
 *
 * 重いのは byte より**出どころ**である。パス 484 で取り込み口 (`import-requests`) が整い、
 * 利用者がチャットボットに打った文が**題名として**台帳へ入る道が正式に開いた —— つまり
 * 外から来た文が、次のビルドで公開サイトの HTML へ逐語で畳み込まれる。実測 (隔離した
 * worktree で取り込み → `npm run build:web`):
 *
 * | 取り込んだ題名 | 取り込み・門 | `build:web` |
 * | --- | --- | --- |
 * | `請求書の自動化 <!-- 急ぎ` | 通る | 通る |
 * | `請求書の自動化 <!-- <script>` | **通る** | **exit 1** (`inline-html` が「閉じていない `<!--` のあとに `<script`」で断る) |
 *
 * 製品は `backlog` をやめて 1,104 B の索引を読む。**題名と note は台帳にそのまま残る。**
 *
 * ## この検査が見ること
 *
 * 1. **実物の索引は backlog から独立に数え直した物と一致する** —— 数え直しは**直す前の
 *    製品のコードをそのまま写した物** (`>` で比べるので同じ重みなら先の項目が勝つ)。
 *    これが一致する限り、置き換えで村の色も並びも 1 つも動かない。
 * 2. **書き手が引き直す** —— `import-requests` で取り込んだ写しの索引が新しい状態を持ち、
 *    門を通る (書く口 `writeRegistryChecked` が必ず引き直す)。
 * 3. **手で書き換えた台帳は門が落とし、直す手 (`reindex`) を名指しする** —— そして
 *    `reindex` を走らせると門が通る。門が結果を**使っている**ことの確認でもある
 *    (判定を関数として呼ぶ検査だけだと、`main` が使わなくなっても黙る · パス 472 / 475)。
 * 4. 導出の端 (同じ重み・知らない状態・`__proto__` の team・鍵の並び) と、製品の読み手が
 *    prototype を引かず知らない状態を落とすことを振る舞いで留める。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readOriginalSource } from './originalSource';
import { backlogByTeam, type VillageRegistry } from '../../renderer/data/villageData';

const REPO = resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
interface BacklogItem { id: string; team: string; title: string; priority: number; status: string; source?: string; note?: string }
const lib = req('../../../scripts/lib/team-backlog-status.cjs') as {
  deriveTeamBacklogStatus: (backlog: readonly { team: string; status: string }[]) => Record<string, string>;
  teamBacklogStatusProblems: (stored: unknown, backlog: readonly { team: string; status: string }[]) => string[];
};

interface Team { id: string; active: boolean }
interface Registry {
  teams: Team[];
  backlog: BacklogItem[];
  teamBacklogStatus: Record<string, string>;
  [k: string]: unknown;
}

function registry(): Registry {
  return JSON.parse(readOriginalSource(join(REPO, 'orchestration', 'registry.json'))) as Registry;
}

/**
 * **直す前の製品 (`villageData.backlogByTeam`) をそのまま写した物** —— 置き換えで色と並びが
 * 動かないことの証人。導出の実装 (`team-backlog-status.cjs`) を借りると、実装が変わった日に
 * 証人も一緒に変わる。
 */
function beforeFix(backlog: readonly { team: string; status: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of backlog) {
    const rank = (s: string) => (s === 'in-progress' ? 4 : s === 'designed' ? 3 : s === 'blocked' ? 2 : 1);
    const prev = map.get(b.team);
    if (prev === undefined || rank(b.status) > rank(prev)) map.set(b.team, b.status);
  }
  return map;
}

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'team-backlog-status-'));
  tmpDirs.push(dir);
  return dir;
}

function tmpRegistry(reg: Registry): string {
  const f = join(tmpDir(), 'registry.json');
  writeFileSync(f, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
  return f;
}

function gate(file: string): { status: number; out: string } {
  const r = spawnSync('node', [join(REPO, 'scripts', 'verify-orchestration.cjs'), '--registry', file], { encoding: 'utf8' });
  return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

function orchestrate(args: readonly string[]): { status: number; out: string } {
  const r = spawnSync('node', [join(REPO, 'scripts', 'orchestrate.cjs'), ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

function villageRegistry(teamBacklogStatus: Record<string, string>): VillageRegistry {
  return {
    org: { ceo: { id: 'ceo', title: 'CEO' }, coo: { id: 'coo', title: 'COO', owns: [] }, executives: [], secretaries: [], managers: [] },
    teams: [],
    teamFirstRound: {},
    teamBacklogStatus,
  };
}

describe('派生索引 teamBacklogStatus (パス 486)', () => {
  it('★ 実物の索引は、直す前の製品の算法で backlog から数え直した物と一致する (色も並びも動かない)', () => {
    const reg = registry();
    const witness = beforeFix(reg.backlog);
    expect(witness.size, '数え直しが空 = この主張が空虚').toBeGreaterThanOrEqual(30);
    expect(Object.keys(reg.teamBacklogStatus).length).toBe(witness.size);
    for (const [team, status] of witness) {
      expect(reg.teamBacklogStatus[team], `${team} の状態`).toBe(status);
    }
    // 製品の読み手を通しても同じ Map になる (輪の色と並びの鍵はこの Map だけから来る)。
    expect([...backlogByTeam(villageRegistry(reg.teamBacklogStatus))]).toEqual([...witness]);
    // 導出の実装とも一致する (門が見る物と同じ)。
    expect(lib.teamBacklogStatusProblems(reg.teamBacklogStatus, reg.backlog)).toEqual([]);
  });

  it('★ 書き手: import-requests で要望を取り込むと、索引が引き直されて門が通る', () => {
    const reg = registry();
    const activeIds = new Set(reg.teams.filter((t) => t.active === true).map((t) => t.id));
    const team = Object.entries(reg.teamBacklogStatus).find(([id, s]) => s === 'shipped' && activeIds.has(id))?.[0];
    expect(team, '出荷済みの状態しか持たない稼働中のチームが要る (標本)').toBeTruthy();
    const file = tmpRegistry(reg);
    const md = join(tmpDir(), 'chatbot-requests.md');
    // どのチームの語にも当たらない文にして、--team の割当先へ確実に入れる。
    writeFileSync(md, '# チャットボット経由の機能要望\n\n- [ ] ゞゞゞゝゝゝ _(受付: 2026-09-26)_\n', 'utf8');
    const imp = orchestrate(['import-requests', '--file', md, '--team', team!, '--registry', file]);
    expect(imp.status, imp.out).toBe(0);

    const written = JSON.parse(readOriginalSource(file)) as Registry;
    const added = written.backlog[written.backlog.length - 1]!;
    expect(added.team, '取り込んだ項目の割当先').toBe(team);
    expect(written.teamBacklogStatus[team!], '取り込んだ designed が出荷済みに勝っていない (引き直していない)').toBe('designed');
    // 他のチームの行は動かない。
    for (const [id, s] of Object.entries(reg.teamBacklogStatus)) {
      if (id !== team) expect(written.teamBacklogStatus[id], id).toBe(s);
    }
    const g = gate(file);
    expect(g.status, g.out).toBe(0);
  });

  it('★ 手で書き換えた台帳は門が落とし、reindex を名指しする —— reindex を走らせると通る', () => {
    const reg = registry();
    const blocked = reg.backlog.find((b) => b.status === 'blocked');
    expect(blocked, '標本: blocked の項目が要る').toBeTruthy();
    const team = blocked!.team;
    blocked!.status = 'shipped'; // 出荷したので手で書き換えた —— 索引はそのまま
    const want = lib.deriveTeamBacklogStatus(reg.backlog)[team];
    expect(want, '標本: この書き換えで索引の答えが実際に変わること').not.toBe(reg.teamBacklogStatus[team]);
    const file = tmpRegistry(reg);

    const before = gate(file);
    expect(before.status).toBe(1);
    expect(before.out).toContain(`teamBacklogStatus["${team}"]`);
    expect(before.out).toContain('npm run orchestrate:reindex');

    const dry = orchestrate(['reindex', '--dry-run', '--registry', file]);
    expect(dry.status, dry.out).toBe(0);
    expect(dry.out).toContain('teamBacklogStatus');
    expect((JSON.parse(readOriginalSource(file)) as Registry).teamBacklogStatus[team], 'dry-run が書いた').toBe('blocked');

    const re = orchestrate(['reindex', '--registry', file]);
    expect(re.status, re.out).toBe(0);
    expect((JSON.parse(readOriginalSource(file)) as Registry).teamBacklogStatus[team]).toBe(want);
    const after = gate(file);
    expect(after.status, after.out).toBe(0);

    // 索引が既に一致していれば何も書かない (差分を作らない)。
    const text = readOriginalSource(file);
    const again = orchestrate(['reindex', '--registry', file]);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toContain('何も書いていません');
    expect(readOriginalSource(file)).toBe(text);
  });

  it('★ 対照: 索引の値を 1 つ書き換えた台帳は、門が落とす', () => {
    const reg = registry();
    const [team] = Object.keys(reg.teamBacklogStatus);
    reg.teamBacklogStatus[team!] = reg.teamBacklogStatus[team!] === 'designed' ? 'shipped' : 'designed';
    const g = gate(tmpRegistry(reg));
    expect(g.status).toBe(1);
    expect(g.out).toContain(`teamBacklogStatus["${team}"]`);
  });

  it('★ 対照: どの項目にも現れない行が残る台帳は、門が落とす (逆向き)', () => {
    const reg = registry();
    reg.teamBacklogStatus['zz-no-backlog'] = 'designed';
    const g = gate(tmpRegistry(reg));
    expect(g.status).toBe(1);
    expect(g.out).toContain('"zz-no-backlog" はどの backlog 項目にも現れません');
  });

  it('★ 対照: 索引の鍵そのものが無い台帳は、門が落とす (必須の鍵)', () => {
    const reg = registry() as Partial<Registry>;
    delete reg.teamBacklogStatus;
    const g = gate(tmpRegistry(reg as Registry));
    expect(g.status).toBe(1);
    expect(g.out).toContain('必須キー "teamBacklogStatus"');
  });

  it('導出: より進行中が勝ち、同じ重みなら先に現れた項目が残る (直す前の製品と同じ)', () => {
    const cases: readonly [readonly { team: string; status: string }[], Record<string, string>][] = [
      [[{ team: 'a', status: 'shipped' }, { team: 'a', status: 'dropped' }], { a: 'shipped' }],
      [[{ team: 'a', status: 'dropped' }, { team: 'a', status: 'shipped' }], { a: 'dropped' }],
      [[{ team: 'a', status: 'blocked' }, { team: 'a', status: 'in-progress' }], { a: 'in-progress' }],
      [[{ team: 'a', status: 'designed' }, { team: 'a', status: 'in-progress' }], { a: 'in-progress' }],
      [[{ team: 'a', status: 'designed' }, { team: 'a', status: 'blocked' }], { a: 'designed' }],
      [[{ team: 'a', status: 'weird' }, { team: 'a', status: 'shipped' }], { a: 'weird' }],
      [[], {}],
    ];
    for (const [backlog, want] of cases) {
      expect(lib.deriveTeamBacklogStatus(backlog)).toEqual(want);
      // 証人 (直す前の製品) とも同じ答え。
      expect(Object.fromEntries(beforeFix(backlog))).toEqual(want);
    }
  });

  it('導出: 鍵の並びは backlog に初めて現れた順で、__proto__ の team でも prototype を差し替えない', () => {
    const out = lib.deriveTeamBacklogStatus([
      { team: 'b', status: 'shipped' },
      { team: '__proto__', status: 'designed' },
      { team: 'a', status: 'blocked' },
      { team: 'b', status: 'in-progress' },
    ]);
    expect(Object.keys(out)).toEqual(['b', '__proto__', 'a']);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(out.b).toBe('in-progress');
  });

  it('製品の読み手: prototype を引かず、知らない状態は落とす (輪は既定の色・並びは最後)', () => {
    const empty = backlogByTeam(villageRegistry({}));
    expect(empty.get('constructor')).toBeUndefined();
    expect(empty.get('toString')).toBeUndefined();
    const m = backlogByTeam(villageRegistry({ a: 'designed', b: 'weird', c: 'blocked' }));
    expect([...m]).toEqual([['a', 'designed'], ['c', 'blocked']]);
  });
});
