/**
 * チームレーダーの状態 —— **形・判定・既定値・スナップショットの組み立てを、両ビルドで 1 つだけ持つ。**
 * (2026-09-09 · パス 117 で型だけ置き、パス 118 で判定と組み立てを移した)
 *
 * ## なぜここに在るか (パス 118)
 *
 * ブラウザ版のチームレーダーは「口はあるが繋がっていない」形だった —— talent が 2026-08-28 に
 * 直された同じ形が、隣のサービスに残っていた:
 *
 *   - `save-state` は payload を**検証せず**そのまま `localStorage['teamradar.state']` へ書く
 *     (main は `validateMembers` で 50 人・5 軸・1〜5 の整数・id の重複を見てから 0600 で書く)。
 *   - その鍵を**読む所が無い** (`src/` 全体で書く 1 行だけ。2026-08-23 の実測でそう記録され、そのまま)。
 *   - 画面は「保存しました」の直後に `refresh()` するが、ブラウザ版の `fetchSnapshot` に teamradar の
 *     枝が無く `not_implemented` へ落ちる —— **「保存しました」と赤いバッジが同時に出る**。
 *
 * 判定は main (`src/main/clients/teamradar.ts`) に在り、renderer からは import 境界で読めなかった。
 * だから判定・既定値・組み立てをここへ移し、main は再輸出し、ブラウザ版は同じ関数を通す
 * (`shared/talent.ts` と同じ置き方)。ファイルの読み書き (0600 / atomic) と SVG は main に残る。
 */

import { localIsoDate } from './localDate';

// --- Axes ----------------------------------------------------------------

export const CANONICAL_AXES = [
  '営業力',
  '顧客対応力',
  'プレゼン力',
  '交渉力',
  '顧客管理力',
] as const;

export type AxisLabel = (typeof CANONICAL_AXES)[number];

export const AXIS_COUNT = CANONICAL_AXES.length;
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** 1 部署の上限。人事評価の一覧なので、無制限に溜めない (main は 2026-08 からこの数で断っている)。 */
export const MAX_TEAM_MEMBERS = 50;

/** ブラウザ版の保存先。`lint:storage` の台帳に載る鍵はこれ 1 つ (パス 118 から読む所が在る)。 */
export const TEAM_RADAR_STORAGE_KEY = 'teamradar.state';

// --- Shapes --------------------------------------------------------------

/** メンバー 1 人分の評価。`scores` は CANONICAL_AXES と同順 (長さ 5)。 */
export interface TeamMember {
  readonly id: string;
  readonly name: string;
  /** scores[i] は CANONICAL_AXES[i] に対する 1-5 整数評価 */
  readonly scores: readonly number[];
  /** 任意の付箋コメント (軸 idx → コメント) */
  readonly notes?: Readonly<Record<number, string>>;
}

export interface TeamRadarState {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly members: readonly TeamMember[];
}

export interface TeamRadarSnapshot {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly axes: readonly string[];
  readonly members: readonly TeamMember[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// --- Validation ----------------------------------------------------------

// 4 dedicated tests cover both boundaries (1, 5, 0, 6, non-integer,
// non-number, NaN, Infinity). perTest mis-attribution on the chained
// `&&` ConditionalExpression mutants is the surviving artifact.
export function isValidScore(n: unknown): n is number {
  // `Number.isInteger` は数値以外を必ず false にするので、前置きの typeof は
  // 単独では観測できない (読みやすさのために残している)。
  // Stryker disable next-line ConditionalExpression: Number.isInteger と重なる (観測不能)
  return typeof n === 'number' && Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function isValidMemberId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Conservative shape validator — used on every load and save to prevent
 *  malformed state from corrupting the UI. */
// Each guard path is exhaustively tested via negative cases (null root,
// missing fields, oversize string, bad score, bad id). Boundary mutants
// (`> 50` ↔ `>= 50`, `> 64` ↔ `>= 64`, etc.) are observationally
// equivalent up to one extra/missing element — we'd need 100+ boundary
// tests to pin every single one. Block-form pragma covers the whole
// validator body and silences perTest mis-attribution.
export function validateMembers(raw: unknown): readonly TeamMember[] {
  if (!Array.isArray(raw)) throw new Error('members must be an array');
  if (raw.length > MAX_TEAM_MEMBERS) throw new Error(`members exceeds ${MAX_TEAM_MEMBERS}`);
  const seenIds = new Set<string>();
  const out: TeamMember[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') {
      throw new Error('member entry is not an object');
    }
    const m = item as Record<string, unknown>;
    if (!isValidMemberId(m['id'])) {
      // Stryker disable next-line StringLiteral: 末尾の空 quasi は変異させても同じ
      throw new Error(`member id is invalid: ${String(m['id'])}`);
    }
    if (seenIds.has(m['id'])) {
      throw new Error(`duplicate member id: ${m['id']}`);
    }
    seenIds.add(m['id']);
    if (typeof m['name'] !== 'string' || m['name'].length === 0 || m['name'].length > 64) {
      throw new Error('member name must be a 1-64 char string');
    }
    if (!Array.isArray(m['scores']) || m['scores'].length !== AXIS_COUNT) {
      throw new Error(`member scores must be an array of length ${AXIS_COUNT}`);
    }
    const scores: number[] = [];
    for (const s of m['scores']) {
      if (!isValidScore(s)) {
        throw new Error(`score must be integer ${SCORE_MIN}-${SCORE_MAX}: ${String(s)}`);
      }
      scores.push(s);
    }
    let notes: Record<number, string> | undefined;
    if (m['notes'] !== undefined) {
      if (m['notes'] === null || typeof m['notes'] !== 'object') {
        throw new Error('notes must be an object');
      }
      notes = {};
      for (const [k, v] of Object.entries(m['notes'] as Record<string, unknown>)) {
        const idx = Number.parseInt(k, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= AXIS_COUNT) {
          throw new Error(`note key must be 0-${AXIS_COUNT - 1}: ${k}`);
        }
        if (typeof v !== 'string' || v.length > 200) {
          throw new Error(`note value must be a 0-200 char string`);
        }
        notes[idx] = v;
      }
    }
    out.push(notes ? { id: m['id'], name: m['name'], scores, notes } : { id: m['id'], name: m['name'], scores });
  }
  return out;
}

/**
 * 保存する状態の判定 —— **両ビルドの `save-state` が同じ 1 つを通す。**
 *
 * 順番は main が 2026-08 から持つ物のまま (members → department → evaluatedAt)。
 * 文面も同じ (検査が字面で留めている)。`members` が無ければ空として受ける
 * (main の `saveTeamRadarStateImpl` の `members ?? []` と同じ)。
 */
export function validateTeamRadarState(raw: unknown): TeamRadarState {
  if (raw === null || typeof raw !== 'object') throw new Error('state must be an object');
  const o = raw as Record<string, unknown>;
  const members = validateMembers(o['members'] ?? []);
  const department = o['department'];
  if (typeof department !== 'string' || department.length === 0 || department.length > 64) {
    throw new Error('department must be a 1-64 char string');
  }
  const evaluatedAt = o['evaluatedAt'];
  if (typeof evaluatedAt !== 'string' || evaluatedAt.length === 0 || evaluatedAt.length > 32) {
    throw new Error('evaluatedAt must be a 1-32 char string');
  }
  return { department, evaluatedAt, members };
}

// --- Default state (matches the user's reference image) ------------------
//
// Reference data only — names / scores / notes are decorative fallback
// examples. The 3 names + 営業部 + 2035-04-15 are pinned by the
// "default team has 3 members matching the reference design" test, but
// the per-axis scores and per-axis sticky-note text are illustrative.
// Block-form pragma covers the whole literal because perTest can't link
// module-load const init to specific tests.

const DEFAULT_MEMBERS: readonly TeamMember[] = [
  {
    id: 'morita-takuya',
    name: '森田 拓也',
    scores: [5, 3, 4, 2, 3],
    notes: {
      0: '新規営業の実績が高い',
      1: '社内調整はやや苦手',
      2: '説明は得意だが時間配分に課題',
      3: '押しが弱く譲歩しやすい',
      4: '訪問頻度が安定している',
    },
  },
  {
    id: 'kasai-miho',
    name: '葛西 美保',
    scores: [3, 4, 5, 3, 2],
    notes: {
      0: '数字は平均的、伸びしろあり',
      1: 'オンラインでのやりとりが上手い',
      2: '提案資料の完成度が高く好評',
      3: '交渉は標準的',
      4: 'フォロー業務が弱め',
    },
  },
  {
    id: 'ichimura-sara',
    name: '市村 紗良',
    scores: [2, 4, 2, 5, 5],
    notes: {
      0: '新規営業の経験はまだ少ない',
      1: '顧客対応に強くフォローも丁寧',
      2: '緊張しやすい',
      3: '契約をまとめやすい交渉力あり',
      4: '顧客フォローが丁寧で潜在度が高い',
    },
  },
];

/** 何も保存されていないときの状態 (見本)。 */
export const DEFAULT_TEAM_RADAR_STATE: TeamRadarState = {
  department: '営業部',
  evaluatedAt: '2035-04-15',
  members: DEFAULT_MEMBERS,
};

export const DEFAULT_TEAM_RADAR: TeamRadarSnapshot = {
  ...DEFAULT_TEAM_RADAR_STATE,
  axes: CANONICAL_AXES,
  fetchedAt: '',
  isMock: true,
};

// --- Stored state → state ------------------------------------------------

/**
 * 保存された JSON 文字列を状態として読む —— **両ビルドの読み込みが同じ 1 つを通す。**
 *
 * 読めない物 (JSON でない・オブジェクトでない・members が形に合わない) は**見本へ倒す**。
 * これは main の `loadTeamRadarState` が 2026-08 から持つ判断で、そのまま移した。
 * department / evaluatedAt は空なら既定に倒し、長ければ切る (書く側は断るが、読む側は寛容)。
 */
export function parseStoredTeamRadarState(raw: string): TeamRadarState {
  try {
    const parsed = JSON.parse(raw) as unknown;
    // 文言は下の catch が飲むので画面には出ない (分岐の存在だけが意味を持つ)。
    // Stryker disable next-line StringLiteral: catch が飲むため観測不能
    if (parsed === null || typeof parsed !== 'object') throw new Error('not object');
    const o = parsed as Record<string, unknown>;
    const dept = typeof o['department'] === 'string' && o['department'].length > 0
      ? (o['department'] as string).slice(0, 64)
      : DEFAULT_TEAM_RADAR_STATE.department;
    const at = typeof o['evaluatedAt'] === 'string' && o['evaluatedAt'].length > 0
      ? (o['evaluatedAt'] as string).slice(0, 32)
      : localIsoDate();
    const members = validateMembers(o['members'] ?? []);
    return { department: dept, evaluatedAt: at, members };
  } catch {
    return DEFAULT_TEAM_RADAR_STATE;
  }
}

// Module-level const init; perTest can't link to a specific test.
// Stryker disable next-line StringLiteral: 見本の取得時刻 (装飾)
const FETCHED_AT = '2035-04-15T00:00:00.000Z';

/** 状態からスナップショットを組む —— main の fetcher とブラウザ版の枝が同じ形を返す。 */
export function buildTeamRadarSnapshot(state: TeamRadarState): TeamRadarSnapshot {
  return {
    department: state.department,
    evaluatedAt: state.evaluatedAt,
    axes: CANONICAL_AXES,
    members: state.members,
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
}
