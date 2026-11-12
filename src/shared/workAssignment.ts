/**
 * **業務の割当と、時間で見た負担** (2026-10-29 · パス 556)。
 *
 * パス 555 の「ひとりひとりの負担」は本人が書いた**体感の負荷 (1〜5) の比**で、勤務時間でも担当業務の数でもない
 * (画面の脚注がそう言う)。担当業務と時間の記録はアプリのどこにも無かった (実測: 24 の collection のどれも
 * 割当・工数の欄を持たない。`goalCoach` の時間は本人 1 人の目標のための物)。ここは**誰に・何を・週何時間**を
 * 1 行ずつ持ち、1 人ずつの合計と、法定労働時間に対する割合・チーム内の比率を出す。
 *
 * 守る物:
 * - **割当の記録が無い人を 0 (余裕) にしない** —— 行は出すが割合を名乗らず (`none`)、比率の分母にも入れない
 *   (パス 555 と同じ約束。記録が無いのは「仕事が無い」ではなく「書いていない」でありうる)。
 * - **名簿から消えた人への割当は黙って捨てない** —— 件数と時間を別に数えて画面が言う (一覧の × が逃げ口)。
 * - **読めない保存値は落として数える** (復元・古い版。型は守らない)。行ごとに落とし、件数を言う。
 * - 法定労働時間は `parameters.ts` の台帳から受け取る (数字を写さない)。超えると言う文は 36 協定 (労働基準法36条)
 *   を名指しする —— 割当は予定であって実績ではないので「この割当どおりに働くと」と言う。
 * - 並びは保管層の順に依らない (時間 → 鍵)。
 */
import { moreThanChars } from './inputCeiling';
import { displayField } from './apiResponse';
import { isFiniteNumber } from './num';
import { readEntryNumber } from './readNumeric';

export const WORK_ASSIGNMENTS_COLLECTION = 'work-assignments';

/** 業務名の天井 (文字)。 */
export const MAX_ASSIGNMENT_TITLE_CHARS = 60;
/** メモの天井 (文字)。 */
export const MAX_ASSIGNMENT_NOTE_CHARS = 200;
/** 1 件の割当の時間の天井 —— 1 週は 168 時間 (事実の上限・打ち間違いの門)。 */
export const HOURS_IN_WEEK = 168;
/**
 * 1 週の法定労働時間 (労働基準法32条1項)。**画面はこの定数を直接読まない** —— `parameters.ts` の
 * `team.weeklyStatutoryHours` が既定値として参照し、設定で上書きできる (特例措置対象事業場は 44 時間)。
 */
export const STATUTORY_WEEKLY_HOURS = 40;
/** 均等な分担に対して、この倍以上を 1 人が負っていたら「偏り」と言う (パス 555 と同じ倍率)。 */
export const ASSIGNMENT_SKEW_RATIO = 1.5;

export interface WorkAssignment extends Record<string, unknown> {
  /** メンバーの鍵 (`memberKeyOf(email)` —— 専属カウンセラーと同じ鍵で結ぶ)。 */
  readonly member: string;
  readonly title: string;
  /** 週あたりの時間 (0 < h ≦ 168)。 */
  readonly hoursPerWeek: number;
  readonly note?: string;
}

/**
 * 画面の欄を割当の記録にする書き手。数は画面と同じ読み手 (`readEntryNumber`) で読み、
 * **空欄は断る** (0 時間の割当は記録する意味が無く、空欄を 0 にすると「打ち忘れ」が「割当なし」に化ける)。
 */
export function parseAssignment(input: { member?: unknown; title?: unknown; hoursPerWeek?: unknown; note?: unknown }): WorkAssignment {
  const member = typeof input.member === 'string' ? input.member.trim() : '';
  if (member === '') throw new Error('割り当てるメンバーを選んでください');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title === '' || moreThanChars(title, MAX_ASSIGNMENT_TITLE_CHARS)) {
    throw new Error(`業務名は 1〜${MAX_ASSIGNMENT_TITLE_CHARS} 文字で入力してください`);
  }
  const hours = readEntryNumber(input.hoursPerWeek);
  if (hours.kind === 'blank') throw new Error('週の時間が未入力です');
  if (hours.kind === 'unreadable') throw new Error('週の時間を数として読めません（例: 8 / 2.5）');
  if (!(hours.value > 0) || hours.value > HOURS_IN_WEEK) {
    throw new Error(`週の時間は 0 より大きく ${HOURS_IN_WEEK} 以下で入力してください`);
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (moreThanChars(note, MAX_ASSIGNMENT_NOTE_CHARS)) throw new Error(`メモは ${MAX_ASSIGNMENT_NOTE_CHARS} 文字までです`);
  return note === '' ? { member, title, hoursPerWeek: hours.value } : { member, title, hoursPerWeek: hours.value, note };
}

/** 保存値を読む。型が合わない・時間が範囲の外の行は `null` (落として数える)。 */
export function sanitizeAssignment(raw: unknown): WorkAssignment | null {
  // 数・文字列などのスカラーは、次の行 (member が文字列か) が落とす —— ここで `typeof` を重ねて見ると、
  // 同じ答えを出す 2 つ目の門になる (変異検査の等価変異・法則 `equivalent-mutant-removes-the-shape`)。
  if (raw === null || raw === undefined || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.member !== 'string' || r.member.trim() === '') return null;
  if (typeof r.title !== 'string') return null;
  if (!isFiniteNumber(r.hoursPerWeek) || !(r.hoursPerWeek > 0) || r.hoursPerWeek > HOURS_IN_WEEK) return null;
  const base = { member: r.member.trim(), title: r.title, hoursPerWeek: r.hoursPerWeek };
  return typeof r.note === 'string' && r.note !== '' ? { ...base, note: r.note } : base;
}

export type AssignmentLevel = 'over' | 'within' | 'none';

export interface AssignmentLoadRow {
  readonly member: string;
  readonly name: string;
  /** 割当の件数。 */
  readonly assignments: number;
  /** 週の合計時間 (小数第 1 位)。 */
  readonly hours: number;
  /** 法定労働時間に対する割合 (%)。割当が無ければ null。 */
  readonly utilizationPct: number | null;
  /** チーム内の比率 (%) = この人の時間 ÷ 割当を持つ全員の時間の合計 × 100。割当が無ければ null。 */
  readonly sharePct: number | null;
  /** 均等 (100 ÷ 割当を持つ人数) との差 (ポイント)。割当が無ければ null。 */
  readonly skewPt: number | null;
  readonly level: AssignmentLevel;
}

export interface AssignmentLoad {
  /** 名簿の全員。時間の多い順 (同じなら鍵の順)。割当の無い人は末尾。 */
  readonly rows: readonly AssignmentLoadRow[];
  /** 割当を持つ人数 (比率の分母)。 */
  readonly counted: number;
  /** 名簿に居る人の割当の合計時間。 */
  readonly totalHours: number;
  /** 均等なら 1 人が負う比率 (%)。割当を持つ人が居なければ null。 */
  readonly evenSharePct: number | null;
  /** 割合に使った法定労働時間 (読めなければ null —— 割合を名乗らない)。 */
  readonly statutoryHours: number | null;
  /** 名簿から消えた人への割当 (集計から外した物)。 */
  readonly orphan: { readonly assignments: number; readonly hours: number };
  /** 読めなかった保存値の件数 (集計から外した物)。 */
  readonly unreadable: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * 1 人ずつの割当の合計と、法定労働時間に対する割合・チーム内の比率。
 * `raw` は保存値そのまま (読めない行はここで落とす) —— 画面が別々に選別すると、
 * 表と断りが違う部分集合を見る (法則 `one-subset-per-answer`)。
 */
export function assignmentLoad(
  raw: readonly unknown[],
  members: readonly { readonly key: string; readonly name: string }[],
  statutoryHours: number,
): AssignmentLoad {
  // 名簿の鍵は 1 人 1 行 (同じ鍵が 2 度来たら先の名前を採る) —— 名簿の保存値に同じメールが 2 件在ると、
  // 同じ人の時間を 2 行に出して比率の合計が 100% を超える。
  const roster = new Map<string, { readonly key: string; readonly name: string }>();
  for (const m of members) if (!roster.has(m.key)) roster.set(m.key, m);
  const byMember = new Map<string, { assignments: number; hours: number }>();
  let unreadable = 0;
  let orphanAssignments = 0;
  let orphanHours = 0;
  for (const r of raw) {
    const a = sanitizeAssignment(r);
    if (a === null) {
      unreadable += 1;
      continue;
    }
    if (!roster.has(a.member)) {
      orphanAssignments += 1;
      orphanHours += a.hoursPerWeek;
      continue;
    }
    const cur = byMember.get(a.member) ?? { assignments: 0, hours: 0 };
    byMember.set(a.member, { assignments: cur.assignments + 1, hours: cur.hours + a.hoursPerWeek });
  }
  const statutory = isFiniteNumber(statutoryHours) && statutoryHours > 0 ? statutoryHours : null;
  const totalHours = [...byMember.values()].reduce((acc, v) => acc + v.hours, 0);
  const counted = byMember.size;
  // 均等の比率。割当を持つ行の中でだけ使うので、そこでは counted ≧ 1 (null の枝は持たない)。
  const evenShare = round1(100 / Math.max(counted, 1));
  const rows: AssignmentLoadRow[] = [...roster.values()].map((m) => {
    const got = byMember.get(m.key);
    if (got === undefined) {
      return { member: m.key, name: m.name, assignments: 0, hours: 0, utilizationPct: null, sharePct: null, skewPt: null, level: 'none' };
    }
    const utilizationPct = statutory === null ? null : round1((got.hours / statutory) * 100);
    const sharePct = round1((got.hours / totalHours) * 100);
    return {
      member: m.key,
      name: m.name,
      assignments: got.assignments,
      hours: round1(got.hours),
      utilizationPct,
      sharePct,
      skewPt: round1(sharePct - evenShare),
      level: statutory !== null && got.hours > statutory ? 'over' : 'within',
    };
  });
  rows.sort((a, b) => {
    const ha = a.level === 'none' ? -1 : a.hours;
    const hb = b.level === 'none' ? -1 : b.hours;
    // 鍵は 1 人 1 行なので等しい鍵は来ない (`< ? -1 : 1` で足りる)。`<` を `<=` にしても同じ答え (等価変異)。
    // Stryker disable next-line EqualityOperator: 名簿は assignmentLoad の頭で鍵ごとに 1 行へ畳むので、比べる 2 行の鍵は必ず違う
    return hb - ha || (a.member < b.member ? -1 : 1);
  });
  return {
    rows,
    counted,
    totalHours: round1(totalHours),
    evenSharePct: counted === 0 ? null : evenShare,
    statutoryHours: statutory,
    orphan: { assignments: orphanAssignments, hours: round1(orphanHours) },
    unreadable,
  };
}

/**
 * 法定労働時間を超える割当の 1 文 (名指し)。超える人が居なければ null。
 * 割当は予定なので「この割当どおりに働くと」と言い、超える分が時間外労働であることと 36 協定を名指しする。
 */
export function overStatutoryNote(load: AssignmentLoad): string | null {
  // 法定労働時間が読めなければ 'over' の行は作られない (`assignmentLoad`) ので、ここで重ねて見ない。
  const over = load.rows.filter((r) => r.level === 'over');
  if (over.length === 0) return null;
  const names = over.map((r) => `${r.name} さん（週 ${r.hours} 時間）`).join('・');
  return `${names}は、この割当どおりに働くと週の法定労働時間（${load.statutoryHours} 時間）を超えます。`
    + '超える分は時間外労働で、36 協定（労働基準法36条）の締結と届出が要ります。割当を見直すか、協定の範囲かを確かめてください。';
}

/** 偏りの 1 文。均等の `ASSIGNMENT_SKEW_RATIO` 倍以上の時間を 1 人が負うときだけ言う (2 人以上で測れる)。 */
export function assignmentImbalanceNote(load: AssignmentLoad): string | null {
  // 1 人では比べる相手が居ない。2 人以上なら、先頭の行は割当を持つ人 (割当の無い人は末尾) で、
  // 均等の比率も在る —— 同じ事実を `=== null` で重ねて見ない (どれも同じ答えを出す門になる)。
  if (load.counted < 2) return null;
  const top = load.rows[0]!;
  const even = load.evenSharePct!;
  if (top.sharePct! < even * ASSIGNMENT_SKEW_RATIO) return null;
  return `${top.name} さんに割当の時間が偏っています（均等なら ${even}% のところ ${top.sharePct}%）。`
    + '渡せる業務を 1 つ選んで、割当の少ない人へ移せないか確かめてください。';
}

/** 集計から外した物の 1 文 (名簿から消えた人への割当・読めない保存値)。どちらも無ければ null。 */
export function excludedAssignmentsNote(load: AssignmentLoad): string | null {
  const parts: string[] = [];
  if (load.orphan.assignments > 0) {
    parts.push(`名簿に居ないメンバーへの割当 ${load.orphan.assignments} 件（週 ${load.orphan.hours} 時間）`);
  }
  if (load.unreadable > 0) parts.push(`読めない割当の記録 ${load.unreadable} 件`);
  if (parts.length === 0) return null;
  return `${parts.join('と')}は集計から外しています。下の割当の一覧の × で消せます。`;
}

/** 一覧と表に出す業務名 (天井つき・文字で数え、切ったら `…`)。保存値は型が守らないので非文字列は空。 */
export function assignmentTitleText(title: unknown): string {
  return displayField(title, MAX_ASSIGNMENT_TITLE_CHARS);
}
