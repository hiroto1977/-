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
 *
 * ## パス 120 (2026-09-09) —— 見本と保存した物と読めなかった物を混ぜない
 *
 * 組み立ては常に `isMock: true` だったので、保存した自分のチームも「同梱データ」と刷られ、壊れた保存値は
 * 黙って見本の 3 人に化けた。{@link StoredTeamRadar} で 3 つを分け、`isMock` は見本のときだけ、
 * 読めなかったときは {@link unreadableTeamRadarNote} を画面へ渡す。
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

/**
 * **欄ごとの文字数の天井 —— 画面と検証が同じ 1 つを読む** (2026-09-12 · パス 167)。
 *
 * ここに名前を付けるまで、同じ天井が**画面と検証に別々の字面で**在った
 * (行番号は書かない —— 動くので。欄の名前で引く):
 *
 * ```
 *   氏名      TeamRadarPage  maxLength={64}   ↔ 下の条件 `> 64` と文面 `1-64`
 *   部署      TeamRadarPage  maxLength={64}   ↔ 下の条件 `> 64` と文面 `1-64`
 *   評価時点  TeamRadarPage  maxLength={32}   ↔ 下の条件 `> 32` と文面 `1-32`
 *   付箋      TeamRadarPage  maxLength={200}  ↔ 下の条件 `> 200` と文面 `0-200`
 *                           placeholder 「200 字以内」 ← **同じ行に 3 つ目の写し**
 *   チャート名 TeamRadarPage maxLength={64}   ↔ main/clients/teamradar.ts は `<= 120`
 *   軸名      TeamRadarPage  maxLength={24}   ↔ 検証は無い
 * ```
 *
 * **チャート名は既にずれていた** —— 画面は 64 字で打ち込みを止めるのに、SVG を書き出す
 * `saveTeamRadarSvg` は 120 字まで受ける。「同じ判断を 2 か所に書くと、必ずどれかが先に
 * 古くなる」(`recordEntryLimits.ts` / `proxyEndpoint.ts` と同じ理由) が、この家系では
 * **既に起きていた**。広い方 (120) に揃える —— 狭める向きは、main が 2026-08 から
 * 受けてきた題名を今日から黙って弾くことになる。
 */
export const MAX_MEMBER_NAME_CHARS = 64;
/** 部署名の天井。氏名と同じ数だが**別の判断**なので別の名前を持つ (片方だけ動かせる)。 */
export const MAX_DEPARTMENT_CHARS = 64;
/** 「評価時点」の天井。日付そのものの検査ではない (書式は自由な欄)。 */
export const MAX_EVALUATED_AT_CHARS = 32;
/** 軸ごとの付箋コメントの天井。画面の placeholder もこの数から組む。 */
export const MAX_MEMBER_NOTE_CHARS = 200;
/** 軸の名前の天井。図の外周に並ぶので短い。保存する状態には入らない (下書きにだけ載る)。 */
export const MAX_AXIS_LABEL_CHARS = 24;
/** チャート名 (SVG の題名) の天井。`main/clients/teamradar.ts` の書き出しが同じ物を読む。 */
export const MAX_CHART_TITLE_CHARS = 120;

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
  /**
   * 軸名。**省略可** —— 2026-09-12 (パス 190) までこの欄は無く、画面で付け直した
   * 軸名はブラウザの下書き (localStorage) にしか残らなかった。デスクトップの保存にも
   * 書き出す SVG にも 1 文字も届かず、書き出しは常に `CANONICAL_AXES` を刷っていた
   * (「口はあるが繋がっていない」・パス 118 の形)。
   *
   * 省略されていれば `CANONICAL_AXES` —— 既に保存済みの状態 (この欄を持たない) を
   * そのまま読めるようにするため。件数は `AXIS_COUNT` に固定する: `scores` の長さと
   * 付箋の鍵の上限が同じ数を前提にしているので、軸の**本数**を可変にするのは別の仕事
   * (`clients/teamradar.ts` の冒頭が「拡張は将来課題」と書いている)。
   */
  readonly axes?: readonly string[];
}

export interface TeamRadarSnapshot {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly axes: readonly string[];
  readonly members: readonly TeamMember[];
  readonly fetchedAt: string;
  /** 見本 (まだ無い / 読めなかった) を返しているとき true。保存した物は false (パス 120)。 */
  readonly isMock: boolean;
  /** 保存先から何が読めたか。画面のバッジと注記が読む。 */
  readonly stored: 'saved' | 'none' | 'unreadable';
  /** 読めなかったときの 1 行 (それ以外は null)。 */
  readonly storedNote: string | null;
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
    if (typeof m['name'] !== 'string' || m['name'].length === 0 || m['name'].length > MAX_MEMBER_NAME_CHARS) {
      throw new Error(`member name must be a 1-${MAX_MEMBER_NAME_CHARS} char string`);
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
        if (typeof v !== 'string' || v.length > MAX_MEMBER_NOTE_CHARS) {
          throw new Error(`note value must be a 0-${MAX_MEMBER_NOTE_CHARS} char string`);
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
  if (typeof department !== 'string' || department.length === 0 || department.length > MAX_DEPARTMENT_CHARS) {
    throw new Error(`department must be a 1-${MAX_DEPARTMENT_CHARS} char string`);
  }
  const evaluatedAt = o['evaluatedAt'];
  if (typeof evaluatedAt !== 'string' || evaluatedAt.length === 0 || evaluatedAt.length > MAX_EVALUATED_AT_CHARS) {
    throw new Error(`evaluatedAt must be a 1-${MAX_EVALUATED_AT_CHARS} char string`);
  }
  const rawAxes = o['axes'];
  if (rawAxes === undefined) return { department, evaluatedAt, members };
  if (!Array.isArray(rawAxes) || rawAxes.length !== AXIS_COUNT) {
    throw new Error(`axes must be an array of length ${AXIS_COUNT}`);
  }
  const axes: string[] = [];
  for (const a of rawAxes) {
    if (typeof a !== 'string' || a.length === 0 || a.length > MAX_AXIS_LABEL_CHARS) {
      throw new Error(`axis label must be a 1-${MAX_AXIS_LABEL_CHARS} char string: ${String(a)}`);
    }
    axes.push(a);
  }
  return { department, evaluatedAt, members, axes };
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
  stored: 'none',
  storedNote: null,
};

// --- Stored state → state ------------------------------------------------

/**
 * 保存先から読んだ結果 —— **「保存した」「まだ無い」「読めなかった」を混ぜない** (2026-09-09 · パス 120)。
 *
 * パス 118 までは読めない物を黙って見本へ倒し、組み立ては常に `isMock: true` だった。だから
 *   - 利用者が保存した自分のチームが、更新の直後に「同梱データ」のバッジで刷られ (画面が「作り物」と言う)、
 *   - 壊れた保存値は**見本の 3 人**に化けて、誰も何も言わなかった
 *     (パス 88 の形 —— 読めない保管を「初めまして」に見せる)。
 * 読む側の判断は 1 つにして、画面には 3 つの状態を渡す。
 */
export type StoredTeamRadar =
  | { readonly kind: 'saved'; readonly state: TeamRadarState }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreadable'; readonly reason: string };

/**
 * 保存された文字列 (無ければ null) を読む —— **両ビルドの読み込みが同じ 1 つを通す。**
 *
 * JSON でない・オブジェクトでない・members が判定を通らない物は**理由つきで「読めなかった」**
 * (データを失う形なので黙らない)。department / evaluatedAt は空なら既定に倒し、長ければ切る
 * (書く側は断るが、読む側は寛容 —— 失うのは飾りだけ)。
 */
export function readStoredTeamRadar(raw: string | null): StoredTeamRadar {
  if (raw === null) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: 'unreadable', reason: 'JSON として読めません' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'unreadable', reason: 'オブジェクトではありません' };
  }
  const o = parsed as Record<string, unknown>;
  let members: readonly TeamMember[];
  try {
    members = validateMembers(o['members'] ?? []);
  } catch (e) {
    return { kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) };
  }
  /*
   * **天井は上の検証と同じ定数から読む** (2026-09-12 · パス 174)。
   * ここは 2026-09-12 まで `slice(0, 64)` / `slice(0, 32)` と**数を写して**いた ——
   * 同じモジュールの 100 行上で `validateMembers` / この関数の下の検証が
   * `MAX_DEPARTMENT_CHARS` / `MAX_EVALUATED_AT_CHARS` で**断って**いるのに。
   * 定数を 128 に上げると、検証は 128 字を通すのに読み出しが 64 字へ黙って切る ——
   * **保存した状態が読むたびに短くなる**形だった。
   */
  const dept = typeof o['department'] === 'string' && o['department'].length > 0
    ? o['department'].slice(0, MAX_DEPARTMENT_CHARS)
    : DEFAULT_TEAM_RADAR_STATE.department;
  const at = typeof o['evaluatedAt'] === 'string' && o['evaluatedAt'].length > 0
    ? o['evaluatedAt'].slice(0, MAX_EVALUATED_AT_CHARS)
    : localIsoDate();
  return { kind: 'saved', state: { department: dept, evaluatedAt: at, members } };
}

/** 読めなかったときに画面が刷る 1 行 (両ビルドで同じ文)。 */
export function unreadableTeamRadarNote(reason: string): string {
  return `保存したチームの状態を読めませんでした (${reason})。見本を表示しています。「チーム情報を保存」を押すと画面の内容で上書きされ、元の保存値は戻りません。`;
}

// Module-level const init; perTest can't link to a specific test.
// Stryker disable next-line StringLiteral: 見本の取得時刻 (装飾)
const FETCHED_AT = '2035-04-15T00:00:00.000Z';

/**
 * 読んだ結果からスナップショットを組む —— main の fetcher とブラウザ版の枝が同じ形を返す。
 * **見本を返すときだけ「同梱データ」を名乗る** (`isMock`)。保存した物は利用者の物。
 */
export function buildTeamRadarSnapshot(stored: StoredTeamRadar): TeamRadarSnapshot {
  const state = stored.kind === 'saved' ? stored.state : DEFAULT_TEAM_RADAR_STATE;
  return {
    department: state.department,
    evaluatedAt: state.evaluatedAt,
    // 保存された軸名を使う (無ければ既定の 5 軸)。パス 190 まで固定で刷っていた。
    axes: state.axes ?? CANONICAL_AXES,
    members: state.members,
    fetchedAt: FETCHED_AT,
    isMock: stored.kind !== 'saved',
    stored: stored.kind,
    storedNote: stored.kind === 'unreadable' ? unreadableTeamRadarNote(stored.reason) : null,
  };
}
