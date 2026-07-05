/**
 * villageData — 「AIの村」シーンの純ロジック（IO なし・決定論的）。
 *
 * `orchestration/registry.json` の org / teams / rounds / backlog から、
 *   1. 村人ロスター（143 体: CEO 1 / COO 1 / 役員 5 / 秘書室 5×4=20 / 管理職 8 / 一般職 108）
 *   2. 計算されたディスパッチ計画（どのチームがどの順で「作業広場」に集まるか）
 * を導出する。ネットワークや乱数・時刻に依存せず、同じ registry からは常に同じ結果を返す
 * （テストで固定）。村シーンはこの静的データをアニメーションで見せるだけ。
 */

// registry.json の必要スライスだけを型付きで取り込む（純データ）。
interface RawCeo {
  readonly id: string;
  readonly title: string;
}
interface RawCoo {
  readonly id: string;
  readonly title: string;
  readonly owns: readonly string[];
}
interface RawExecutive {
  readonly id: string;
  readonly title: string;
  readonly reportsTo: string;
  readonly owns: readonly string[];
  readonly domain: string;
}
interface RawSecretary {
  readonly id: string;
  readonly title: string;
  readonly supports: string;
  readonly members: number;
  readonly duties?: readonly string[];
}
interface RawManager {
  readonly id: string;
  readonly title: string;
  readonly reportsTo: string;
  readonly teams: readonly string[];
}
interface RawTeam {
  readonly id: string;
  readonly domain: string;
  readonly focus: string;
  readonly active: boolean;
  readonly manager: string;
  readonly role?: 'research' | 'audit';
}
interface RawRound {
  readonly round: number;
  readonly teams: readonly string[];
}
interface RawBacklog {
  readonly id: string;
  readonly team: string;
  readonly title: string;
  readonly priority: number;
  readonly status: 'designed' | 'in-progress' | 'shipped' | 'dropped' | 'blocked';
}
export interface VillageRegistry {
  readonly org: {
    readonly ceo: RawCeo;
    readonly coo: RawCoo;
    readonly executives: readonly RawExecutive[];
    readonly secretaries: readonly RawSecretary[];
    readonly managers: readonly RawManager[];
  };
  readonly teams: readonly RawTeam[];
  readonly rounds: readonly RawRound[];
  readonly backlog: readonly RawBacklog[];
}

export type VillagerKind = 'ceo' | 'coo' | 'executive' | 'secretary' | 'manager' | 'team';
export type TeamRole = 'research' | 'audit' | 'impl';

/** 村人 1 体。`regionId` はレイアウトの区画（役員ごとの街区）。 */
export interface Villager {
  readonly id: string;
  readonly name: string;
  readonly kind: VillagerKind;
  readonly emoji: string;
  /** 所属する区画 id（`ceo` / `coo` / `exec-<execId>`）。 */
  readonly regionId: string;
  readonly execId?: string;
  readonly managerId?: string;
  readonly role?: TeamRole;
  readonly domain?: string;
  readonly focus?: string;
  /** 指揮系統ラベル（team のとき「チーム → 部長 → 役員」）。 */
  readonly chain?: string;
}

/** レイアウト区画（役員ごとの街区＋中枢）。 */
export interface VillageRegion {
  readonly id: string;
  readonly kind: 'ceo' | 'coo' | 'exec';
  readonly label: string;
  readonly execId?: string;
}

/** 「作業広場」で実演される 1 タスク。 */
export interface DispatchStep {
  readonly teamId: string;
  readonly teamName: string;
  readonly focus: string;
  readonly managerId: string;
  readonly execId: string;
  readonly chain: string;
  /** backlog に紐づく場合の状態（色分け用）。 */
  readonly status?: RawBacklog['status'];
}

const EXEC_EMOJI: Record<string, string> = {
  cfo: '💰',
  chro: '👥',
  cso: '🎯',
  cio: '💡',
  cqo: '✅',
};

/** チームの役割 → 絵文字。研究🔬 / 監査🕵️ / 実装🧑‍🔧。 */
export function teamEmoji(role: TeamRole): string {
  if (role === 'research') return '🔬';
  if (role === 'audit') return '🕵️';
  return '🧑‍🔧';
}

export function roleOf(team: Pick<RawTeam, 'role'>): TeamRole {
  return team.role ?? 'impl';
}

/** 「役員 (CFO)」のような肩書きから短い呼称を作る。 */
function shortTitle(title: string): string {
  // 例: "最高財務責任者 (CFO)" → "CFO"、"税務部長" → "税務部長"
  const inner = title.match(/\(([^)]+)\)/)?.[1];
  return inner ? inner.trim() : title;
}

/** ドメイン文字列から短いチーム名（区分名）を取り出す。例: "税務(所得税)" → "所得税"。 */
function teamLabel(team: RawTeam): string {
  const inner = team.domain.match(/[(（]([^)）]+)[)）]/)?.[1];
  return inner ? inner.trim() : team.domain;
}

/** チームの指揮系統ラベル「◯◯チーム → ◯◯部長 → CFO」。 */
export function teamChain(
  team: RawTeam,
  managers: readonly RawManager[],
  executives: readonly RawExecutive[],
): string {
  const mgr = managers.find((m) => m.id === team.manager);
  const exec = mgr ? executives.find((e) => e.id === mgr.reportsTo) : undefined;
  const parts = [`${teamLabel(team)}チーム`];
  if (mgr) parts.push(mgr.title);
  if (exec) parts.push(shortTitle(exec.title));
  return parts.join(' → ');
}

/** レイアウト区画（中枢＋役員街区）を返す。 */
export function buildRegions(reg: VillageRegistry): VillageRegion[] {
  const regions: VillageRegion[] = [
    { id: 'ceo', kind: 'ceo', label: 'CEO の家' },
    { id: 'coo', kind: 'coo', label: 'COO 広場' },
  ];
  for (const e of reg.org.executives) {
    regions.push({ id: `exec-${e.id}`, kind: 'exec', label: shortTitle(e.title), execId: e.id });
  }
  return regions;
}

/** 143 体の村人ロスターを決定論的に構築する。 */
export function buildVillagers(reg: VillageRegistry): Villager[] {
  const { ceo, coo, executives, secretaries, managers } = reg.org;
  const villagers: Villager[] = [];

  villagers.push({ id: ceo.id, name: 'CEO', kind: 'ceo', emoji: '👑', regionId: 'ceo' });
  villagers.push({ id: coo.id, name: 'COO', kind: 'coo', emoji: '🧭', regionId: 'coo' });

  for (const e of executives) {
    villagers.push({
      id: e.id,
      name: shortTitle(e.title),
      kind: 'executive',
      emoji: EXEC_EMOJI[e.id] ?? '🧑‍💼',
      regionId: `exec-${e.id}`,
      execId: e.id,
    });
  }

  // 秘書室: 各室 members 名を個別キャラに展開（1:1 で役員の街区に配置）。
  for (const s of secretaries) {
    const execId = s.supports;
    const n = Math.max(0, s.members);
    for (let i = 1; i <= n; i++) {
      villagers.push({
        id: `${s.id}-${i}`,
        name: `${shortTitle(s.title)}${i}`,
        kind: 'secretary',
        emoji: '🧑‍💼',
        regionId: `exec-${execId}`,
        execId,
      });
    }
  }

  for (const m of managers) {
    villagers.push({
      id: m.id,
      name: m.title,
      kind: 'manager',
      emoji: '👔',
      regionId: `exec-${m.reportsTo}`,
      execId: m.reportsTo,
      managerId: m.id,
    });
  }

  // 一般職チーム: 所属管理職→役員の街区に配置。role で絵文字を切替。
  const mgrById = new Map(managers.map((m) => [m.id, m]));
  for (const t of reg.teams) {
    if (!t.active) continue;
    const mgr = mgrById.get(t.manager);
    const execId = mgr?.reportsTo ?? 'coo';
    const role = roleOf(t);
    villagers.push({
      id: t.id,
      name: teamLabel(t),
      kind: 'team',
      emoji: teamEmoji(role),
      regionId: `exec-${execId}`,
      execId,
      managerId: t.manager,
      role,
      domain: t.domain,
      focus: t.focus,
      chain: teamChain(t, managers, executives),
    });
  }

  return villagers;
}

/** backlog の状態を team id で引ける Map。 */
export function backlogByTeam(reg: VillageRegistry): Map<string, RawBacklog['status']> {
  const map = new Map<string, RawBacklog['status']>();
  for (const b of reg.backlog) {
    // 同一チームに複数あれば「より進行中」を優先（in-progress > designed > blocked > 完了系）。
    const rank = (s: RawBacklog['status']) =>
      s === 'in-progress' ? 4 : s === 'designed' ? 3 : s === 'blocked' ? 2 : 1;
    const prev = map.get(b.team);
    if (prev === undefined || rank(b.status) > rank(prev)) map.set(b.team, b.status);
  }
  return map;
}

/**
 * 「作業広場」で順に実演するディスパッチ計画を決定論的に構築する。
 * 並び順: ①backlog 状態の重み（進行中→設計→ブロック→完了）②ラウンド初出順
 * ③teamId 昇順。全 active チームを 1 度ずつ含める（常時アニメの素材）。
 */
export function buildDispatchPlan(reg: VillageRegistry): DispatchStep[] {
  const { managers, executives } = reg.org;
  const mgrById = new Map(managers.map((m) => [m.id, m]));
  const status = backlogByTeam(reg);

  // ラウンド初出順（小さいほど先）。未出現は大きな値。
  const firstRound = new Map<string, number>();
  for (const r of reg.rounds) {
    for (const tid of r.teams) {
      if (!firstRound.has(tid)) firstRound.set(tid, r.round);
    }
  }

  const statusWeight = (s: RawBacklog['status'] | undefined): number => {
    if (s === 'in-progress') return 0;
    if (s === 'designed') return 1;
    if (s === 'blocked') return 2;
    return 3; // shipped / dropped / なし
  };

  const active = reg.teams.filter((t) => t.active);
  const steps = active.map((t): DispatchStep => {
    const mgr = mgrById.get(t.manager);
    const execId = mgr?.reportsTo ?? 'coo';
    return {
      teamId: t.id,
      teamName: teamLabel(t),
      focus: t.focus,
      managerId: t.manager,
      execId,
      chain: teamChain(t, managers, executives),
      status: status.get(t.id),
    };
  });

  steps.sort((a, b) => {
    const sw = statusWeight(a.status) - statusWeight(b.status);
    if (sw !== 0) return sw;
    const ra = firstRound.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const rb = firstRound.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  return steps;
}

/** 組織サマリー（1 行）。 */
export function villageSummary(reg: VillageRegistry): string {
  const secBodies = reg.org.secretaries.reduce((n, s) => n + Math.max(0, s.members), 0);
  const activeTeams = reg.teams.filter((t) => t.active).length;
  const total = 1 + 1 + reg.org.executives.length + secBodies + reg.org.managers.length + activeTeams;
  return (
    `CEO 1 / COO 1 / 役員 ${reg.org.executives.length} / ` +
    `秘書室 ${reg.org.secretaries.length}室(${secBodies}体) / 管理職 ${reg.org.managers.length} / ` +
    `一般職 ${activeTeams} … 合計 ${total} 体`
  );
}
