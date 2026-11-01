/**
 * ゴールコーチ — 聞き取り → 逆算のゴール分解 → 批判的な見直し → 毎日のタスク管理。
 * 純ロジック・IO なし (保存と描画は呼び出し側 = ChatbotWidget の責務)。
 *
 * 利用者に見えるのは**会話だけ**で、機能 (ペルソナ別の問い・逆算・見直し・日割り) は
 * この中に隠れている。AI (LLM) は使わない —— 同じ入力には同じ答えを返し、
 * 外へは何も送らない (聞き取った目標・障害・時間は端末の外へ出ない)。
 *
 * 考え方 (利用者の依頼どおり、逆算・俯瞰・客観・論理・合理・批判):
 *   1. **上位の目的 ← ゴール ← マイルストーン ← タスク** の木を作る。目的は利用者が答えた
 *      「それが叶うと何が変わるか」、ゴールは「達成したいこと」。
 *   2. **逆算**: 期限から遡って段階ごとの期日を置く (最終段階が期限、手前の段階ほど早い)。
 *      各マイルストーンは「そのゴールの手前のゴール」で、さらに手前のタスクに分かれる。
 *      タスクは 1 つ 45 分以内 (今日の一手になる大きさ) まで割る。
 *   3. **批判**: 木を作ったら、数字で測れるか・期限は未来か・時間は足りるか・目的は具体的か・
 *      前提が検証されていないかを**自分で疑う** (`critique`)。疑いは利用者へ見せて確かめる。
 *   4. **日々**: 使える時間の範囲で、期日の早い未完了タスクから今日の分を選ぶ (`dailyPlan`)。
 *
 * 保存値は型が守らない (手で直した JSON・古い版) —— `sanitizeCoachState` が欄ごとに読み、
 * 読めない欄は捨てて**黙って別の値にしない** (読めなければ null = 始めからやり直す)。
 */

import type { ServiceId } from '../../shared/serviceId';
import { addIsoDays, isCalendarDate, isoDaysBetween } from '../../shared/isoDate';
import { isFiniteNumber } from '../../shared/num';
import { detectCrisis, detectHarmToOthers, detectDestructiveUrge } from './counseling';

// --- 型 ------------------------------------------------------------------

export type PersonaId = 'owner' | 'freelancer' | 'professional' | 'employee' | 'student' | 'investor' | 'household';

export type CoachPhase = 'persona' | 'interview' | 'review' | 'active';

export type NodeKind = 'purpose' | 'goal' | 'milestone' | 'task';

export type HabitCycle = 'daily' | 'weekly';

/** 「できなかった」の原因 (タスクの割り方が変わる)。 */
export type SplitCause = 'large' | 'time' | 'start';

/** 聞き取りの問い 1 つ (順番どおりに聞く)。 */
export type QuestionKey = 'goal' | 'why' | 'due' | 'hours' | 'measure' | 'blocker';

export interface GoalNode {
  readonly id: number;
  readonly parent: number | null;
  readonly kind: NodeKind;
  readonly title: string;
  /** 期日 (ISO 日付)。目的は null。 */
  readonly due: string | null;
  /** 見込みの所要分 (タスクだけが持つ。それ以外は 0)。 */
  readonly minutes: number;
  readonly done: boolean;
  /** 優先度 (-MAX_PRIORITY〜MAX_PRIORITY・無ければ 0)。高いほど今日の予定の先頭へ寄る。 */
  readonly priority?: number;
  /** 習慣 (繰り返しタスク)。完了にしても `done` は立たず、周期が来るとまた予定へ戻る。 */
  readonly repeat?: HabitCycle;
  /** 最後に完了にした日 (習慣は「今日の分が済んだか」、ほかは 1 週間の振り返りに使う)。 */
  readonly doneOn?: string;
}

export interface CoachState {
  readonly v: 1;
  readonly phase: CoachPhase;
  readonly persona: PersonaId | null;
  readonly answers: Readonly<Partial<Record<QuestionKey, string>>>;
  /** 聞き取りを始めた日 (逆算の起点)。 */
  readonly startedOn: string;
  readonly nodes: readonly GoalNode[];
  readonly nextId: number;
  /** 「できなかった」の原因を聞いている途中のタスク (答えが来たら割って消す)。 */
  readonly splitFor?: number;
}

export interface CoachTurn {
  readonly state: CoachState | null;
  readonly text: string;
  readonly suggestions: readonly string[];
  /** 関連する既存の画面 (会話の中で提案する。利用者が自分で探す必要はない)。 */
  readonly relatedServices: readonly ServiceId[];
}

export interface Critique {
  readonly severity: 'warn' | 'info';
  readonly message: string;
}

// --- 上限 (保存値と入力の天井) ---------------------------------------------

export const MAX_ANSWER_CHARS = 120;
export const MAX_NODES = 200;
const MAX_TITLE_CHARS = 160;
/** 優先度の幅 (±)。これ以上は上げ下げしない。 */
export const MAX_PRIORITY = 3;
/** 習慣にできるタスクの数 (毎日の時間を習慣が食い尽くさないための上限)。 */
export const MAX_HABITS = 5;
/** 割ったタスクの最小の分 (これより小さくは割らない)。 */
export const MIN_SPLIT_MINUTES = 5;
/** 1 つのタスクを割る数の上限。 */
export const MAX_SPLIT_PARTS = 3;
/** 期限として受け取る先の上限 (日)。これより先は日付の打ち間違いとして断る。 */
export const MAX_DUE_DAYS = 3650;
/** 振り返りが数える直近の日数。 */
export const REVIEW_WINDOW_DAYS = 7;
/** 時間の経過率が完了率をこれ (ポイント) より上回ったら「遅れ」と言う。 */
export const LATE_GAP_PCT = 20;
/** 1 つのタスクの上限分 (これを超える見込みは割る)。 */
export const MAX_TASK_MINUTES = 45;
const DEFAULT_DAILY_MINUTES = 60;
const MIN_DAILY_MINUTES = 15;
const MAX_DAILY_MINUTES = 720;
/** 期限までの最短日数 (これより近い期限は延ばして逆算する)。 */
const MIN_HORIZON_DAYS = 7;
/** 逆算の段階数 (マイルストーンの数)。 */
const STAGE_COUNT = 4;

// --- ペルソナ ---------------------------------------------------------------

interface Step {
  readonly title: string;
  readonly minutes: number;
}

interface Stage {
  readonly title: string;
  readonly steps: readonly Step[];
}

interface PersonaDef {
  readonly id: PersonaId;
  readonly label: string;
  readonly blurb: string;
  readonly markers: readonly string[];
  /** 順方向の 4 段階 (最後が期限)。逆算では最後から日付を置く。 */
  readonly stages: readonly [Stage, Stage, Stage, Stage];
  /** 事前検死 (pre-mortem): 失敗するとしたらこの形。 */
  readonly risk: string;
  readonly services: readonly ServiceId[];
}

const s = (title: string, minutes: number): Step => ({ title, minutes });

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'owner',
    label: '経営者・事業主',
    blurb: '売上・利益・資金繰り・採用など、事業の数字を動かしたい',
    markers: ['経営', '社長', '事業主', '会社', '店', '売上', '代表'],
    stages: [
      { title: '現状の数字をつかむ', steps: [s('直近 3 か月の売上と費用を一覧にする', 40), s('一番大きい費用を 3 つ書き出す', 20), s('数字が合わない所を洗い出す', 30)] },
      { title: '効く施策を 1 つに絞る', steps: [s('打ち手の候補を 5 つ書く', 30), s('効果と手間で並べて 1 つ選ぶ', 30), s('やらないことを決める', 15)] },
      { title: '実行して測る', steps: [s('施策の最初の一手を実行する', 45), s('毎週の測定日を決めて記録を始める', 20), s('1 回目の数字を記録する', 20)] },
      { title: '振り返って次の一手を決める', steps: [s('目標との差を数字で出す', 30), s('差の原因を 3 つ挙げて検証する', 40), s('次の期の打ち手を決める', 30)] },
    ],
    risk: '忙しさで測定が止まり、効いたかどうかが分からないまま終わる',
    services: ['kpi', 'business', 'funding', 'tax-accountant'],
  },
  {
    id: 'freelancer',
    label: 'フリーランス・個人事業',
    blurb: '案件・収入・税金・時間の使い方を整えたい',
    markers: ['フリーランス', '個人事業', '副業', '自営', 'ライター', 'デザイナー', 'エンジニア'],
    stages: [
      { title: '収入と時間の実態をつかむ', steps: [s('直近の収入と案件ごとの稼働時間を書く', 40), s('時給換算で低い案件を見つける', 20), s('固定費と税金の見込みを出す', 30)] },
      { title: '伸ばす収入源を決める', steps: [s('継続してくれる客を 3 件挙げる', 20), s('単価か件数のどちらを上げるか決める', 25), s('提案先の候補を 10 件書く', 30)] },
      { title: '営業と納品の型をつくる', steps: [s('提案文のひな形を作る', 45), s('3 件に提案を送る', 45), s('納品の流れをチェックリストにする', 30)] },
      { title: '成果を確かめて整える', steps: [s('目標収入との差を出す', 20), s('受注できた理由と落とした理由を書く', 30), s('次の 3 か月の計画を決める', 40)] },
    ],
    risk: '目先の案件に追われて、営業の時間が確保されないまま収入が先細る',
    services: ['sales', 'tax-accountant', 'templates'],
  },
  {
    id: 'professional',
    label: '士業・専門職',
    blurb: '顧客対応・書類・期限の管理を整えたい',
    markers: ['税理士', '社労士', '弁護士', '司法書士', '行政書士', '会計士', '士業', '診断士', '弁理士'],
    stages: [
      { title: '案件と期限を棚卸しする', steps: [s('進行中の案件と期限を一覧にする', 40), s('期限が近い順に並べて危ない案件を選ぶ', 20), s('顧客ごとの未回答事項を集める', 30)] },
      { title: '型にできる作業を決める', steps: [s('毎回やる作業を 5 つ書き出す', 25), s('ひな形にできる書類を 1 つ選ぶ', 20), s('そのひな形を作る', 45)] },
      { title: '運用に乗せる', steps: [s('ひな形を実案件で 1 回使う', 45), s('期限の確認日を毎週の予定に入れる', 15), s('顧客への連絡の頻度を決める', 20)] },
      { title: '効果を確かめて広げる', steps: [s('所要時間の変化を記録する', 25), s('抜け・ミスが出た所を直す', 40), s('次に型にする作業を決める', 25)] },
    ],
    risk: '繁忙期に期限管理が後回しになり、1 件の漏れが信用に響く',
    services: ['tax-accountant', 'team', 'docstudio'],
  },
  {
    id: 'employee',
    label: '会社員',
    blurb: '仕事の成果・スキル・評価・転職準備を進めたい',
    markers: ['会社員', '社員', '就職', '転職', '昇進', '上司', '同僚', '部署'],
    stages: [
      { title: '現状と期待をそろえる', steps: [s('今期の自分の役割と評価の基準を書く', 30), s('上司に期待値を確認する場を決める', 15), s('現状の強みと足りない点を 3 つずつ書く', 30)] },
      { title: '伸ばす点を 1 つ決める', steps: [s('伸ばす点の候補を挙げて 1 つ選ぶ', 25), s('学ぶ方法と教材を決める', 25), s('毎週の練習時間を予定に入れる', 15)] },
      { title: '実務で試す', steps: [s('小さな仕事で 1 回試す', 45), s('結果を上司か同僚に見てもらう', 30), s('指摘を次の手順に反映する', 30)] },
      { title: '成果を示す', steps: [s('before / after を数字か事実でまとめる', 40), s('評価の場で話す要点を 3 行にする', 20), s('次の目標を決める', 25)] },
    ],
    risk: '日々の業務に押されて、学ぶ時間が毎週削られ続ける',
    services: ['skills', 'calendar', 'emotions'],
  },
  {
    id: 'student',
    label: '学生・受験・資格',
    blurb: '試験・資格・研究・進路の計画を立てたい',
    markers: ['学生', '受験', '試験', '資格', '大学', '高校', '勉強', '卒論', '合格'],
    stages: [
      { title: '範囲と配点をつかむ', steps: [s('試験範囲と配点を一覧にする', 30), s('過去問を 1 回分解いて現在地を知る', 45), s('苦手な分野を 3 つ決める', 20)] },
      { title: '勉強の型を決める', steps: [s('1 日の勉強時間と時間帯を決める', 15), s('分野ごとの教材を 1 冊に絞る', 20), s('週ごとの範囲を割り振る', 30)] },
      { title: '回して定着させる', steps: [s('最初の範囲を 1 周する', 45), s('間違えた問題を集めて解き直す', 40), s('週末に確認テストを解く', 45)] },
      { title: '本番に合わせる', steps: [s('過去問を時間を計って解く', 45), s('点が落ちた原因を分類する', 30), s('直前の 1 週間の計画を決める', 25)] },
    ],
    risk: '序盤に詰め込み、中盤で息切れして復習が止まる',
    services: ['skills', 'calendar', 'emotions'],
  },
  {
    id: 'investor',
    label: '投資・資産形成',
    blurb: '資産の目標・配分・リスクを整えたい',
    markers: ['投資', '資産', '株', '不動産', '投信', 'nisa', 'ニーサ', '運用', 'ideco'],
    stages: [
      { title: '資産と目的を整理する', steps: [s('現在の資産と負債を一覧にする', 40), s('使う時期ごとにお金を分ける', 25), s('許せる値下がり幅を数字で決める', 20)] },
      { title: '方針を文章にする', steps: [s('配分の目安を決める', 30), s('買う・売る・やらない条件を書く', 30), s('毎月の積立額を決める', 15)] },
      { title: '仕組みにして続ける', steps: [s('積立を自動にする', 20), s('見直す日を月 1 回の予定に入れる', 15), s('記録表を作る', 30)] },
      { title: '結果を点検する', steps: [s('配分のずれを確認する', 25), s('手数料と税を確認する', 30), s('方針を見直すか決める', 25)] },
    ],
    risk: '値動きに動揺して方針を破り、安く売って高く買う',
    services: ['stocks', 'real-estate', 'mutual-funds'],
  },
  {
    id: 'household',
    label: '家計・暮らし・家族',
    blurb: '家計・子育て・介護・住まいの段取りを整えたい',
    markers: ['家計', '家族', '子育て', '介護', '引越', '住宅', '結婚', '暮らし', '貯金'],
    stages: [
      { title: '収支と予定をつかむ', steps: [s('直近 3 か月の収入と支出を書く', 40), s('毎月かかる固定費を一覧にする', 25), s('今後 1 年の大きな出費を書く', 25)] },
      { title: '優先順位を決める', steps: [s('家族で大事にしたいことを話し合う', 30), s('削る支出と守る支出を分ける', 25), s('月の貯蓄額の目標を決める', 15)] },
      { title: '仕組みにする', steps: [s('先取りで貯める設定をする', 20), s('契約の見直し先を 1 つ決める', 30), s('月 1 回の家計の確認日を決める', 15)] },
      { title: '続けて直す', steps: [s('目標との差を確認する', 20), s('続かなかった理由を書く', 20), s('次の 3 か月の計画を決める', 25)] },
    ],
    risk: '家族と目標を共有しないまま始め、途中で足並みがそろわなくなる',
    services: ['tax', 'calendar', 'emotions'],
  },
];

const PERSONA_BY_ID = new Map<PersonaId, PersonaDef>(PERSONAS.map((p) => [p.id, p]));

export function personaOf(id: PersonaId): PersonaDef {
  // 型が PersonaId なので必ず在る (表が全員を持つことは検査が見る)。
  return PERSONA_BY_ID.get(id) as PersonaDef;
}

// --- 聞き取りの問い -----------------------------------------------------------

export const QUESTIONS: readonly { readonly key: QuestionKey; readonly ask: string }[] = [
  { key: 'goal', ask: 'いま達成したいことを、ひと言で教えてください。(例: 月の売上を 100 万円にする)' },
  { key: 'why', ask: 'それが叶うと、あなたの何が変わりますか？ なぜそれが大事ですか？' },
  { key: 'due', ask: 'いつまでに達成したいですか？ (例: 2026-12-31 / 3か月後 / 半年後 / 年末)' },
  { key: 'hours', ask: '平日 1 日に、そのために使える時間はどれくらいですか？ (例: 1時間 / 30分)' },
  { key: 'measure', ask: '達成したかどうかは、何の数字や事実で判断しますか？ (例: 月次売上 / 受注 5 件)' },
  { key: 'blocker', ask: 'いま、いちばん進めにくくしているものは何ですか？ (なければ「なし」)' },
];

const QUESTION_KEYS: readonly QuestionKey[] = QUESTIONS.map((q) => q.key);

// --- 入口 (どの言葉でコーチを始めるか) --------------------------------------

export const COACH_ENTRY_MARKERS: readonly string[] = [
  'ゴール設定',
  '目標設定',
  '目標を決め',
  '目標を立て',
  'ゴールを決め',
  'コーチ',
  '今日のタスク',
  '今日の予定',
  'タスク管理',
  '逆算',
];

// 合図は**コーチ固有の言い回し**に絞る —— 「リセット」「一覧」「予定」のような一般語を拾うと、
// 別の依頼 (パスワードのリセット・サービス一覧) をコーチが飲み込む。
const EXIT_MARKERS: readonly string[] = ['コーチをやめ', 'コーチ終了', 'コーチを終了', '目標を消', 'コーチをリセット'];
const RESTART_MARKERS: readonly string[] = ['やり直し', 'コーチをやり直'];
const TODAY_MARKERS: readonly string[] = ['今日の予定', '今日のタスク', '今日やる', 'きょうの予定', '予定を教え'];
const TREE_MARKERS: readonly string[] = ['全体', 'ツリー', '目標を見', 'ゴールを見', '計画を見', '目標一覧'];
const REVIEW_MARKERS: readonly string[] = ['見直して', '見直し', '計画を疑', 'レビューして'];
const DONE_MARKERS: readonly string[] = ['完了', '済み', '済', 'できた', '終わった', '終わり'];
const OK_MARKERS: readonly string[] = ['ok', 'ｏｋ', 'はい', '進め', '開始', 'いいよ', '了解', 'ええ'];
const ADD_MARKERS: readonly string[] = ['追加', '足して', '加えて'];
const HELP_MARKERS: readonly string[] = ['コーチの使い方', 'コーチ 使い方', 'コーチって', 'コーチのヘルプ'];
// 以下の合図もコーチ固有の言い回しに絞る (「振り返り」「習慣」だけの一般語は拾わない)。
const WEEKLY_MARKERS: readonly string[] = ['今週の振り返り', '今週のふりかえり', '週次の振り返り', '週の振り返り', '週次レビュー', '週間レビュー', '1週間の振り返り'];
const FAIL_MARKERS: readonly string[] = ['できなかった', '出来なかった', '終わらなかった', 'やれなかった', '間に合わなかった', '進まなかった'];
const PRIORITY_UP_MARKERS: readonly string[] = ['優先度を上げ', '優先を上げ', '優先度アップ'];
const PRIORITY_DOWN_MARKERS: readonly string[] = ['優先度を下げ', '優先を下げ', '優先度ダウン'];
const HABIT_ON_MARKERS: readonly string[] = ['習慣にする', '習慣にして', '習慣化', '毎日やる', '毎週やる'];
const HABIT_OFF_MARKERS: readonly string[] = ['習慣をやめ', '習慣を外', '習慣にしない', '習慣解除'];
const CANCEL_MARKERS: readonly string[] = ['キャンセル', 'やめておく', '今はいい'];
const SPLIT_CAUSE_MARKERS: Readonly<Record<SplitCause, readonly string[]>> = {
  large: ['大きすぎ', '大きい', '重すぎ', '多すぎ'],
  time: ['時間が', '時間を', '忙し', '取れな'],
  start: ['何から', '始め方', '始められ', '手が付け', '手をつけ', '分からな', 'わからな'],
};
// 「目標を変える: ○○」「期限を変える: ○○」(コロンの後ろが新しい値。コロンが無ければ使い方を案内する)。
const CHANGE_GOAL_HEAD = /(?:目標|ゴール)を(?:変え|かえ|書き換え)/;
const CHANGE_DUE_HEAD = /期限を(?:変え|かえ|延ば|伸ば|のば|ずら|更新)/;
const CHANGE_GOAL_VALUE = /(?:目標|ゴール)を(?:変え|かえ|書き換え)[^:：\n]{0,6}[:：]\s*(.+)$/;
const CHANGE_DUE_VALUE = /期限を(?:変え|かえ|延ば|伸ば|のば|ずら|更新)[^:：\n]{0,6}[:：]\s*(.+)$/;

const containsAny = (haystack: string, needles: readonly string[]): boolean => needles.some((n) => haystack.includes(n));

/** 全角英数を半角にし、小文字にする。 */
const fold = (t: string): string => t.normalize('NFKC').toLowerCase();

/**
 * コーチに渡してよい発話か。**危機・他害・破壊衝動・感情の吐露は渡さない**
 * (呼び出し側はコンシェルジュの寄り添い = カウンセリングへ回す。コーチの質問に
 * 「つらい」と答えた人を、次の質問へ進めてはいけない)。
 */
export function isSafeForCoach(text: string, emotionMarkers: readonly string[]): boolean {
  if (detectCrisis(text) || detectHarmToOthers(text) || detectDestructiveUrge(text)) return false;
  const folded = fold(text);
  return !containsAny(folded, emotionMarkers);
}

/** コーチを始める発話か (状態が無いときだけ使う)。 */
export function isCoachEntry(text: string): boolean {
  return containsAny(fold(text), COACH_ENTRY_MARKERS);
}

// --- 解析 -----------------------------------------------------------------

/** ペルソナを番号か語から決める。分からなければ null。 */
export function detectPersona(text: string): PersonaId | null {
  const t = fold(text).trim();
  const num = /^(\d)\b/.exec(t) ?? /^(\d)(?:番|\.|、|。)?$/.exec(t);
  if (num !== null) {
    const p = PERSONAS[Number(num[1]) - 1];
    if (p !== undefined) return p.id;
  }
  for (const p of PERSONAS) {
    if (p.markers.some((m) => t.includes(fold(m)))) return p.id;
  }
  return null;
}

const KANJI_DIGITS: Readonly<Record<string, number>> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 「3」「３」「三」を数にする (読めなければ null)。 */
function numberOf(raw: string): number | null {
  const t = fold(raw);
  if (/^\d+$/.test(t)) return Number(t);
  const k = KANJI_DIGITS[t];
  return k ?? null;
}

/** 暦に在る `YYYY-MM-DD` か (型の絞り込みを残さない包み —— 呼び先は別の形も読むので)。 */
function isDay(v: string): boolean {
  return isCalendarDate(v);
}

/**
 * 期限を ISO 日付にする。読めるのは ISO 日付・「M月D日」「M/D」(次に来るその日)・
 * 「N日後 / N週間後 / Nか月後 / N年後 / 半年後 / 年末」。読めなければ null
 * (**推測で日付を作らない** —— 違う日を期限にした逆算は、利用者を静かに誤らせる)。
 */
export function parseDue(text: string, today: string): string | null {
  const t = fold(text).trim();
  // 型の絞り込みで `t` を `never` にしないよう、形を先に確かめてから暦の判定を重ねる。
  if (isDay(t)) return t;
  const rel = /(\d+|[一二三四五六七八九十])\s*(日|週間|週|か月|ヶ月|ケ月|カ月|月|年)後/.exec(t);
  if (rel !== null) {
    const n = numberOf(rel[1] ?? '');
    const unit = rel[2] ?? '';
    if (n === null || n <= 0 || n > 3650) return null;
    const days = unit === '日' ? n : unit.startsWith('週') ? n * 7 : unit === '年' ? n * 365 : n * 30;
    return addIsoDays(today, days);
  }
  if (t.includes('半年')) return addIsoDays(today, 182);
  const md = /(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*日?/.exec(t);
  if (md !== null) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    const year = Number(today.slice(0, 4));
    for (const y of [year, year + 1]) {
      const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isCalendarDate(iso) && iso >= today) return iso;
    }
    return null;
  }
  if (t.includes('年末')) {
    const year = Number(today.slice(0, 4));
    const eoy = `${year}-12-31`;
    return eoy >= today ? eoy : `${year + 1}-12-31`;
  }
  return null;
}

/** 1 日に使える分を読む。「1時間」「30分」「1.5時間」「2」(12 以下の数だけなら時間)。読めなければ null。 */
export function parseDailyMinutes(text: string): number | null {
  const t = fold(text);
  const hm = /(\d+(?:\.\d+)?)\s*時間/.exec(t);
  const mm = /(\d+)\s*分/.exec(t);
  let minutes: number | null = null;
  if (hm !== null) minutes = Math.round(Number(hm[1]) * 60) + Number(mm?.[1] ?? '0');
  else if (mm !== null) minutes = Number(mm[1]);
  else {
    const bare = /^(\d+(?:\.\d+)?)$/.exec(t.trim());
    if (bare !== null) {
      const v = Number(bare[1]);
      minutes = v <= 12 ? Math.round(v * 60) : v;
    }
  }
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(MAX_DAILY_MINUTES, Math.max(MIN_DAILY_MINUTES, minutes));
}

const clampText = (v: string, max: number): string => {
  const t = v.replace(/\s+/g, ' ').trim();
  return Array.from(t).length <= max ? t : `${Array.from(t).slice(0, max - 1).join('')}…`;
};

// --- 木の組み立て (逆算) --------------------------------------------------------

function dailyMinutesOf(state: Pick<CoachState, 'answers'>): number {
  return parseDailyMinutes(state.answers.hours ?? '') ?? DEFAULT_DAILY_MINUTES;
}

/**
 * 聞き取りの答えから木を作る (逆算)。
 * 期限 D と今日 T の間 (最短 7 日) を 4 段階に割り、**最後の段階が D・手前の段階ほど早い**。
 * 障害が書かれていれば、最初の段階の先頭に「障害を小さくする」タスクを置く。
 */
export function buildTree(state: CoachState, today: string): CoachState {
  const persona = state.persona === null ? PERSONAS[0] : personaOf(state.persona);
  const p = persona as PersonaDef;
  const goal = clampText(state.answers.goal ?? '', MAX_TITLE_CHARS);
  const why = clampText(state.answers.why ?? '', MAX_TITLE_CHARS);
  const dueRaw = parseDue(state.answers.due ?? '', today) ?? addIsoDays(today, 90) ?? today;
  const span = isoDaysBetween(today, dueRaw) ?? 90;
  const horizon = Math.max(MIN_HORIZON_DAYS, span);
  const due = addIsoDays(today, horizon) ?? dueRaw;

  const nodes: GoalNode[] = [];
  let next = 1;
  const add = (n: Omit<GoalNode, 'id'>): number => {
    const id = next++;
    nodes.push({ id, ...n });
    return id;
  };

  const purposeId = add({ parent: null, kind: 'purpose', title: why === '' ? '(目的が未記入)' : why, due: null, minutes: 0, done: false });
  const goalId = add({ parent: purposeId, kind: 'goal', title: goal === '' ? '(ゴールが未記入)' : goal, due, minutes: 0, done: false });

  p.stages.forEach((stage, i) => {
    // 最後の段階 (i = 3) が期限。手前ほど horizon の 1/4 ずつ早い。
    const offset = Math.floor((horizon * (STAGE_COUNT - 1 - i)) / STAGE_COUNT);
    const stageDue = addIsoDays(due, -offset) ?? due;
    const milestoneId = add({ parent: goalId, kind: 'milestone', title: stage.title, due: stageDue, minutes: 0, done: false });
    if (i === 0) {
      const blocker = clampText(state.answers.blocker ?? '', MAX_TITLE_CHARS);
      if (blocker !== '' && !/^(なし|ない|特になし|無し|ありません)$/.test(fold(blocker))) {
        add({ parent: milestoneId, kind: 'task', title: `「${blocker}」への対処を 1 つ決める`, due: stageDue, minutes: MAX_TASK_MINUTES, done: false });
      }
    }
    for (const step of stage.steps) {
      add({ parent: milestoneId, kind: 'task', title: step.title, due: stageDue, minutes: Math.min(MAX_TASK_MINUTES, step.minutes), done: false });
    }
  });

  return { ...state, nodes, nextId: next };
}

// --- 批判的な見直し ----------------------------------------------------------

const isHabit = (n: GoalNode): boolean => n.repeat !== undefined;

/** 優先度 (欄が無ければ中立 = 0。「割れない値を 0 に倒す」ではなく、任意の欄の既定)。 */
const priorityOf = (n: GoalNode): number => n.priority ?? 0;

/** 目標の達成に数える未完了タスク (習慣は終わらないので数えない)。 */
const openTasks = (nodes: readonly GoalNode[]): GoalNode[] => nodes.filter((n) => n.kind === 'task' && !n.done && !isHabit(n));

/** 習慣の今日の分が残っているか (周期が過ぎていれば残っている)。 */
function habitDue(n: GoalNode, today: string): boolean {
  if (n.repeat === undefined) return false;
  if (n.doneOn === undefined) return true;
  const d = isoDaysBetween(n.doneOn, today);
  return d === null || d >= (n.repeat === 'weekly' ? 7 : 1);
}

/** 開始日から期限までが逆算の最短に満たないか。日付が読めなければ満たない側には倒さない (言わない)。 */
function horizonShort(from: string, to: string): boolean {
  const d = isoDaysBetween(from, to);
  return d !== null && d < MIN_HORIZON_DAYS;
}

/**
 * 木を疑う。**良い所は褒めず、疑う所だけ挙げる** (客観・批判)。
 * 見つからなければ空 = 今の情報の範囲では大きな穴は見当たらない、という意味で、
 * 「完璧」という意味ではない。
 */
export function critique(state: CoachState, today: string): readonly Critique[] {
  const out: Critique[] = [];
  const goalNode = state.nodes.find((n) => n.kind === 'goal');
  const measure = state.answers.measure ?? '';
  const why = state.answers.why ?? '';

  if (!/[0-9０-９]/.test(measure) && !/[0-9０-９]/.test(goalNode?.title ?? '')) {
    out.push({ severity: 'warn', message: '達成の判断に数字がありません。「いつ・いくつ」で測れないと、達成したのかどうかを後から議論することになります。数字か回数に直してください。' });
  }
  if (Array.from(why.trim()).length < 8) {
    out.push({ severity: 'warn', message: '目的が短く、何のためか読み取れません。目的が曖昧だと、忙しくなった週に最初に切り捨てられます。誰の何が変わるのかを具体的に書き直してください。' });
  }
  const dueRaw = parseDue(state.answers.due ?? '', state.startedOn);
  if (dueRaw === null) {
    out.push({ severity: 'warn', message: '期限を日付として読めなかったので、仮に 90 日後で逆算しています。実際の期限を ISO 日付 (2026-12-31) か「3か月後」で教えてください。' });
  } else if (dueRaw < today) {
    out.push({ severity: 'warn', message: `期限 ${dueRaw} はすでに過ぎています。逆算は無効なので、新しい期限を決め直してください。` });
  } else if (horizonShort(state.startedOn, dueRaw)) {
    out.push({ severity: 'info', message: `期限まで ${MIN_HORIZON_DAYS} 日未満だったので、逆算は ${MIN_HORIZON_DAYS} 日に延ばして置いています。本当にその期限が動かせないなら、範囲を削るほうが先です。` });
  }

  // 日付は検証済みの物だけが状態に入る (sanitize / parseDue)。読めなければ「残り日数なし」(-1 → 0) と同じ扱い。
  const daysLeft = Math.max(0, isoDaysBetween(today, goalNode?.due ?? today) ?? -1);
  const workdays = Math.max(1, Math.floor((daysLeft * 5) / 7));
  const needMin = openTasks(state.nodes).reduce((a, n) => a + n.minutes, 0);
  const haveMin = dailyMinutesOf(state) * workdays;
  if (needMin > haveMin) {
    out.push({
      severity: 'warn',
      message: `必要な作業は約 ${Math.round(needMin / 60 * 10) / 10} 時間、期限までに使えるのは約 ${Math.round(haveMin / 60 * 10) / 10} 時間で、足りません。時間を増やすか、範囲を削るか、期限を延ばすかのどれかを選ぶ必要があります。`,
    });
  }

  const blocker = state.answers.blocker ?? '';
  if (blocker !== '' && !/^(なし|ない|特になし|無し|ありません)$/.test(fold(blocker))) {
    out.push({ severity: 'info', message: `「${clampText(blocker, 40)}」は事実ですか、それとも思い込みですか？ 先に小さく試して確かめれば、計画全体を変えずに済むかもしれません。` });
  }
  const p = state.persona === null ? null : personaOf(state.persona);
  if (p !== null) out.push({ severity: 'info', message: `失敗するとしたら: ${p.risk}。この形を避ける仕組み (測定日を予定に入れる・先に時間を確保する) を 1 つ置いてください。` });
  return out;
}

// --- 日々のタスク -------------------------------------------------------------

export interface DailyPlan {
  readonly items: readonly GoalNode[];
  readonly overdue: readonly GoalNode[];
  readonly minutes: number;
  readonly budget: number;
}

/** 今日やる分: 期日の早い未完了タスクから、使える時間に収まる範囲 (最低 1 件)。 */
export function dailyPlan(state: CoachState, today: string): DailyPlan {
  const budget = dailyMinutesOf(state);
  // 習慣は「今日が期日」として並べる (遅れた物の後ろ・期日が先の物の前)。優先度が高い物はさらに先頭へ寄る。
  const dueKey = (n: GoalNode): string => (isHabit(n) ? today : (n.due ?? '9999-12-31'));
  const habits = state.nodes.filter((n) => n.kind === 'task' && habitDue(n, today));
  const tasks = [...openTasks(state.nodes), ...habits].sort((a, b) => {
    const pr = priorityOf(b) - priorityOf(a);
    if (pr !== 0) return pr;
    const d = dueKey(a).localeCompare(dueKey(b));
    return d !== 0 ? d : a.id - b.id;
  });
  const items: GoalNode[] = [];
  let used = 0;
  for (const t of tasks) {
    if (items.length > 0 && used + t.minutes > budget) break;
    items.push(t);
    used += t.minutes;
  }
  const overdue = tasks.filter((t) => !isHabit(t) && t.due !== null && t.due < today);
  return { items, overdue, minutes: used, budget };
}

// --- 表示 -------------------------------------------------------------------

const habitLabel = (c: HabitCycle): string => (c === 'weekly' ? ' 🔁毎週' : ' 🔁毎日');

const ICON: Readonly<Record<NodeKind, string>> = { purpose: '🌱', goal: '🎯', milestone: '🏁', task: '☐' };

export function renderTree(state: CoachState): string {
  const lines: string[] = [];
  const children = (id: number): GoalNode[] => state.nodes.filter((n) => n.parent === id);
  const walk = (n: GoalNode, depth: number): void => {
    const mark = n.kind === 'task' ? (n.done ? '☑' : '☐') : ICON[n.kind];
    const due = n.due === null ? '' : ` (〜${n.due})`;
    const min = n.kind === 'task' ? ` ${n.minutes}分` : '';
    const tags = n.kind === 'task' ? `${n.repeat === undefined ? '' : habitLabel(n.repeat)}${priorityOf(n) > 0 ? ' ⬆' : priorityOf(n) < 0 ? ' ⬇' : ''}` : '';
    lines.push(`${'  '.repeat(depth)}${mark} ${n.kind === 'task' ? `#${n.id} ` : ''}${n.title}${due}${min}${tags}`);
    for (const c of children(n.id)) walk(c, depth + 1);
  };
  for (const root of state.nodes.filter((n) => n.parent === null)) walk(root, 0);
  return lines.join('\n');
}

function renderPlan(state: CoachState, today: string): string {
  const plan = dailyPlan(state, today);
  if (plan.items.length === 0) return '未完了のタスクはありません。目標は達成済みです。新しい目標を決めますか？';
  const head = `📅 ${today} の予定 (使える時間 ${plan.budget} 分のうち ${plan.minutes} 分)`;
  const body = plan.items
    .map((t) => `☐ #${t.id} ${t.title} (${t.minutes}分・${t.repeat === undefined ? `〜${t.due ?? '期日なし'}` : habitLabel(t.repeat).trim()})${priorityOf(t) > 0 ? ' ⬆' : ''}`)
    .join('\n');
  const late = plan.overdue.length > 0 ? `\n\n⚠ 期日を過ぎた未完了が ${plan.overdue.length} 件あります。見直し (「見直して」) で時間・範囲・期限を決め直してください。` : '';
  return `${head}\n${body}${late}\n\n終わったら「#番号 完了」と教えてください。`;
}

function renderCritique(items: readonly Critique[]): string {
  if (items.length === 0) return '今の情報の範囲では、大きな穴は見当たりません。';
  return items.map((c) => `${c.severity === 'warn' ? '⚠' : '💭'} ${c.message}`).join('\n');
}

const personaMenu = (): string => PERSONAS.map((p, i) => `${i + 1}. ${p.label} — ${p.blurb}`).join('\n');

// --- 会話の 1 手 -----------------------------------------------------------------

const turn = (state: CoachState | null, text: string, suggestions: readonly string[], relatedServices: readonly ServiceId[] = []): CoachTurn => ({
  state,
  text,
  suggestions,
  relatedServices,
});

export function newCoachState(today: string): CoachState {
  return { v: 1, phase: 'persona', persona: null, answers: {}, startedOn: today, nodes: [], nextId: 1 };
}

function nextQuestion(state: CoachState): (typeof QUESTIONS)[number] | null {
  for (const q of QUESTIONS) {
    if (state.answers[q.key] === undefined) return q;
  }
  return null;
}


// --- 会話の拡張: 目標・期限の変更 / 優先度 / 習慣 / 振り返り / できなかった --------------------
// どれも状態を純関数で書き換えるだけ (AI・網・保存は使わない)。不変条件 (MAX_NODES・
// MAX_TASK_MINUTES・MAX_ANSWER_CHARS) は呼ぶ側に頼らず、ここで守る。

const taskIdIn = (t: string): number | null => {
  const m = /#\s*(\d{1,3})/.exec(t);
  return m === null ? null : Number(m[1]);
};

/** 保留 (`splitFor`) を外した状態 (任意の欄を残さず組み直す)。 */
const withoutPending = (state: CoachState): CoachState => ({
  v: 1,
  phase: state.phase,
  persona: state.persona,
  answers: state.answers,
  startedOn: state.startedOn,
  nodes: state.nodes,
  nextId: state.nextId,
});

/** 期限として受けてよいか。断る理由 (利用者へ言う文) を返し、受けてよければ null。 */
function dueRefusal(due: string, today: string): string | null {
  if (due < today) return `${due} はすでに過ぎています。これから先の日付で教えてください。`;
  const span = isoDaysBetween(today, due);
  if (span === null || span > MAX_DUE_DAYS) return `${due} は ${MAX_DUE_DAYS} 日 (約 10 年) より先です。日付の打ち間違いかもしれないので、もう一度教えてください。`;
  return null;
}

/**
 * 答えを変えて木を作り直す。**完了した物・優先度・習慣・自分で足した物は引き継ぐ**
 * (作り直しで進捗を失わせない)。割ったタスクは元のタスクへ戻し、部品がすべて完了なら元も完了とする。
 * 作り直した木が上限 (`MAX_NODES`) を超えるなら null (切らずに断る)。
 */
function rebuildKeeping(state: CoachState, today: string): { state: CoachState; keptDone: number; keptExtra: number } | null {
  const fresh = buildTree({ ...withoutPending(state), nodes: [], nextId: 1 }, today);
  const oldTasks = state.nodes.filter((n) => n.kind === 'task');
  const used = new Set<number>();
  let keptDone = 0;
  const merged: GoalNode[] = fresh.nodes.map((n) => {
    if (n.kind !== 'task') return n;
    const same = oldTasks.find((o) => !used.has(o.id) && o.title === n.title);
    if (same !== undefined) {
      used.add(same.id);
      if (same.done) keptDone += 1;
      return {
        ...n,
        done: same.done,
        ...(same.priority === undefined ? {} : { priority: same.priority }),
        ...(same.repeat === undefined ? {} : { repeat: same.repeat }),
        ...(same.doneOn === undefined ? {} : { doneOn: same.doneOn }),
      };
    }
    // 割ったタスクの部品が全部完了なら、元のタスクも完了として引き継ぐ。
    const parts = oldTasks.filter((o) => !used.has(o.id) && o.title.startsWith(`${n.title}（`));
    if (parts.length > 0) {
      for (const o of parts) used.add(o.id);
      if (parts.every((o) => o.done)) {
        keptDone += 1;
        const last = parts.map((o) => o.doneOn).filter((d): d is string => d !== undefined).sort().pop();
        return { ...n, done: true, ...(last === undefined ? {} : { doneOn: last }) };
      }
    }
    return n;
  });
  const extras = oldTasks.filter((o) => !used.has(o.id));
  const anchor = merged.find((n) => n.kind === 'milestone');
  if (anchor === undefined || merged.length + extras.length > MAX_NODES) return null;
  let next = fresh.nextId;
  for (const o of extras) {
    merged.push({ ...o, id: next, parent: anchor.id, due: anchor.due });
    next += 1;
  }
  return { state: { ...withoutPending(fresh), nodes: merged, nextId: next }, keptDone, keptExtra: extras.length };
}

function changedPlanTurn(before: CoachState, answers: CoachState['answers'], today: string, head: string, related: readonly ServiceId[]): CoachTurn {
  const state: CoachState = { ...before, answers };
  const r = rebuildKeeping(state, today);
  if (r === null) {
    return turn(before, `計画を作り直すと大きくなりすぎます (上限 ${MAX_NODES})。完了した物を整理するか、「やり直し」で作り直してください。`, ['全体を見せて', 'やり直し'], related);
  }
  const carried = `完了済みの ${r.keptDone} 件と、自分で足した・割った ${r.keptExtra} 件は引き継ぎました。`;
  const tail = r.state.phase === 'review' ? '\n\nこの計画で進めてよければ「進めて」と答えてください。' : '';
  return turn(
    r.state,
    `${head}\n${carried}\n\n${renderTree(r.state)}\n\n--- 自分で疑ってみた点 ---\n${renderCritique(critique(r.state, today))}${tail}`,
    r.state.phase === 'review' ? ['進めて', '見直して', 'やり直し'] : ['今日の予定', '全体を見せて', '見直して'],
    related,
  );
}

/** 「目標を変える: ○○」「期限を変える: ○○」(review / active)。コロンが無ければ使い方を案内する。 */
function changeTurn(state: CoachState, text: string, today: string, related: readonly ServiceId[]): CoachTurn | null {
  const goalV = CHANGE_GOAL_VALUE.exec(text);
  if (goalV !== null && goalV[1] !== undefined) {
    const value = clampText(goalV[1], MAX_ANSWER_CHARS);
    if (value === (state.answers.goal ?? '')) return turn(state, 'いまの目標と同じです。変えていません。', ['今日の予定', '全体を見せて'], related);
    return changedPlanTurn(state, { ...state.answers, goal: value }, today, `🎯 目標を「${value}」に変えて、期限から逆算し直しました。`, related);
  }
  const dueV = CHANGE_DUE_VALUE.exec(text);
  if (dueV !== null && dueV[1] !== undefined) {
    const due = parseDue(dueV[1], today);
    if (due === null) {
      return turn(state, '期限を日付として読めませんでした。ISO 日付 (2026-12-31)・「3か月後」・「半年後」・「年末」のどれかで教えてください。\n(日付は推測せず、読めたものだけを使います)', ['3か月後', '半年後', '年末'].map((d) => `期限を変える: ${d}`), related);
    }
    const refusal = dueRefusal(due, today);
    if (refusal !== null) return turn(state, refusal, [], related);
    if (due === state.answers.due) return turn(state, 'いまの期限と同じです。変えていません。', ['今日の予定', '全体を見せて'], related);
    return changedPlanTurn(state, { ...state.answers, due }, today, `📆 期限を ${due} に変えて、逆算し直しました。`, related);
  }
  const t = fold(text);
  if (CHANGE_GOAL_HEAD.test(t) || CHANGE_DUE_HEAD.test(t)) {
    return turn(state, '変える内容をコロンの後ろに書いてください。\n例: 「目標を変える: 月の売上を 120 万円にする」「期限を変える: 2027-03-31」(「半年後」も読めます)', ['期限を変える: 半年後', '全体を見せて'], related);
  }
  return null;
}

/** 優先度の上げ下げ (`#番号` 必須)。幅は ±MAX_PRIORITY。 */
function priorityTurn(state: CoachState, t: string, delta: 1 | -1, related: readonly ServiceId[]): CoachTurn {
  const id = taskIdIn(t);
  if (id === null) return turn(state, '番号を付けて教えてください。例: 「#3 優先度を上げて」(番号は「全体を見せて」で分かります)', ['全体を見せて'], related);
  const node = state.nodes.find((n) => n.id === id && n.kind === 'task');
  if (node === undefined) return turn(state, `#${id} というタスクは見当たりません。「全体を見せて」で番号を確かめてください。`, ['全体を見せて'], related);
  if (node.done) return turn(state, `#${id} はすでに完了しているので、優先度は変えません。`, ['今日の予定'], related);
  const next = priorityOf(node) + delta;
  if (Math.abs(next) > MAX_PRIORITY) return turn(state, `#${id} はすでに${delta > 0 ? '最上位' : '最下位'}です (幅は ±${MAX_PRIORITY})。`, ['今日の予定'], related);
  const nodes = state.nodes.map((n) => {
    if (n.id !== id) return n;
    const { priority: _drop, ...rest } = n;
    return next === 0 ? rest : { ...rest, priority: next };
  });
  return turn({ ...state, nodes }, `#${id} 「${node.title}」の優先度を${delta > 0 ? '上げ' : '下げ'}ました (${next > 0 ? '+' : ''}${next})。今日の予定では、優先度の高い物が期日より先に並びます。`, ['今日の予定', '全体を見せて'], related);
}

/** 習慣にする / やめる (`#番号` 必須)。習慣は終わらず、周期が来るとまた予定へ戻る。 */
function habitTurn(state: CoachState, t: string, on: boolean, related: readonly ServiceId[]): CoachTurn {
  const id = taskIdIn(t);
  if (id === null) return turn(state, '番号を付けて教えてください。例: 「#3 習慣にする」「#3 毎週やる」「#3 習慣をやめる」', ['全体を見せて'], related);
  const node = state.nodes.find((n) => n.id === id && n.kind === 'task');
  if (node === undefined) return turn(state, `#${id} というタスクは見当たりません。「全体を見せて」で番号を確かめてください。`, ['全体を見せて'], related);
  if (!on) {
    if (node.repeat === undefined) return turn(state, `#${id} は習慣ではありません。`, ['全体を見せて'], related);
    const nodes = state.nodes.map((n) => {
      if (n.id !== id) return n;
      const { repeat: _r, doneOn: _d, ...rest } = n;
      return rest;
    });
    return turn({ ...state, nodes }, `🔁 #${id} 「${node.title}」を習慣から外し、ふつうのタスク (未完了) に戻しました。`, ['今日の予定', '全体を見せて'], related);
  }
  if (node.repeat !== undefined) return turn(state, `#${id} はすでに習慣です。`, ['今日の予定'], related);
  if (node.done) return turn(state, `#${id} はすでに完了しています。習慣にするのは未完了のタスクだけです。`, ['全体を見せて'], related);
  if (state.nodes.filter((n) => n.repeat !== undefined).length >= MAX_HABITS) {
    return turn(state, `習慣は ${MAX_HABITS} 件までです (毎日の時間を習慣が占めないため)。不要な習慣を「#番号 習慣をやめる」で外してください。`, ['全体を見せて'], related);
  }
  const cycle: HabitCycle = t.includes('毎週') || t.includes('週1') ? 'weekly' : 'daily';
  const nodes = state.nodes.map((n) => (n.id === id ? { ...n, repeat: cycle } : n));
  return turn(
    { ...state, nodes },
    `🔁 #${id} 「${node.title}」を${cycle === 'weekly' ? '毎週' : '毎日'}の習慣にしました。完了にしても、${cycle === 'weekly' ? '7 日後' : '翌日'}にまた今日の予定へ戻ります。習慣は目標の達成件数には数えません。外すときは「#${id} 習慣をやめる」。`,
    ['今日の予定', '全体を見せて'],
    related,
  );
}

export interface WeeklyReview {
  /** 習慣を除くタスクの総数と完了数。 */
  readonly total: number;
  readonly done: number;
  readonly donePct: number | null;
  /** 作業量 (分) で見た完了率。 */
  readonly minutesPct: number | null;
  /** 直近 REVIEW_WINDOW_DAYS 日に完了した数と、完了日が記録されていない完了の数。 */
  readonly doneThisWeek: number;
  readonly doneUndated: number;
  readonly overdue: readonly GoalNode[];
  /** 開始日から期限までのうち、今日までに経過した割合 (読めなければ null)。 */
  readonly elapsedPct: number | null;
  readonly habits: number;
  readonly habitsDoneToday: number;
  /** 利用者へ返す批判的な問い (1 つだけ)。 */
  readonly question: string;
}

/** 割合 (%)。分母が 0 のときは割れないので null (0% と言わない)。 */
const pct = (a: number, b: number): number | null => (b <= 0 ? null : Math.round((a * 100) / b));
const pctText = (v: number | null): string => (v === null ? '—' : `${v}%`);

/** 今週の振り返り: 完了率・遅れ・時間の経過を数字で言い、疑う問いを**1 つだけ**返す (客観・批判)。 */
export function weeklyReview(state: CoachState, today: string): WeeklyReview {
  const tasks = state.nodes.filter((n) => n.kind === 'task' && !isHabit(n));
  const done = tasks.filter((n) => n.done);
  const sum = (xs: readonly GoalNode[]): number => xs.reduce((a, n) => a + n.minutes, 0);
  const recent = done.filter((n) => {
    const d = n.doneOn === undefined ? null : isoDaysBetween(n.doneOn, today);
    return d !== null && d >= 0 && d < REVIEW_WINDOW_DAYS;
  });
  const overdue = openTasks(state.nodes)
    .filter((n) => n.due !== null && n.due < today)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.id - b.id);
  const goalDue = state.nodes.find((n) => n.kind === 'goal')?.due ?? null;
  const spanDays = goalDue === null ? null : isoDaysBetween(state.startedOn, goalDue);
  const gone = isoDaysBetween(state.startedOn, today);
  const elapsedPct = spanDays === null || gone === null || spanDays <= 0 ? null : Math.min(100, Math.max(0, Math.round((gone * 100) / spanDays)));
  const habits = state.nodes.filter((n) => n.kind === 'task' && isHabit(n));
  const donePct = pct(done.length, tasks.length);
  const open = tasks.length - done.length;

  let question: string;
  const first = overdue[0];
  if (first !== undefined) {
    question = `期日を過ぎた「${clampText(first.title, 40)}」(〜${first.due ?? ''}) は、やらないと決めたのですか、それとも着手できなかったのですか？ 着手できなかったなら「#${first.id} できなかった」と教えてください。原因を 1 つ聞いて、小さく割って組み直します。`;
  } else if (tasks.length === 0) {
    question = '計画にタスクがありません。このままでは今日やることが決まりません。何から始めるか、「追加: ○○」で 1 つ足してください。';
  } else if (open > 0 && recent.length === 0 && gone !== null && gone >= REVIEW_WINDOW_DAYS) {
    question = `直近 ${REVIEW_WINDOW_DAYS} 日に完了したタスクは 0 件です。最初の一手を止めているのは、タスクの大きさ・時間・始め方のどれですか？ 「#番号 できなかった」と答えると、小さく割ります。`;
  } else if (elapsedPct !== null && donePct !== null && elapsedPct - donePct > LATE_GAP_PCT) {
    question = `期間の ${elapsedPct}% が過ぎたのに、完了は ${donePct}% です。このペースで期限に間に合うと言える根拠は何ですか？ 根拠が言えないなら、範囲を削るか期限を延ばす (「期限を変える: ○○」) 判断が先です。`;
  } else {
    question = '進みは今のところ遅れていません。ただ、順調な理由は来週も再現できる物ですか、それとも今週だけの事情ですか？ 達成の判断に使う数字 (聞き取りの「何で判断するか」) で実際に確かめましたか？';
  }
  return {
    total: tasks.length,
    done: done.length,
    donePct,
    minutesPct: pct(sum(done), sum(tasks)),
    doneThisWeek: recent.length,
    doneUndated: done.filter((n) => n.doneOn === undefined).length,
    overdue,
    elapsedPct,
    habits: habits.length,
    habitsDoneToday: habits.filter((n) => n.doneOn === today).length,
    question,
  };
}

function weeklyTurn(state: CoachState, today: string, related: readonly ServiceId[]): CoachTurn {
  const r = weeklyReview(state, today);
  const overdueIds = r.overdue.slice(0, 3).map((n) => `#${n.id}`).join('・');
  const lines = [
    `📊 今週の振り返り (${today} 時点・数字だけで言います)`,
    `・完了 ${r.done} / ${r.total} 件 (${pctText(r.donePct)})・作業量 (分) では ${pctText(r.minutesPct)}`,
    `・直近 ${REVIEW_WINDOW_DAYS} 日の完了: ${r.doneThisWeek} 件${r.doneUndated > 0 ? ` (完了日が記録されていない完了が ${r.doneUndated} 件あります)` : ''}`,
    `・期日を過ぎた未完了: ${r.overdue.length} 件${r.overdue.length > 0 ? ` (${overdueIds}${r.overdue.length > 3 ? ' ほか' : ''})` : ''}`,
    r.elapsedPct === null ? '・期間の経過: 日付を読めないので算出していません' : `・期間の経過: ${r.elapsedPct}%${r.donePct === null ? '' : ` (完了率との差 ${r.elapsedPct - r.donePct} ポイント)`}`,
  ];
  if (r.habits > 0) lines.push(`・習慣: ${r.habits} 件 (今日の分が済んだ物 ${r.habitsDoneToday} 件)`);
  lines.push('', `❓ ${r.question}`);
  const firstLate = r.overdue[0];
  return turn(state, lines.join('\n'), firstLate !== undefined ? [`#${firstLate.id} できなかった`, '今日の予定'] : ['今日の予定', '見直して'], related);
}

/** 割る数 (最小 MIN_SPLIT_MINUTES 分・最大 MAX_SPLIT_PARTS)。割れなければ null。 */
export function splitParts(minutes: number): number | null {
  const n = Math.min(MAX_SPLIT_PARTS, Math.floor(minutes / MIN_SPLIT_MINUTES));
  return n >= 2 ? n : null;
}

/** 割ったあとの各部の分。合計は元の分と一致し、どれも MIN_SPLIT_MINUTES 以上。 */
export function splitMinutes(minutes: number, parts: number, cause: SplitCause): number[] {
  const head = cause === 'start' ? MIN_SPLIT_MINUTES : 0;
  const rest = minutes - head;
  const count = cause === 'start' ? parts - 1 : parts;
  const base = Math.floor(rest / count);
  // 割り切れない分は最初の部へ寄せる (合計を元の分に保つ)。
  const out = [base + (rest - base * count), ...Array.from({ length: count - 1 }, () => base)];
  return cause === 'start' ? [head, ...out] : out;
}

const SPLIT_CAUSES: readonly SplitCause[] = ['large', 'time', 'start'];

/** 発話から原因を読む (「1」〜「3」または言い回し)。読めなければ null。 */
export function parseSplitCause(text: string): SplitCause | null {
  const t = fold(text).trim();
  const num = /^([1-3])\s*(?:番|\.|、|。)?$/.exec(t);
  if (num !== null) return SPLIT_CAUSES[Number(num[1]) - 1] ?? null;
  for (const c of SPLIT_CAUSES) {
    if (containsAny(t, SPLIT_CAUSE_MARKERS[c])) return c;
  }
  return null;
}

const CAUSE_ASK = '原因はどれに近いですか？ 番号か言葉で教えてください。(やめるときは「キャンセル」)\n1. 大きすぎた\n2. 時間が取れなかった\n3. 何から始めるか分からなかった';

const CAUSE_LABEL: Readonly<Record<SplitCause, string>> = { large: '大きすぎた', time: '時間が取れなかった', start: '何から始めるか分からなかった' };

/** 「できなかった」: 対象を決め、原因を 1 つ聞く (原因が同じ発話にあればすぐ割る)。 */
function failTurn(state: CoachState, text: string, today: string, related: readonly ServiceId[]): CoachTurn {
  const plan = dailyPlan(state, today);
  const id = taskIdIn(text) ?? plan.overdue[0]?.id ?? plan.items.find((n) => !isHabit(n))?.id ?? null;
  if (id === null) return turn(state, 'どのタスクか分かりませんでした。「#番号 できなかった」と教えてください。(番号は「全体を見せて」で分かります)', ['全体を見せて'], related);
  const node = state.nodes.find((n) => n.id === id && n.kind === 'task');
  if (node === undefined) return turn(state, `#${id} というタスクは見当たりません。「全体を見せて」で番号を確かめてください。`, ['全体を見せて'], related);
  if (node.done) return turn(withoutPending(state), `#${id} はすでに完了しています。`, ['今日の予定'], related);
  if (isHabit(node)) return turn(withoutPending(state), `#${id} は習慣なので割りません。続かないなら、時間を短くするか「#${id} 習慣をやめる」で外してください。`, ['全体を見せて'], related);
  if (splitParts(node.minutes) === null) {
    return turn(withoutPending(state), `#${id} 「${node.title}」は ${node.minutes} 分で、これ以上は割れません (最小 ${MIN_SPLIT_MINUTES} 分)。割るより、「#${id} 優先度を上げて」今日の最初に置くか、「見直して」で時間が足りているか確かめてください。`, ['今日の予定', '見直して'], related);
  }
  const cause = parseSplitCause(text);
  if (cause !== null) return splitTurn(state, id, cause, related);
  return turn({ ...withoutPending(state), splitFor: id }, `#${id} 「${node.title}」(${node.minutes}分) がうまく進まなかったのですね。\n${CAUSE_ASK}`, ['1', '2', '3'], related);
}

function splitTurn(state: CoachState, id: number, cause: SplitCause, related: readonly ServiceId[]): CoachTurn {
  const node = state.nodes.find((n) => n.id === id && n.kind === 'task');
  const parts = node === undefined ? null : splitParts(node.minutes);
  if (node === undefined || parts === null || node.done || isHabit(node)) return turn(withoutPending(state), `#${id} は割れません。「全体を見せて」で確かめてください。`, ['全体を見せて'], related);
  if (state.nodes.length + parts - 1 > MAX_NODES) return turn(withoutPending(state), `計画が大きくなりすぎていて割れません (上限 ${MAX_NODES})。完了した物を整理してください。`, ['全体を見せて'], related);
  const mins = splitMinutes(node.minutes, parts, cause);
  const base = clampText(node.title, MAX_TITLE_CHARS - 24);
  const titles = mins.map((_m, i) => {
    if (cause === 'start') return i === 0 ? `${base}（最初の一歩: 何をやるかを 1 行で書く）` : `${base}（${i}/${parts - 1}）`;
    return cause === 'time' ? `${base}（短く ${i + 1}/${parts}）` : `${base}（${i + 1}/${parts}）`;
  });
  let next = state.nextId;
  const made: GoalNode[] = mins.map((m, i) => {
    const part: GoalNode = { id: i === 0 ? node.id : next++, parent: node.parent, kind: 'task', title: clampText(titles[i] ?? base, MAX_TITLE_CHARS), due: node.due, minutes: m, done: false };
    return node.priority === undefined ? part : { ...part, priority: node.priority };
  });
  const nodes = state.nodes.flatMap((n) => (n.id === node.id ? made : [n]));
  const advice =
    cause === 'time'
      ? '使える時間が実態に合っていない可能性があります。「見直して」で、時間が足りているかを数字で確かめてください。'
      : cause === 'start'
        ? '最初の一歩だけで構いません。それが終われば、次は迷わず進められます。'
        : '1 つが小さくなったので、今日は最初の 1 つだけやってみてください。';
  const lines = made.map((n) => `☐ #${n.id} ${n.title} (${n.minutes}分)`).join('\n');
  return turn(
    { ...withoutPending(state), nodes, nextId: next },
    `原因は「${CAUSE_LABEL[cause]}」ですね。#${node.id} 「${node.title}」(${node.minutes}分) を ${parts} つに割りました (合計 ${node.minutes}分は変わりません)。\n${lines}\n\n${advice}`,
    ['今日の予定', '全体を見せて'],
    related,
  );
}

/**
 * 会話の 1 手。
 * - 状態が無く、入口の言葉でもなければ `null` (コーチの出番ではない)。
 * - 状態が有れば、**利用者の言葉をまず終了・やり直しとして読み**、次にいまの段階として読む。
 */
export function coachTurn(state: CoachState | null, rawText: string, today: string): CoachTurn | null {
  const text = rawText.trim();
  if (state === null) {
    if (!isCoachEntry(text)) return null;
    return turn(
      newCoachState(today),
      `🎯 ゴールコーチです。あなたの目標を聞き取り、期限から逆算して、今日やることまで落とし込みます。\n` +
        `まず、いちばん近いものを選んでください。\n${personaMenu()}\n\n番号か、あてはまる言葉で答えてください。`,
      PERSONAS.slice(0, 3).map((_p, i) => `${i + 1}`),
    );
  }

  const t = fold(text);
  // 目標・期限を変える言い回しは**終了・やり直しより先**に読む (新しい目標の文に「やり直し」が
  // 含まれても、預かった計画を消さない —— 取り違えの害は消す側のほうが重い)。
  if (state.phase === 'review' || state.phase === 'active') {
    const changed = changeTurn(state, text, today, state.persona === null ? [] : personaOf(state.persona).services);
    if (changed !== null) return changed;
  }
  if (containsAny(t, EXIT_MARKERS)) {
    return turn(null, 'コーチを終了し、保存していた目標と計画を消しました。また始めるときは「目標を決めたい」と話しかけてください。', ['目標を決めたい', '何ができる？']);
  }
  if (containsAny(t, RESTART_MARKERS)) {
    const fresh = newCoachState(today);
    return turn(fresh, `最初からやり直します。\n${personaMenu()}\n\n番号か、あてはまる言葉で答えてください。`, ['1', '2', '3']);
  }

  const related = state.persona === null ? [] : personaOf(state.persona).services;

  if (state.phase === 'persona') {
    const id = detectPersona(text);
    if (id === null) {
      return turn(state, `読み取れませんでした。番号 (1〜${PERSONAS.length}) か、あてはまる言葉で答えてください。\n${personaMenu()}`, ['1', '2', '3']);
    }
    const next: CoachState = { ...state, phase: 'interview', persona: id };
    const q = QUESTIONS[0] as (typeof QUESTIONS)[number];
    return turn(next, `「${personaOf(id).label}」で進めます。いくつか質問します。(1/${QUESTIONS.length})\n${q.ask}`, [], personaOf(id).services);
  }

  if (state.phase === 'interview') {
    const q = nextQuestion(state);
    if (q === null) return turn(state, '聞き取りは終わっています。「進めて」と答えると計画を作ります。', ['進めて']);
    let value: string | null = clampText(text, MAX_ANSWER_CHARS);
    if (q.key === 'due') {
      const due = parseDue(text, today);
      if (due === null) return turn(state, `期限を日付として読めませんでした。ISO 日付 (2026-12-31)・「3か月後」・「半年後」・「年末」のどれかで教えてください。\n(日付は推測せず、読めたものだけを使います)`, ['3か月後', '半年後', '年末'], related);
      if (due < today) return turn(state, `${due} はすでに過ぎています。これから先の日付で教えてください。`, ['3か月後', '半年後', '年末'], related);
      value = due;
    } else if (q.key === 'hours') {
      const m = parseDailyMinutes(text);
      if (m === null) return turn(state, '時間として読めませんでした。「1時間」「30分」「1.5時間」のように教えてください。', ['30分', '1時間', '2時間'], related);
      value = `${m}分`;
    } else if (value === '') {
      return turn(state, `空の答えは受け取れません。${q.ask}`, [], related);
    }
    const answers = { ...state.answers, [q.key]: value };
    const after: CoachState = { ...state, answers };
    const nq = nextQuestion(after);
    if (nq !== null) {
      const idx = QUESTION_KEYS.indexOf(nq.key) + 1;
      return turn(after, `(${idx}/${QUESTIONS.length}) ${nq.ask}`, nq.key === 'blocker' ? ['なし'] : [], related);
    }
    const built = buildTree({ ...after, phase: 'review' }, today);
    const issues = critique(built, today);
    return turn(
      built,
      `聞き取りを元に、期限から逆算して計画を作りました。\n\n${renderTree(built)}\n\n--- 自分で疑ってみた点 ---\n${renderCritique(issues)}\n\n` +
        `この計画で進めてよければ「進めて」と答えてください。直すなら「やり直し」、疑いを見直すなら「見直して」と答えてください。`,
      ['進めて', '見直して', 'やり直し'],
      related,
    );
  }

  if (state.phase === 'review') {
    if (containsAny(t, OK_MARKERS)) {
      const active: CoachState = { ...state, phase: 'active' };
      return turn(active, `計画を確定しました。毎日、「今日の予定」と話しかけてください。\n\n${renderPlan(active, today)}`, ['今日の予定', '全体を見せて'], related);
    }
    if (containsAny(t, REVIEW_MARKERS)) {
      return turn(state, `--- 自分で疑ってみた点 ---\n${renderCritique(critique(state, today))}`, ['進めて', 'やり直し'], related);
    }
    if (containsAny(t, TREE_MARKERS)) return turn(state, renderTree(state), ['進めて', 'やり直し'], related);
    return turn(state, '計画の確認中です。「進めて」で確定、「見直して」で疑う点の再確認、「やり直し」で最初からになります。', ['進めて', '見直して', 'やり直し'], related);
  }

  // active
  const add = ADD_MARKERS.some((m) => t.includes(m)) ? /(?:追加|足して|加えて)\s*[:：]?\s*(.+)$/.exec(text) : null;
  if (add !== null && add[1] !== undefined && add[1].trim() !== '') {
    if (state.nodes.length >= MAX_NODES) return turn(state, `計画が大きくなりすぎています (上限 ${MAX_NODES})。完了した物を整理するか、やり直しで作り直してください。`, ['全体を見せて'], related);
    const target = state.nodes.find((n) => n.kind === 'milestone' && state.nodes.some((c) => c.parent === n.id && c.kind === 'task' && !c.done));
    const parent = target ?? state.nodes.find((n) => n.kind === 'goal') ?? state.nodes[0];
    if (parent === undefined) return turn(state, '計画が空です。「やり直し」で作り直してください。', ['やり直し']);
    const node: GoalNode = { id: state.nextId, parent: parent.id, kind: 'task', title: clampText(add[1], MAX_TITLE_CHARS), due: parent.due, minutes: 30, done: false };
    const next: CoachState = { ...state, nodes: [...state.nodes, node], nextId: state.nextId + 1 };
    return turn(next, `#${node.id} 「${node.title}」を追加しました (30分・〜${node.due ?? '期日なし'})。時間が違えば作り直しの時に直します。`, ['今日の予定'], related);
  }
  // 「できなかった」の原因を聞いている途中: 原因が読めれば割る・「キャンセル」なら保留をやめる。
  // 読めない発話は飲み込まず、ふつうのコーチの言い回しとして続けて読む。
  if (state.splitFor !== undefined) {
    if (containsAny(t, CANCEL_MARKERS)) return turn(withoutPending(state), '割るのをやめました。タスクはそのままです。', ['今日の予定', '全体を見せて'], related);
    const cause = parseSplitCause(t);
    if (cause !== null) return splitTurn(state, state.splitFor, cause, related);
  }
  if (containsAny(t, FAIL_MARKERS)) return failTurn(state, text, today, related);
  if (containsAny(t, HABIT_OFF_MARKERS)) return habitTurn(state, t, false, related);
  if (containsAny(t, HABIT_ON_MARKERS)) return habitTurn(state, t, true, related);
  if (containsAny(t, PRIORITY_UP_MARKERS)) return priorityTurn(state, t, 1, related);
  if (containsAny(t, PRIORITY_DOWN_MARKERS)) return priorityTurn(state, t, -1, related);
  if (containsAny(t, WEEKLY_MARKERS)) return weeklyTurn(state, today, related);
  const doneNo = containsAny(t, DONE_MARKERS) ? /#?\s*(\d{1,3})/.exec(t) : null;
  if (doneNo !== null) {
    const id = Number(doneNo[1]);
    const node = state.nodes.find((n) => n.id === id && n.kind === 'task');
    if (node === undefined) return turn(state, `#${id} というタスクは見当たりません。「全体を見せて」で番号を確かめてください。`, ['全体を見せて'], related);
    if (node.repeat !== undefined) {
      if (!habitDue(node, today)) return turn(state, `#${id} 「${node.title}」は今日の分がすでに完了しています。`, ['今日の予定'], related);
      const nextHabit: CoachState = { ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, doneOn: today } : n)) };
      return turn(nextHabit, `🔁 #${id} 「${node.title}」の${node.repeat === 'weekly' ? '今週' : '今日'}の分を完了にしました。習慣なので、${node.repeat === 'weekly' ? '7 日後' : '翌日'}にまた予定へ戻ります。\n\n${renderPlan(nextHabit, today)}`, ['今日の予定', '全体を見せて'], related);
    }
    if (node.done) return turn(state, `#${id} はすでに完了しています。`, ['今日の予定'], related);
    const next: CoachState = { ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, done: true, doneOn: today } : n)) };
    const left = openTasks(next.nodes).length;
    const tail = left === 0 ? '\n\n🎉 すべてのタスクが完了しました。目標を振り返り、次の目標を決めましょう。「目標を決めたい」と話しかけてください。' : `\n\n${renderPlan(next, today)}`;
    return turn(next, `☑ #${id} 「${node.title}」を完了にしました。残り ${left} 件。${tail}`, left === 0 ? ['やり直し'] : ['今日の予定', '全体を見せて'], related);
  }
  if (containsAny(t, REVIEW_MARKERS)) {
    return turn(state, `--- 自分で疑ってみた点 ---\n${renderCritique(critique(state, today))}`, ['今日の予定', '全体を見せて'], related);
  }
  if (containsAny(t, TREE_MARKERS)) return turn(state, renderTree(state), ['今日の予定', '見直して'], related);
  if (containsAny(t, TODAY_MARKERS)) return turn(state, renderPlan(state, today), ['全体を見せて', '見直して'], related);
  if (containsAny(t, HELP_MARKERS)) {
    return turn(
      state,
      '使える言い方: 「今日の予定」「全体を見せて」「#3 完了」「追加: ○○」「見直して」「#3 優先度を上げて」「#3 習慣にする」「#3 できなかった」「今週の振り返り」「目標を変える: ○○」「期限を変える: ○○」「やり直し」「コーチをやめる」',
      ['今日の予定', '全体を見せて', '見直して'],
      related,
    );
  }
  // コーチの言い回しでなければ**飲み込まない** (呼び出し側が他の依頼として扱う)。
  return null;
}

// --- 保存値の読み (型が守らない) ------------------------------------------------

const PHASES: readonly CoachPhase[] = ['persona', 'interview', 'review', 'active'];
const KINDS: readonly NodeKind[] = ['purpose', 'goal', 'milestone', 'task'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

function sanitizeNode(raw: unknown): GoalNode | null {
  if (!isObj(raw)) return null;
  const id = own(raw, 'id');
  const parent = own(raw, 'parent');
  const kind = own(raw, 'kind');
  const title = own(raw, 'title');
  const due = own(raw, 'due');
  const minutes = own(raw, 'minutes');
  const done = own(raw, 'done');
  const priority = own(raw, 'priority');
  const repeat = own(raw, 'repeat');
  const doneOn = own(raw, 'doneOn');
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null;
  if (parent !== null && (typeof parent !== 'number' || !Number.isInteger(parent))) return null;
  if (typeof kind !== 'string' || !KINDS.includes(kind as NodeKind)) return null;
  if (typeof title !== 'string') return null;
  if (due !== null && !isCalendarDate(due)) return null;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 || minutes > MAX_TASK_MINUTES) return null;
  if (typeof done !== 'boolean') return null;
  // 後から足した欄 (無くてよい)。あれば読めること・矛盾しないことを要求する (読めなければ捨てて始めから)。
  if (priority !== undefined && (typeof priority !== 'number' || !Number.isInteger(priority) || Math.abs(priority) > MAX_PRIORITY)) return null;
  if (repeat !== undefined && repeat !== 'daily' && repeat !== 'weekly') return null;
  if (doneOn !== undefined && !isCalendarDate(doneOn)) return null;
  if (repeat !== undefined && (kind !== 'task' || done)) return null;
  if ((priority !== undefined || doneOn !== undefined) && kind !== 'task') return null;
  return {
    id,
    parent: parent as number | null,
    kind: kind as NodeKind,
    title: clampText(title, MAX_TITLE_CHARS),
    due: due as string | null,
    minutes,
    done,
    ...(priority === undefined ? {} : { priority: priority as number }),
    ...(repeat === undefined ? {} : { repeat }),
    ...(doneOn === undefined ? {} : { doneOn: doneOn as string }),
  };
}

/**
 * 保存値 → 状態。**読めない欄があれば null** (黙って別の値にしない)。
 * 呼び出し側は null のとき始めからやり直す。ノードは上限で断る (切らない)。
 */
export function sanitizeCoachState(raw: unknown): CoachState | null {
  if (!isObj(raw) || own(raw, 'v') !== 1) return null;
  const phase = own(raw, 'phase');
  const persona = own(raw, 'persona');
  const startedOn = own(raw, 'startedOn');
  const nextId = own(raw, 'nextId');
  const answersRaw = own(raw, 'answers');
  const nodesRaw = own(raw, 'nodes');
  if (typeof phase !== 'string' || !PHASES.includes(phase as CoachPhase)) return null;
  if (persona !== null && (typeof persona !== 'string' || !PERSONA_BY_ID.has(persona as PersonaId))) return null;
  if (!isCalendarDate(startedOn)) return null;
  if (typeof nextId !== 'number' || !Number.isInteger(nextId) || nextId < 1) return null;
  if (!isObj(answersRaw) || !Array.isArray(nodesRaw) || nodesRaw.length > MAX_NODES) return null;
  const answers: Partial<Record<QuestionKey, string>> = {};
  for (const k of QUESTION_KEYS) {
    const v = own(answersRaw, k);
    if (v === undefined) continue;
    if (typeof v !== 'string') return null;
    answers[k] = clampText(v, MAX_ANSWER_CHARS);
  }
  const nodes: GoalNode[] = [];
  for (const n of nodesRaw) {
    const node = sanitizeNode(n);
    if (node === null) return null;
    nodes.push(node);
  }
  if (nodes.some((n) => n.id >= nextId)) return null;
  if (nodes.filter((n) => n.repeat !== undefined).length > MAX_HABITS) return null;
  const splitFor = own(raw, 'splitFor');
  if (splitFor !== undefined) {
    // 保留は「いま割れる未完了のタスク」を指すときだけ有効 (指す先が無い保留は読めない保存値)。
    const target = isFiniteNumber(splitFor) ? nodes.find((n) => n.id === splitFor) : undefined;
    if (target === undefined || target.kind !== 'task' || target.done || target.repeat !== undefined) return null;
  }
  return {
    v: 1,
    phase: phase as CoachPhase,
    persona: persona as PersonaId | null,
    answers,
    startedOn,
    nodes,
    nextId,
    ...(splitFor === undefined ? {} : { splitFor: splitFor as number }),
  };
}
