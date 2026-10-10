/**
 * villageData — 「AIの村」シーンの純ロジック（IO なし・決定論的）。
 *
 * `orchestration/registry.json` の org / teams / teamFirstRound / teamBacklogStatus から、
 *   1. 村人ロスター（143 体: CEO 1 / COO 1 / 役員 5 / 秘書室 5×4=20 / 管理職 8 / 一般職 108）
 *   2. 計算されたディスパッチ計画（どのチームがどの順で「作業広場」に集まるか）
 * を導出する。ネットワークや乱数・時刻に依存せず、同じ registry からは常に同じ結果を返す
 * （テストで固定）。村シーンはこの静的データをアニメーションで見せるだけ。
 */

import { nonNeg } from '../../shared/num';
import { lookup } from '../../shared/lookup';

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
/** backlog の項目の状態 (registry.schema.json の enum と同じ 5 つ)。 */
export type BacklogStatus = 'designed' | 'in-progress' | 'shipped' | 'dropped' | 'blocked';
const BACKLOG_STATUSES: readonly string[] = ['designed', 'in-progress', 'shipped', 'dropped', 'blocked'];
function isBacklogStatus(s: unknown): s is BacklogStatus {
  return typeof s === 'string' && BACKLOG_STATUSES.includes(s);
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
  /**
   * チーム id → そのチームが最初に編成された round の番号 (registry の派生索引)。
   *
   * ★ **`rounds` そのものは読まない** (2026-09-26 · パス 483)。ここが要るのは
   * 「初出の順」だけなのに、`rounds` を名前で import すると Vite の JSON の
   * tree-shaking は鍵の単位でしか落とさないので、102 ラウンドの編成表と
   * リリースノート (minified 160,558 B) が両ビルドへ丸ごと入っていた
   * (パス 396 の実測・`shared/__tests__/registryBundleCost.test.ts`)。
   * 索引は 2,610 B で、導出は `scripts/lib/team-first-round.cjs` の 1 つ ——
   * 書き手 (`orchestrate.cjs record`) が引き直し、`verify:orchestration` が
   * `rounds` から導き直して両方向に一致を検める。
   */
  readonly teamFirstRound: Readonly<Record<string, number>>;
  /**
   * チーム id → そのチームの backlog の状態 (registry の派生索引)。
   *
   * ★ **`backlog` そのものは読まない** (2026-09-26 · パス 486)。ここが要るのは
   * 「チーム → 状態」だけなのに、`backlog` を名前で import すると題名・note・priority
   * まで両ビルドへ入っていた (題名 43 / 43・note 1 / 1・UTF-8 7,323 B)。パス 484 で
   * **利用者がチャットボットに打った文が題名として台帳へ入る道**が開いたので、それは
   * 外から来た文を公開サイトの HTML へ逐語で畳み込むことでもあった —— 実測で、取り込んだ
   * 題名 `<!-- <script>` の 1 行で `npm run build:web` が exit 1 になる
   * (`inline-html` の関門が正しく断るので白画面は出ないが、公開サイトの組み立てが止まる)。
   * 索引は 1,104 B で、導出は `scripts/lib/team-backlog-status.cjs` の 1 つ ——
   * 台帳を書く口 (`orchestrate.cjs` の `writeRegistryChecked`) が引き直し、
   * `verify:orchestration` の不変条件 15 が backlog から導き直して両方向に一致を検める。
   */
  readonly teamBacklogStatus: Readonly<Record<string, string>>;
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
  readonly status?: BacklogStatus;
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
  if (!inner) return title;
  // 括弧内が「CIO / Chief Investment Officer」のように別名併記のときは、
  // 先頭の略称だけを使う（建物カードのヘッダが溢れないように）。
  return (inner.split('/')[0] ?? inner).trim();
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
    const n = nonNeg(s.members);
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

/**
 * backlog の状態を team id で引ける Map —— 派生索引 `teamBacklogStatus` を読むだけ。
 *
 * 「同じチームに複数あれば、より進行中 (in-progress > designed > blocked > 完了系)」の
 * 導出は `scripts/lib/team-backlog-status.cjs` の 1 つで、ここには写さない (パス 486。
 * 直す前はここで backlog から導いていた —— 算法は写しのまま向こうへ移した)。
 * `Object.entries` は own の鍵だけを返すので、`constructor` のような team id でも
 * prototype の関数を拾わない。知らない状態は落とす (輪は既定の色・並びは最後 ——
 * 直す前に知らない状態が辿ったのと同じ見た目)。
 */
export function backlogByTeam(reg: VillageRegistry): Map<string, BacklogStatus> {
  const map = new Map<string, BacklogStatus>();
  for (const [team, status] of Object.entries(reg.teamBacklogStatus)) {
    if (isBacklogStatus(status)) map.set(team, status);
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
  // 索引は prototype を経由せずに引く —— 素の添字だと id が 'constructor' の
  // チームで関数が返り、比較が NaN になって並びが壊れる (shared/lookup.ts)。
  const firstRoundOf = (teamId: string): number => {
    const r = lookup(reg.teamFirstRound, teamId);
    return typeof r === 'number' && Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
  };

  const statusWeight = (s: BacklogStatus | undefined): number => {
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
    const ra = firstRoundOf(a.teamId);
    const rb = firstRoundOf(b.teamId);
    if (ra !== rb) return ra - rb;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  return steps;
}

/** 組織サマリー（1 行）。 */
export function villageSummary(reg: VillageRegistry): string {
  // `Math.max(0, NaN)` は NaN なので、1 室でも読めない人数が在ると
  // **「秘書室 1室(NaN体) … 合計 NaN 体」という文**になる (実測・パス 205)。
  // 人数は負を取らない量なので `nonNeg` で落とす。
  const secBodies = reg.org.secretaries.reduce((n, s) => n + nonNeg(s.members), 0);
  const activeTeams = reg.teams.filter((t) => t.active).length;
  const total = 1 + 1 + reg.org.executives.length + secBodies + reg.org.managers.length + activeTeams;
  return (
    `CEO 1 / COO 1 / 役員 ${reg.org.executives.length} / ` +
    `秘書室 ${reg.org.secretaries.length}室(${secBodies}体) / 管理職 ${reg.org.managers.length} / ` +
    `一般職 ${activeTeams} … 合計 ${total} 体`
  );
}
