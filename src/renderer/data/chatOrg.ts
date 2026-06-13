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

/** 部長 title の語幹 (例: 税務部長→税務) が話題に含まれる manager を探す。 */
function matchManagerStem(index: OrgIndex, topic: string): RawManager | undefined {
  for (const manager of index.managers) {
    // 「税務部長」→ 語幹「税務」。話題がその語幹を含めば担当。
    // title に改行は無いため `$` 有無は等価 (Regex 変異 `.*$`→`.*` は同値)。
    // Stryker disable next-line Regex
    const stem = manager.title.replace(/部長.*$/, '');
    if (stem && topic.includes(stem)) return manager;
  }
  return undefined;
}

/** 役員 domain の語 (・/ 区切り) が話題に含まれる executive を探す。 */
function matchExecutiveDomain(index: OrgIndex, topic: string): RawExecutive | undefined {
  for (const executive of index.executives) {
    const domain = executive.domain;
    if (domain !== undefined && domain.split(/[・/]/).some((w) => w && topic.includes(w))) {
      return executive;
    }
  }
  return undefined;
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
  const manager = matchManagerStem(index, topic);
  if (manager) return routeFromManager(index, manager);
  const executive = matchExecutiveDomain(index, topic);
  if (executive) return { executive };
  return {};
}

// --- スコアリング型ルーティング (思考の精度向上) -----------------------------
//
// 単純な「最初にヒットしたチーム」ではなく、全チームを多シグナルで採点し最良を選ぶ
// (crisisDeliberation の多役採点の思想)。さらに最良スコアがしきい値に満たないときは
// チームに確定せず部長/役員/COO へエスカレーションする (sourceVerification の確証
// しきい値の思想) — 誤ルーティングを減らし精度を上げる。

/** チームに確定するための最低スコア (これ未満は上位へエスカレーション)。 */
export const MIN_TEAM_SCORE = 20;

/**
 * 話題とチームの一致度を採点する (純粋・決定論的)。高いほど専門性が高く確実。
 *  - domain 完全一致: +100 (最も特異的)
 *  - domain が話題を内包 (話題が domain の一部): +50
 *  - 話題が domain 全体を内包: + domain 長 × 4 (長い=特異的で確実、短い domain は
 *    ノイズになりやすく {@link MIN_TEAM_SCORE} 未満となり上位へエスカレーションする)
 *  - focus が話題を含む: +30
 */
export function scoreTopicMatch(team: RawTeam, topic: string): number {
  if (topic === '') return 0;
  let score = 0;
  if (team.domain === topic) score += 100;
  if (team.domain !== topic && team.domain.includes(topic)) score += 50;
  if (topic.includes(team.domain)) score += team.domain.length * 4;
  if (team.focus.includes(topic)) score += 30;
  return score;
}

/** 採点されたチーム候補。 */
export interface ScoredCandidate {
  readonly team: RawTeam;
  readonly score: number;
}

/** スコアリング型ルーティングの結果 (確信度・候補つき)。 */
export interface ScoredRoute {
  readonly route: OrgRoute;
  /** 0..1。チーム確定時は最良スコア/100、部長/役員フォールバックは中/低、不明は 0。 */
  readonly confidence: number;
  /** スコア降順の候補 (透明性・上位デバッグ用)。 */
  readonly candidates: readonly ScoredCandidate[];
  /** 最良と次点のスコア差が小さい曖昧な判定か (人のレビューを促す)。 */
  readonly ambiguous: boolean;
  /** 次点のチーム候補 (あれば)。曖昧判定の根拠。 */
  readonly runnerUp?: ScoredCandidate;
}

/** 最良と次点がこの点差未満なら「僅差＝曖昧」とみなす。 */
export const AMBIGUITY_MARGIN = 20;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 話題を採点して最良の担当部署を解決する (純粋・決定論的)。
 * 全チームを採点し最良を選ぶ。最良が {@link MIN_TEAM_SCORE} 未満なら部長→役員→COO へ。
 */
export function routeTopicScored(index: OrgIndex, topic: string): ScoredRoute {
  // 空話題は scoreTopicMatch が全チーム 0 を返すため、特別扱いせず一般経路で {} に収束する。
  const candidates = index.teams
    .map((team) => ({ team, score: scoreTopicMatch(team, topic) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const runnerUp = candidates[1];
  if (best !== undefined && best.score >= MIN_TEAM_SCORE) {
    const manager = managerById(index, best.team.manager);
    const route = manager !== undefined ? routeFromManager(index, manager, best.team) : { team: best.team };
    const ambiguous = runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN;
    return { route, confidence: round2(Math.min(1, best.score / 100)), candidates, ambiguous, runnerUp };
  }
  const manager = matchManagerStem(index, topic);
  if (manager !== undefined) {
    return { route: routeFromManager(index, manager), confidence: 0.4, candidates, ambiguous: false, runnerUp };
  }
  const executive = matchExecutiveDomain(index, topic);
  if (executive !== undefined) return { route: { executive }, confidence: 0.3, candidates, ambiguous: false, runnerUp };
  return { route: {}, confidence: 0, candidates, ambiguous: false, runnerUp };
}

/** 確信度を 高/中/低 のラベルへ (チャット表示用)。 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.6) return '高';
  if (confidence >= 0.3) return '中';
  return '低';
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
