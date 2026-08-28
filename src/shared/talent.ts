/**
 * 人材育成 — 判定と定義表。**main とブラウザ版の両方がここを読む。**
 *
 * 最初この一式を `src/main/clients/talent.ts` に置いたが、それだと
 * ブラウザ版 (`web-shim.ts`) から呼べない —— renderer は `src/main` を
 * import できない (`lint:imports` の境界)。teamradar の `save-state` が
 * まさにその形で、main 側は検証するのにブラウザ版だけ素通しになっており、
 * 「揃えるなら src/shared へ出す必要がある」と注記が残っている。
 * 同じ穴を新しく掘らないよう、最初から共有側へ置く。
 *
 * ここに I/O は無い。ファイルも通信も持たないので、両方の実行環境で
 * **同じ関数が同じ答えを返す**。
 *
 * 出典は木下勝寿氏 (株式会社北の達人コーポレーション代表取締役社長) が
 * 著書『チームX』『時間最短化、成果最大化の法則』および YouTube
 * 「北の達人チャンネル」で公開している枠組み。各定義は出典の強さを
 * `source` で持ち、著者側の解説を確認できたもの (`confirmed`) と、
 * 名称のみ確認で語釈が当方の読み解きであるもの (`gloss`) を区別する。
 */

// --- 5つの企業組織病 ---------------------------------------------------

/**
 * 出典の強さ。**3 段**にしてある。
 *
 * 最初は `confirmed | gloss` の 2 段だったが、それだと「第三者の解説で
 * 具体例まで取れているが、著者の原文は見ていない」という状態を表せず、
 * 自分の読み解きと同じ箱に入ってしまう。**精度の違う物を同じ札で配ると、
 * 受け取った側が区別できない。**
 *
 * - `confirmed` … 著者側 (本人の連載・記事) の解説を確認した
 * - `secondary` … 第三者の解説で内容を確認した (著者の原文は未確認)
 * - `gloss`     … 名称のみ確認、語釈は当方の読み解き
 */
export type SourceStrength = 'confirmed' | 'secondary' | 'gloss';

export interface OrganDisease {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly source: SourceStrength;
}

/**
 * 5つの企業組織病。
 *
 * 2026-08-28 に 03〜05 を当たり直した。**それまでの語釈は 3 つとも外していた** ——
 * 名称の字面から推測して書いていたためで、実際の意味とはずれていた。
 * 何をどう間違えていたかは各項に残してある。同じやり方で語釈を足さないための記録。
 */
export const ORGAN_DISEASES: readonly OrganDisease[] = [
  {
    id: 'imprint',
    name: '職務定義の刷り込み誤認',
    summary:
      '職務の定義を実際より「狭い範囲」で認識し、刷り込まれてしまう。鳥のひなが最初に見たものを親と認識し一生変わらないのと同じで、新任時の説明がそのまま効き続ける。',
    source: 'confirmed',
  },
  {
    id: 'model-dependence',
    name: 'お手本依存症',
    summary:
      '失敗を恐れてお手本に依存し、連鎖的な失敗が起きる。最も危険なのは目的のすり替えで、「集客できる広告をつくる」が「上司がOKを出す広告をつくる」に置き換わる。',
    source: 'confirmed',
  },
  {
    // 旧語釈「職務の範囲が、本人の中で少しずつ小さくなっていく」は外していた。
    // 範囲が縮むことより、**成果が落ちた理由を外部要因に帰す**ほうが本体である。
    id: 'shrinking',
    name: '職務の矮小化現象',
    summary:
      '職務の範囲を自分で狭く捉え直し、成果が落ちた理由を外部要因に帰してしまう。例：あるメディアの広告が効かなくなったとき、担当者が「集客が減ったのはそのメディアのユーザーが減ったからで、自分の責任ではない」と考える。',
    source: 'secondary',
  },
  {
    // 旧語釈「数字さえ追えばよいとなり、数字の背後にある意味が失われる」は外していた。
    // 数字を否定する話ではない —— 有能さを認めたうえで**守備範囲を 7 割に限る**という置き方。
    //
    // 2026-08-28 に 2 度直している。1 度目は「測れないものを判断から落とす」まで
    // 詰めたが、**7 割 / 3 割という肝心の構造が抜けていた**。裏取りをもう一度
    // 回して著者の連載記事に当たり、そこで初めて出てきた。
    // 一度直したから正しい、とは限らない。
    id: 'number-worship',
    name: '数字万能病',
    summary:
      '数字は「有能」だが「万能」ではない。デジタル化が進んだ結果、本来は7割の段階までの裏づけを取るサポート的存在であるべき数字が、10割まで判断できる万能な判断基準であるかのように扱われてしまう。克服は、7割までは必ず数値で裏づけを取り、残りの3割は感性・感覚で判断できるようになること。',
    source: 'confirmed',
  },
  {
    // 旧語釈「フォーマットを埋めること自体が目的化する」は別の話だった。
    // 帳票を埋める話ではなく、**勝ちパターンの過度な一般化**である。
    id: 'format-trust',
    name: 'フォーマット過信病',
    summary:
      '成功したテクニックや勝ちパターンを自分のフォーマットとして持つのはよいが、万能の解決策として扱ってしまう。目の前の顧客と商品に効くものだけを使うべきで、プレゼンもテクニックを当てる場ではなく顧客の課題に応える場である。',
    source: 'secondary',
  },
];

const DISEASE_IDS: ReadonlySet<string> = new Set(ORGAN_DISEASES.map((d) => d.id));

/** 1 部署の申告。`diseases` は `ORGAN_DISEASES` の id。 */
export interface DeptReport {
  readonly department: string;
  readonly diseases: readonly string[];
}

export interface DiseaseTally {
  readonly id: string;
  readonly name: string;
  readonly departments: readonly string[];
  /** 2 部署以上で挙がった = 個人ではなく仕組みの問題。 */
  readonly systemic: boolean;
}

export interface OrgDiagnosis {
  readonly tallies: readonly DiseaseTally[];
  /** 仕組みの問題と判定された病。ここが今期の対象になる。 */
  readonly systemic: readonly string[];
  readonly reportedDepartments: number;
}

/**
 * 部署ごとの申告を集計する。
 *
 * **2 部署以上で同じ病が挙がったら `systemic`。** マニュアル 02 章の
 * 「複数の管理職が同じ病に印をつけたなら、それは個人の問題ではなく
 * 仕組みの問題」をそのまま判定にしている。
 *
 * 未知の病 id と、同一部署内の重複は黙って落とす —— 画面から来る値なので
 * 落とすほうが安全で、落としたことが判定を歪めることはない (数が減るだけ)。
 */
export function diagnoseOrg(reports: readonly DeptReport[]): OrgDiagnosis {
  const byDisease = new Map<string, Set<string>>();
  const departments = new Set<string>();

  for (const r of reports) {
    if (typeof r.department !== 'string' || r.department.length === 0) continue;
    departments.add(r.department);
    for (const d of r.diseases) {
      if (!DISEASE_IDS.has(d)) continue;
      const set = byDisease.get(d) ?? new Set<string>();
      set.add(r.department);
      byDisease.set(d, set);
    }
  }

  const tallies = ORGAN_DISEASES.map((disease) => {
    const depts = [...(byDisease.get(disease.id) ?? [])].sort();
    return {
      id: disease.id,
      name: disease.name,
      departments: depts,
      systemic: depts.length >= 2,
    };
  });

  return {
    tallies,
    systemic: tallies.filter((t) => t.systemic).map((t) => t.id),
    reportedDepartments: departments.size,
  };
}

// --- 達成確率100%キープの法則 ------------------------------------------

export interface Initiative {
  readonly name: string;
  /** 達成確率 (%)。0–100。 */
  readonly probability: number;
}

export interface AchievementStatus {
  readonly total: number;
  /** 100% に足りない分。満たしていれば 0。 */
  readonly shortfall: number;
  readonly ok: boolean;
  readonly counted: number;
}

/** 達成確率として受け付ける値か (有限の 0–100)。 */
export function isValidProbability(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * 施策の達成確率を合計し、100% に足りない分を返す。
 *
 * 木下氏の「達成確率100%キープの法則」——**目標を達成し続ける人は、施策の
 * 達成確率の合計が常に 100% になるように設定している**。30% と見込んだ施策が
 * 10% しか出なかったら、足りない 20% 分の施策を足して 100% に戻す。
 *
 * 合計が 100 を超えるのは構わない (超過は不足ではない)。不正な確率の項は
 * 数えない —— `counted` で「何件を数えたか」を返すので、黙って減ったことが
 * 呼び出し側から見える。
 */
export function achievementGap(initiatives: readonly Initiative[]): AchievementStatus {
  let total = 0;
  let counted = 0;
  for (const i of initiatives) {
    if (!isValidProbability(i.probability)) continue;
    total += i.probability;
    counted += 1;
  }
  // 浮動小数の誤差で 99.999… を不足と呼ばないように丸める。
  const rounded = Math.round(total * 100) / 100;
  const shortfall = rounded >= 100 ? 0 : Math.round((100 - rounded) * 100) / 100;
  return { total: rounded, shortfall, ok: shortfall === 0, counted };
}

// --- 登用判定 (絶対にリーダーにしてはいけない人・10ヶ条) ----------------

export interface Disqualifier {
  readonly id: string;
  readonly text: string;
}

/**
 * 10ヶ条の出典。**表ごとに出典の強さを持たせる。**
 *
 * 病だけが `source` を持ち、10ヶ条と STEP は何も持っていなかった。
 * 読む側からは「病は出典が管理されていて、他は不明」に見える —— 実際は
 * どちらも出典があるのに、**在ることを示していない**だけだった。
 * 精度の表示が表ごとにまちまちだと、無印を「弱い」と読むか「強い」と読むかが
 * 人によって割れる。全部の表で同じ札を出す。
 */
export const LEADER_DISQUALIFIERS_SOURCE: SourceStrength = 'confirmed';

/** 4 段階の出典。ダイヤモンド・オンラインの連載 (著者側) で確認。 */
export const SKILL_STEPS_SOURCE: SourceStrength = 'confirmed';

/**
 * 木下氏が挙げる「絶対にリーダーにしてはいけない人10ヶ条」。
 *
 * **能力に関する項目が 1 つも無い。** すべて姿勢と誠実さで、
 * だからこそ実績だけで登用している組織に効く。
 */
export const LEADER_DISQUALIFIERS: readonly Disqualifier[] = [
  { id: 'gives-up', text: 'すぐに諦める' },
  { id: 'excuses', text: 'できない言い訳をする' },
  { id: 'no-urgency', text: '危機感がない' },
  { id: 'blames-external', text: '成果が出ない理由を外部要因にする' },
  { id: 'avoids-duty', text: 'やるべきことを「自分がやらなくていい理由」を見つけてやらない' },
  { id: 'no-apology', text: 'ミスをしても謝らない' },
  { id: 'hides-mistakes', text: 'ミスをしても、バレないようにごまかす' },
  { id: 'slacks-unseen', text: '人が見ていないところでサボる' },
  { id: 'lies', text: 'うそをついてごまかす' },
  { id: 'flees-trouble', text: 'トラブルから逃げる' },
];

const DISQUALIFIER_IDS: ReadonlySet<string> = new Set(LEADER_DISQUALIFIERS.map((d) => d.id));

export interface LeaderFitness {
  readonly eligible: boolean;
  readonly hits: readonly Disqualifier[];
  readonly checked: number;
}

/**
 * 登用の可否。**1 つでも該当したら不可**。
 *
 * 「何個までなら許容」という閾値は置かない。マニュアル 08 章の運用
 * ——「1つでも該当するなら、その人はプレイヤーとして評価し、リーダーには
 * 据えない」——をそのまま実装している。能力の高い該当者ほど組織への
 * マイナスは大きくなるので、閾値を設けると制度の意味が消える。
 */
export function judgeLeaderFitness(flagged: readonly string[]): LeaderFitness {
  const seen = new Set<string>();
  for (const f of flagged) {
    if (DISQUALIFIER_IDS.has(f)) seen.add(f);
  }
  const hits = LEADER_DISQUALIFIERS.filter((d) => seen.has(d.id));
  return { eligible: hits.length === 0, hits, checked: LEADER_DISQUALIFIERS.length };
}

// --- 育成ロードマップ (年代ごとの4つのスキル) ---------------------------

export interface SkillStep {
  readonly step: 1 | 2 | 3 | 4;
  readonly name: string;
  readonly detail: string;
}

export const SKILL_STEPS: readonly SkillStep[] = [
  { step: 1, name: '業務スキル', detail: '実業務を行うスキル。通常 3〜5 年でマスターできる領域。' },
  { step: 2, name: 'チームマネジメントのスキル', detail: '自分ではなく組織・チームを動かして成果を出す。' },
  { step: 3, name: '未知問題の解決スキル', detail: '前例もお手本もない問題を解く。お手本依存症の克服が前提。' },
  { step: 4, name: 'しくみをつくるスキル', detail: '個別の問題解決ではなく、問題が起きない構造をつくる。' },
];

/**
 * 業務スキルの習得目安の上限 (年)。木下氏は「大半の職種のほとんどの業務は
 * 通常 3〜5 年でマスターできる」としている。
 *
 * **境界は「超過」であって「以上」ではない。** 5 年ちょうどは目安の内なので
 * 滞留に数えない。日本語で書くと「5 年以上」と書きたくなるが、それだと
 * 5 年ちょうどを含んでしまい判定が変わる —— 実際、手引き側の文面が一度
 * 「5 年以上」になっていて、実装と食い違っていた (2026-08-28 に気付いて直した)。
 * 文章へ写すときは **「5 年を超えて」** と書くこと。
 */
export const STEP1_MASTERY_YEARS = 5;

export interface LadderMember {
  readonly id: string;
  readonly name: string;
  readonly step: number;
  /** 現在の STEP に留まっている年数。 */
  readonly yearsInStep: number;
}

export interface LadderReview {
  readonly members: readonly LadderMember[];
  /** STEP1 に習得目安を超えて留まっている人。本人ではなく配置と任せ方を疑う。 */
  readonly stalled: readonly LadderMember[];
  readonly byStep: Readonly<Record<number, number>>;
}

const MEMBER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** ロードマップに載せられるメンバーか。 */
export function isValidLadderMember(m: unknown): m is LadderMember {
  if (m === null || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  if (typeof o['id'] !== 'string' || !MEMBER_ID_RE.test(o['id'])) return false;
  if (typeof o['name'] !== 'string' || o['name'].length === 0 || o['name'].length > 64) return false;
  const step = o['step'];
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 4) return false;
  const years = o['yearsInStep'];
  if (typeof years !== 'number' || !Number.isFinite(years) || years < 0 || years > 60) return false;
  return true;
}

/**
 * ロードマップの点検。**STEP1 に習得目安 (5年) を超えて留まっている人**を挙げる。
 *
 * 挙げる目的は評価ではない。木下氏は業務スキルを 3〜5 年でマスターできる
 * 領域としているので、それを大きく超えているなら**本人ではなく配置と
 * 任せ方を疑う**——というのがマニュアル 05 章の読み替えである。
 */
export function reviewLadder(raw: readonly unknown[]): LadderReview {
  const members = raw.filter(isValidLadderMember);
  const byStep: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const m of members) byStep[m.step] = (byStep[m.step] ?? 0) + 1;
  return {
    members,
    stalled: members.filter((m) => m.step === 1 && m.yearsInStep > STEP1_MASTERY_YEARS),
    byStep,
  };
}

// --- 入力の正規化 (画面から来た値を判定へ渡す前に通す) ---------------

/** 部署の申告として受け付けられる形か。 */
export function sanitizeReports(raw: unknown): readonly DeptReport[] {
  if (!Array.isArray(raw)) return [];
  const out: DeptReport[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const dept = o['department'];
    if (typeof dept !== 'string' || dept.length === 0 || dept.length > 64) continue;
    const list = Array.isArray(o['diseases']) ? o['diseases'] : [];
    out.push({
      department: dept,
      diseases: list.filter((d): d is string => typeof d === 'string' && DISEASE_IDS.has(d)),
    });
  }
  return out;
}

/** 施策として受け付けられる形か。 */
export function sanitizeInitiatives(raw: unknown): readonly Initiative[] {
  if (!Array.isArray(raw)) return [];
  const out: Initiative[] = [];
  for (const i of raw) {
    if (i === null || typeof i !== 'object') continue;
    const o = i as Record<string, unknown>;
    const name = o['name'];
    if (typeof name !== 'string' || name.length === 0 || name.length > 128) continue;
    if (!isValidProbability(o['probability'])) continue;
    out.push({ name, probability: o['probability'] });
  }
  return out;
}

// --- 状態とスナップショット (両方の実行形態が同じ物を組む) --------------
//
// 保存先だけが違う。デスクトップ版は `~/.local/business-hub/talent.json`、
// ブラウザ版は `localStorage['servicehub.talent.state.v1']`。
// **読んだ後に何を計算するかは、ここ 1 か所しかない。**
// 2026-08-28 に e2e が捕まえた: ブラウザ版は `fetchSnapshot` に talent の
// 枝が無く `not_implemented` へ落ちていたので、保存はできるのに画面は
// 同梱の空スナップショットのままだった —— 保存した申告が一度も判定に
// 通らない、という「口はあるが繋がっていない」状態。

export interface TalentState {
  readonly reports: readonly DeptReport[];
  readonly initiatives: readonly Initiative[];
  readonly members: readonly LadderMember[];
  readonly updatedAt: string;
}

export const EMPTY_TALENT_STATE: TalentState = {
  reports: [],
  initiatives: [],
  members: [],
  updatedAt: '',
};

/** ブラウザ版の保存先。台帳 (`lint:storage`) に載る鍵はこれ 1 つ。 */
export const TALENT_STORAGE_KEY = 'servicehub.talent.state.v1';

/** どこから来た値でも、判定へ渡す前にこれを通す。 */
export function sanitizeTalentState(raw: unknown): TalentState {
  if (raw === null || typeof raw !== 'object') return EMPTY_TALENT_STATE;
  const o = raw as Record<string, unknown>;
  const updatedAt = o['updatedAt'];
  return {
    reports: sanitizeReports(o['reports']),
    initiatives: sanitizeInitiatives(o['initiatives']),
    members: Array.isArray(o['members']) ? o['members'].filter(isValidLadderMember) : [],
    updatedAt: typeof updatedAt === 'string' ? updatedAt.slice(0, 32) : '',
  };
}

export interface TalentSnapshot {
  readonly diseases: readonly OrganDisease[];
  readonly steps: readonly SkillStep[];
  readonly disqualifiers: readonly Disqualifier[];
  readonly diagnosis: OrgDiagnosis;
  readonly achievement: AchievementStatus;
  readonly ladder: LadderReview;
  readonly initiatives: readonly Initiative[];
  /**
   * 保存されている申告そのもの。`diagnosis.tallies` は病→部署の集計なので、
   * **画面が編集し直すには元の形が要る**。集計から復元すると、病を 1 つも
   * 挙げていない部署が消えるなど情報が落ちる。
   */
  readonly reports: readonly DeptReport[];
  readonly updatedAt: string;
  readonly disqualifiersSource: SourceStrength;
  readonly stepsSource: SourceStrength;
}

/** 保存された状態から画面が出す物を組む。**判定はここでしか走らない。** */
export function buildTalentSnapshot(state: TalentState): TalentSnapshot {
  return {
    diseases: ORGAN_DISEASES,
    steps: SKILL_STEPS,
    disqualifiers: LEADER_DISQUALIFIERS,
    diagnosis: diagnoseOrg(state.reports),
    achievement: achievementGap(state.initiatives),
    ladder: reviewLadder(state.members),
    initiatives: state.initiatives,
    reports: state.reports,
    updatedAt: state.updatedAt,
    disqualifiersSource: LEADER_DISQUALIFIERS_SOURCE,
    stepsSource: SKILL_STEPS_SOURCE,
  };
}
