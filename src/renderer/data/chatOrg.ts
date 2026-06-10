/**
 * チャットボット用の AI オーケストレーション組織索引 (純ロジック・IO なし)。
 *
 * `orchestration/registry.json` の `org` / `teams` を入力に、チャットボットが
 * 「どの部署 (チーム→部長→役員) がこの話題の担当か」を解決するための索引を
 * 構築する。registry が将来のラウンドで成長 (チーム/部長の追加) しても、
 * 本モジュールは**構造から導出**するため自動で追随する (将来拡張に自動連動)。
 *
 * registry.json の `rounds` (履歴・容量の大半) は import しない — Vite の JSON
 * 名前付き export tree-shaking により `org` / `teams` のみがバンドルされる。
 */

/** registry.json の org.executives[] の 1 要素 (使用フィールドのみ)。 */
export interface RawExecutive {
  readonly id: string;
  readonly title: string;
  readonly domain?: string;
}

/** registry.json の org.managers[] の 1 要素 (使用フィールドのみ)。 */
export interface RawManager {
  readonly id: string;
  readonly title: string;
  readonly reportsTo: string;
  readonly teams: readonly string[];
}

/** registry.json の teams[] の 1 要素 (使用フィールドのみ)。 */
export interface RawTeam {
  readonly id: string;
  readonly domain: string;
  readonly focus: string;
  readonly manager: string;
}

/** buildOrgIndex の入力 (registry.json の該当部分)。 */
export interface RawOrg {
  readonly executives: readonly RawExecutive[];
  readonly managers: readonly RawManager[];
  readonly secretaries?: readonly unknown[];
}

/** 話題→担当部署の解決結果 (見つかった範囲で埋まる)。 */
export interface OrgRoute {
  readonly team?: RawTeam;
  readonly manager?: RawManager;
  readonly executive?: RawExecutive;
}

/** 組織サマリ件数。 */
export interface OrgCounts {
  readonly executives: number;
  readonly managers: number;
  readonly teams: number;
  readonly secretaries: number;
}

/** チャットボットが使う組織索引。 */
export interface OrgIndex {
  readonly executives: readonly RawExecutive[];
  readonly managers: readonly RawManager[];
  readonly teams: readonly RawTeam[];
  readonly counts: OrgCounts;
}

/** registry.json の org / teams から索引を構築する (純粋)。 */
export function buildOrgIndex(org: RawOrg, teams: readonly RawTeam[]): OrgIndex {
  return {
    executives: org.executives,
    managers: org.managers,
    teams,
    counts: {
      executives: org.executives.length,
      managers: org.managers.length,
      teams: teams.length,
      secretaries: org.secretaries?.length ?? 0,
    },
  };
}

/** manager id → manager / executive を引く (見つからなければ undefined)。 */
function managerById(index: OrgIndex, managerId: string): RawManager | undefined {
  return index.managers.find((m) => m.id === managerId);
}

function executiveById(index: OrgIndex, executiveId: string): RawExecutive | undefined {
  return index.executives.find((e) => e.id === executiveId);
}

/** manager から指揮系統 (manager→executive) を解決する。 */
function routeFromManager(index: OrgIndex, manager: RawManager, team?: RawTeam): OrgRoute {
  return { team, manager, executive: executiveById(index, manager.reportsTo) };
}

/**
 * 話題テキスト (正規化済みを想定) から担当部署を解決する。
 *
 * 1. チームの domain / focus に話題の語が含まれる (または話題にチーム domain の
 *    語幹が含まれる) チームを探し、manager → executive へ辿る。
 * 2. 見つからなければ部長 title (例: 税務部長) の語幹一致で manager 直当て。
 * 3. それも無ければ役員 domain の語一致で executive 直当て。
 * 4. 全て外れたら空の route (チャット側で COO 直轄として扱う)。
 */
export function routeTopic(index: OrgIndex, topic: string): OrgRoute {
  if (!topic) return {};
  for (const team of index.teams) {
    if (team.domain.includes(topic) || team.focus.includes(topic) || topic.includes(team.domain)) {
      const manager = managerById(index, team.manager);
      if (manager) return routeFromManager(index, manager, team);
      return { team };
    }
  }
  for (const manager of index.managers) {
    // 「税務部長」→ 語幹「税務」。話題がその語幹を含めば担当。
    // title に改行は無いため `$` 有無は等価 (Regex 変異 `.*$`→`.*` は同値)。
    // Stryker disable next-line Regex
    const stem = manager.title.replace(/部長.*$/, '');
    if (stem && topic.includes(stem)) {
      return routeFromManager(index, manager);
    }
  }
  for (const executive of index.executives) {
    const domain = executive.domain;
    if (domain !== undefined && domain.split(/[・/]/).some((w) => w && topic.includes(w))) {
      return { executive };
    }
  }
  return {};
}

/**
 * 解決結果を「◯◯チーム → ◯◯部長 → CFO」形式の指揮系統ラベルへ整形する。
 * 何も解決できなかったときは COO 直轄を返す。
 */
export function routeLabel(route: OrgRoute): string {
  const parts: string[] = [];
  if (route.team) parts.push(`${route.team.domain}チーム`);
  if (route.manager) parts.push(route.manager.title);
  if (route.executive) parts.push(route.executive.title);
  if (parts.length === 0) return 'COO 直轄';
  return parts.join(' → ');
}

/** 組織サマリの 1 行テキスト (チャット返信用)。 */
export function orgSummaryLine(index: OrgIndex): string {
  const c = index.counts;
  return `CEO 1 / COO 1 / 役員 ${c.executives} / 秘書室 ${c.secretaries} 室 / 管理職 ${c.managers} / 一般職チーム ${c.teams}`;
}
