/**
 * **専属カウンセラー** —— メンバー 1 人に 1 人ずつ付く、先回りする相談役の判断 (2026-10-29 · パス 551)。
 *
 * 利用者の依頼: 「人員育成の為にひとりひとりに専属の AI カウンセラーがつき、質問とその人の
 * ペルソナに寄り添いつつ、チームとしてどう動くべきか・他のメンバーとの関係性・本人が抱えている
 * 仕事内容や悩みによって適切な助言を行い、メンバー間の仲を取り持つ」。
 *
 * ここは**判断だけ**で IO を持たない (保存と描画は `pages/MentorPage.tsx` の責務)。
 * ゴールコーチ (`renderer/data/goalCoach.ts`) と同じ考え方で、**同じ入力には同じ答えを返し、
 * 端末の外へは何も送らない**。外部のモデルへ送るのは、画面で利用者が「AI に深掘りを頼む」を
 * 押したときの**本人の記録だけ**で、それもこのモジュールが組む文 (`aiDeepDivePrompt`) に限る
 * —— 他のメンバーの記録は 1 字も入らない。
 *
 * ## 守る物 (順に強い)
 * 1. **危機は先に、別の道へ** —— 相談の文に危機・他害が書かれていたら、助言も仲介も AI も
 *    出さず、窓口 (`counseling.ts`) だけを出す。判定は renderer の `counseling.ts` が持つので
 *    ここは**注入で受ける** (`isCrisis`)。shared から renderer は読めない (`lint:imports`)。
 * 2. **本人の記録は本人の物** —— 相手の悩み・信頼度・本音は、相手が「チームで使ってよい」と
 *    同意した**集計 (負荷・信頼の高低)** 以外、他の誰の画面にも助言にも出ない。
 *    仲介 (`mediationPlan`) は両方の同意が在るときだけ組み、無ければ「まず本人に聞く」を返す。
 * 3. **推測で埋めない** —— 聞いていない欄は「まだ聞いていない」と言う。読めない保存値は
 *    その項目だけ落とし、行は残す (`sanitizeMentorSession` —— 復元の欠落は別の事故)。
 */

import { isCalendarDate, isoDaysBetween } from './isoDate';
import { countChars, moreThanChars } from './inputCeiling';
import { isFiniteNumber } from './num';
import type { Role } from './team';

export const MENTOR_COLLECTION = 'mentor-sessions';

// --- 上限 (入口と画面の天井) ------------------------------------------------

/** 聞き取りの答え 1 つの上限 (文字)。 */
export const MAX_MENTOR_ANSWER_CHARS = 200;
/** チェックインのメモの上限 (文字)。 */
export const MAX_MENTOR_NOTE_CHARS = 400;
/** 1 人の記録が持てるチェックインの数。超えたら古い物から落とす (画面と保存の両方)。 */
export const MAX_MENTOR_CHECKINS = 120;
/** 1 人の記録が持てる関係の数 (相手の数)。 */
export const MAX_MENTOR_RELATIONS = 50;
/** チェックインを促す間隔 (日)。これより空いたら「最近どうですか」を先に聞く。 */
export const CHECKIN_INTERVAL_DAYS = 7;
/** 負荷が高い (4 以上) チェックインが続いたら注意する回数。 */
export const HIGH_LOAD_STREAK = 2;
/** 信頼度がこれ以下の関係は「整える相手」として扱う。 */
export const LOW_TRUST = 2;

// --- 型 ------------------------------------------------------------------

export type MentorQuestionKey = 'style' | 'motivation' | 'stress' | 'feedback' | 'strength' | 'growth';

export interface MentorQuestion {
  readonly key: MentorQuestionKey;
  /** カウンセラーが実際に出す問い。 */
  readonly prompt: string;
  /** 選んでも打ってもよい例。 */
  readonly examples: readonly string[];
}

/** 聞き取りの問い。**この順に 1 つずつ**聞く (一度に並べると答えが薄くなる)。 */
export const MENTOR_QUESTIONS: readonly MentorQuestion[] = [
  { key: 'style', prompt: 'はじめまして、あなた専属のカウンセラーです。まず、どんな伝え方が心地よいですか？', examples: ['率直に結論から', 'やわらかく理由から', '選択肢を並べてほしい'] },
  { key: 'motivation', prompt: '仕事で一番やりがいを感じるのはどんなときですか？', examples: ['人に感謝されたとき', '難しい問題が解けたとき', '計画どおりに進んだとき'] },
  { key: 'stress', prompt: '逆に、しんどくなる合図は何ですか？ (周りが気づける形だと助かります)', examples: ['口数が減る', '返事が遅くなる', '細かいことが気になる'] },
  { key: 'feedback', prompt: '指摘やフィードバックは、どう受け取りたいですか？', examples: ['その場で短く', '1on1 でまとめて', '文章で後から読みたい'] },
  { key: 'strength', prompt: 'チームの中で、自分が一番役に立てると思うことは何ですか？', examples: ['段取り', '調整役', '新しい案を出す', '最後までやり切る'] },
  { key: 'growth', prompt: '半年後、どうなっていたいですか？ (小さくても具体的に)', examples: ['後輩に教えられる', '自分で提案を通す', '残業を減らす'] },
];

export interface MentorCheckIn {
  /** ISO 日付。 */
  readonly on: string;
  /** 気分 1 (つらい) 〜 5 (良い)。 */
  readonly mood: number;
  /** 負荷 1 (余裕) 〜 5 (限界)。 */
  readonly workload: number;
  /** 自由文 (悩み・今の仕事)。 */
  readonly note: string;
}

export interface MentorRelation {
  /** 相手のメンバー鍵 (メールアドレスの小文字)。 */
  readonly with: string;
  /** 信頼度 1 (難しい) 〜 5 (安心)。 */
  readonly trust: number;
  /** 困っていること (本人だけが読む)。 */
  readonly note: string;
}

/** 1 人分の記録 (collection `mentor-sessions` の 1 行 = メンバー 1 人)。 */
export interface MentorSession extends Record<string, unknown> {
  /** メンバー鍵 = メールアドレスの小文字 (`team-members` の行と結ぶ)。 */
  readonly member: string;
  readonly answers: Readonly<Partial<Record<MentorQuestionKey, string>>>;
  readonly checkins: readonly MentorCheckIn[];
  readonly relations: readonly MentorRelation[];
  /** 本人の同意: 負荷・信頼の**集計**をチームの画面と仲介に使ってよいか。 */
  readonly shareWithTeam: boolean;
}

export interface MentorMember {
  readonly key: string;
  readonly name: string;
  readonly role: Role;
}

export type PromptKind = 'intake' | 'checkin' | 'relation' | 'growth';

export interface MentorPrompt {
  readonly kind: PromptKind;
  readonly text: string;
  readonly questionKey: MentorQuestionKey | null;
  /** `relation` のとき、聞いている相手の鍵。 */
  readonly withMember: string | null;
  readonly examples: readonly string[];
}

export type AdviceSeverity = 'crisis' | 'warn' | 'info';

export interface MentorAdvice {
  readonly severity: AdviceSeverity;
  readonly title: string;
  readonly body: string;
  /** 何を根拠にそう言ったか (本人の記録のどこか)。 */
  readonly basis: string;
}

export interface TeamSignal {
  readonly member: string;
  readonly name: string;
  /** 直近 2 回の負荷が高い。 */
  readonly highLoad: boolean;
  /** 直近の気分が低い。 */
  readonly lowMood: boolean;
  /** 最後のチェックインから `CHECKIN_INTERVAL_DAYS` を超えて空いている (1 度も無い場合も)。 */
  readonly silent: boolean;
}

export interface TeamPair {
  readonly a: string;
  readonly b: string;
  readonly aName: string;
  readonly bName: string;
  /** 両方が相手を低く見ている / 片方だけ。 */
  readonly kind: 'mutual' | 'one-sided';
  /** 両方の同意が在る (仲介の計画を組める)。 */
  readonly consented: boolean;
}

export interface MediationStep {
  readonly step: number;
  readonly text: string;
}

export interface MediationPlan {
  readonly pair: TeamPair;
  /** 両方の同意が無ければ null —— 代わりに `holdReason`。 */
  readonly steps: readonly MediationStep[] | null;
  readonly holdReason: string | null;
}

// --- 読み (保存値は型が守らない) --------------------------------------------

export function memberKeyOf(email: string): string {
  return email.trim().toLowerCase();
}

function clampScore(v: unknown): number | null {
  if (!isFiniteNumber(v)) return null;
  const n = Math.round(v);
  return n >= 1 && n <= 5 ? n : null;
}

function readText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return moreThanChars(t, max) ? null : t;
}

function readCheckIn(v: unknown): MentorCheckIn | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const mood = clampScore(r.mood);
  const workload = clampScore(r.workload);
  const note = readText(r.note, MAX_MENTOR_NOTE_CHARS);
  if (!isCalendarDate(r.on) || mood === null || workload === null || note === null) return null;
  return { on: r.on, mood, workload, note };
}

function readRelation(v: unknown): MentorRelation | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const trust = clampScore(r.trust);
  const note = readText(r.note, MAX_MENTOR_NOTE_CHARS);
  if (typeof r.with !== 'string' || r.with.trim() === '' || trust === null || note === null) return null;
  return { with: memberKeyOf(r.with), trust, note };
}

const QUESTION_KEYS: readonly MentorQuestionKey[] = MENTOR_QUESTIONS.map((q) => q.key);

export function isMentorQuestionKey(v: unknown): v is MentorQuestionKey {
  return typeof v === 'string' && (QUESTION_KEYS as readonly string[]).includes(v);
}

/**
 * 保存値を読む。**読めない項目だけ落とし、行は残す。** `member` が読めなければ行ごと null
 * (誰の記録かが分からない物は、誰の画面にも出せない)。
 */
export function sanitizeMentorSession(raw: unknown): MentorSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.member !== 'string' || r.member.trim() === '') return null;
  const answers: Partial<Record<MentorQuestionKey, string>> = {};
  if (typeof r.answers === 'object' && r.answers !== null) {
    for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
      if (!isMentorQuestionKey(k)) continue;
      const t = readText(v, MAX_MENTOR_ANSWER_CHARS);
      if (t !== null && t !== '') answers[k] = t;
    }
  }
  const checkins = (Array.isArray(r.checkins) ? r.checkins : [])
    .map(readCheckIn)
    .filter((c): c is MentorCheckIn => c !== null)
    .slice(-MAX_MENTOR_CHECKINS);
  const seen = new Set<string>();
  const relations: MentorRelation[] = [];
  for (const v of Array.isArray(r.relations) ? r.relations : []) {
    const rel = readRelation(v);
    if (rel === null || seen.has(rel.with)) continue;
    seen.add(rel.with);
    relations.push(rel);
    if (relations.length >= MAX_MENTOR_RELATIONS) break;
  }
  return {
    member: memberKeyOf(r.member),
    answers,
    checkins,
    relations,
    shareWithTeam: r.shareWithTeam === true,
  };
}

export function emptyMentorSession(member: string): MentorSession {
  return { member: memberKeyOf(member), answers: {}, checkins: [], relations: [], shareWithTeam: false };
}

// --- 入口 (画面から入る値) ---------------------------------------------------

/** 聞き取りの答えを入れる。空・長すぎは断る (理由の文を投げる)。 */
export function answerQuestion(session: MentorSession, key: MentorQuestionKey, rawText: string): MentorSession {
  const text = rawText.trim();
  if (text === '') throw new Error('答えを入力してください');
  if (moreThanChars(text, MAX_MENTOR_ANSWER_CHARS)) throw new Error(`答えは ${MAX_MENTOR_ANSWER_CHARS} 文字までにしてください (今 ${countChars(text)} 文字)`);
  return { ...session, answers: { ...session.answers, [key]: text } };
}

/** チェックインを足す。同じ日の 2 回目は上書き (1 日 1 件)。 */
export function addCheckIn(session: MentorSession, input: { on: string; mood: unknown; workload: unknown; note: string }): MentorSession {
  const mood = clampScore(input.mood);
  const workload = clampScore(input.workload);
  if (!isCalendarDate(input.on)) throw new Error('日付は YYYY-MM-DD 形式で入力してください');
  if (mood === null) throw new Error('気分は 1〜5 で選んでください');
  if (workload === null) throw new Error('負荷は 1〜5 で選んでください');
  const note = input.note.trim();
  if (moreThanChars(note, MAX_MENTOR_NOTE_CHARS)) throw new Error(`メモは ${MAX_MENTOR_NOTE_CHARS} 文字までにしてください (今 ${countChars(note)} 文字)`);
  const kept = session.checkins.filter((c) => c.on !== input.on);
  const checkins = [...kept, { on: input.on, mood, workload, note }]
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
    .slice(-MAX_MENTOR_CHECKINS);
  return { ...session, checkins };
}

/** 相手との関係を入れる (相手ごとに 1 件・上書き)。自分自身は断る。 */
export function setRelation(session: MentorSession, input: { with: string; trust: unknown; note: string }): MentorSession {
  const withKey = memberKeyOf(input.with);
  if (withKey === '') throw new Error('相手を選んでください');
  if (withKey === session.member) throw new Error('自分自身との関係は記録できません');
  const trust = clampScore(input.trust);
  if (trust === null) throw new Error('信頼度は 1〜5 で選んでください');
  const note = input.note.trim();
  if (moreThanChars(note, MAX_MENTOR_NOTE_CHARS)) throw new Error(`メモは ${MAX_MENTOR_NOTE_CHARS} 文字までにしてください (今 ${countChars(note)} 文字)`);
  const others = session.relations.filter((r) => r.with !== withKey);
  if (others.length >= MAX_MENTOR_RELATIONS) throw new Error(`関係は ${MAX_MENTOR_RELATIONS} 人までです`);
  return { ...session, relations: [...others, { with: withKey, trust, note }] };
}

// --- 先回り: 次に何を聞くか ------------------------------------------------

function latestCheckIn(session: MentorSession): MentorCheckIn | null {
  return session.checkins.length === 0 ? null : session.checkins[session.checkins.length - 1]!;
}

function daysSinceLastCheckIn(session: MentorSession, today: string): number | null {
  const last = latestCheckIn(session);
  if (last === null) return null;
  return isoDaysBetween(last.on, today);
}

/**
 * カウンセラーが**自分から**出す次の問い。順序は「まだ聞いていない聞き取り → 空いた
 * チェックイン → 低い信頼度の相手の続き → 成長の振り返り」。
 */
export function nextPrompt(session: MentorSession, today: string, members: readonly MentorMember[]): MentorPrompt {
  for (const q of MENTOR_QUESTIONS) {
    if (session.answers[q.key] === undefined) {
      return { kind: 'intake', text: q.prompt, questionKey: q.key, withMember: null, examples: q.examples };
    }
  }
  const gap = daysSinceLastCheckIn(session, today);
  if (gap === null || gap > CHECKIN_INTERVAL_DAYS) {
    const lead = gap === null ? '聞き取りありがとうございます。' : `前回から ${gap} 日経ちました。`;
    return {
      kind: 'checkin',
      text: `${lead}最近の調子はどうですか？ 気分と負荷を 1〜5 で、ひとことメモも添えてください。`,
      questionKey: null,
      withMember: null,
      examples: [],
    };
  }
  const low = session.relations.find((r) => r.trust <= LOW_TRUST);
  if (low !== undefined) {
    const name = members.find((m) => m.key === low.with)?.name ?? low.with;
    return {
      kind: 'relation',
      text: `${name} さんとの関係について、その後どうですか？ 小さな変化でも教えてください。`,
      questionKey: null,
      withMember: low.with,
      examples: ['少し話せた', '変わらない', '避けている'],
    };
  }
  return {
    kind: 'growth',
    text: `「${session.answers.growth ?? ''}」に向けて、今週できた一歩はありますか？`,
    questionKey: 'growth',
    withMember: null,
    examples: ['できた', 'まだ', '方向を変えたい'],
  };
}

// --- 助言 (本人へ) ----------------------------------------------------------

/** 伝え方の好み (聞き取り `style`) から、助言の口調を決める。 */
export function adviceTone(session: MentorSession): 'direct' | 'gentle' | 'options' {
  const s = session.answers.style ?? '';
  if (s.includes('率直') || s.includes('結論')) return 'direct';
  if (s.includes('選択肢')) return 'options';
  return 'gentle';
}

function toned(tone: 'direct' | 'gentle' | 'options', direct: string, gentle: string, options: string): string {
  return tone === 'direct' ? direct : tone === 'options' ? options : gentle;
}

/**
 * 本人への助言。`isCrisis` は renderer の危機判定 (`counseling.ts`) を注入する ——
 * 当たれば**それ 1 件だけ**を返し、他の助言 (仕事・関係) は出さない。
 */
export function adviseMember(
  session: MentorSession,
  member: MentorMember,
  today: string,
  isCrisis: (text: string) => boolean,
): readonly MentorAdvice[] {
  const texts = [...session.checkins.map((c) => c.note), ...session.relations.map((r) => r.note), ...Object.values(session.answers)];
  if (texts.some((t) => isCrisis(t))) {
    return [{
      severity: 'crisis',
      title: 'まず、あなたの安全が一番です',
      body: '記録の中につらい気持ちや強い衝動が書かれています。仕事の助言より先に、下の相談窓口か信頼できる人に今日のうちに頼ってください。ここに書いた内容は端末の外へは出ていません。',
      basis: '記録の中の文面',
    }];
  }
  const out: MentorAdvice[] = [];
  const tone = adviceTone(session);
  const recent = session.checkins.slice(-HIGH_LOAD_STREAK);
  if (recent.length >= HIGH_LOAD_STREAK && recent.every((c) => c.workload >= 4)) {
    const ask = member.role === 'owner'
      ? '誰かに渡せる仕事を 1 つ決めて、今日のうちに頼んでください。'
      : 'オーナーか管理者に「今の負荷」を数字 (1〜5) で伝えてください。';
    out.push({
      severity: 'warn',
      title: '負荷の高い状態が続いています',
      body: toned(tone,
        `直近 ${HIGH_LOAD_STREAK} 回とも負荷 4 以上です。${ask}`,
        `ここ ${HIGH_LOAD_STREAK} 回、負荷が高いままですね。無理が続く前に、${ask}`,
        `負荷が高い状態が続いています。選べる手は 2 つ: (a) ${ask} (b) 期限を 1 つ後ろへずらす相談をする。`),
      basis: `直近 ${HIGH_LOAD_STREAK} 回のチェックインの負荷`,
    });
  }
  const last = latestCheckIn(session);
  if (last !== null && last.mood <= 2) {
    out.push({
      severity: 'warn',
      title: '気分が下がっています',
      body: toned(tone,
        '今日は仕事を 1 つ減らして、休む時間を先に予定へ入れてください。続くなら専門家へ。',
        '気分が下がっているときは、まず休む時間を先に確保するのが近道です。続くようなら、専門家に話してみてください。',
        '選べる手: (a) 今日の仕事を 1 つ減らす (b) 信頼できる人に 10 分だけ話す (c) 続くなら専門家へ。'),
      basis: `${last.on} のチェックイン (気分 ${last.mood})`,
    });
  }
  const gap = daysSinceLastCheckIn(session, today);
  if (gap !== null && gap > CHECKIN_INTERVAL_DAYS * 2) {
    out.push({
      severity: 'info',
      title: 'しばらくチェックインがありません',
      body: `${gap} 日空いています。忙しいときほど 1 行でよいので、今の負荷を残しておくと周りが助けやすくなります。`,
      basis: '最後のチェックインの日付',
    });
  }
  for (const r of session.relations.filter((x) => x.trust <= LOW_TRUST)) {
    const feedback = session.answers.feedback ?? '';
    const how = feedback.includes('文章') ? '文章で一度気持ちを整理してから、短い相談として渡す' : feedback.includes('1on1') ? '1on1 の場で、事実だけを 1 つ伝える' : '短い雑談から入り、事実を 1 つだけ伝える';
    out.push({
      severity: 'info',
      title: `${r.with} さんとの関係を整える`,
      body: toned(tone,
        `信頼度 ${r.trust}。相手の人格ではなく「困った出来事 1 つ」に絞って、${how}のが近道です。`,
        `信頼度が ${r.trust} と低めですね。相手を変えようとせず、困った出来事を 1 つだけ選んで、${how}ところから始めてみませんか。`,
        `信頼度 ${r.trust}。選べる手: (a) ${how} (b) オーナー・管理者に間に入ってもらう (c) しばらく距離を取って観察する。`),
      basis: `${r.with} との関係の記録`,
    });
  }
  if (session.answers.strength !== undefined && session.answers.growth !== undefined && out.length === 0) {
    out.push({
      severity: 'info',
      title: '強みを活かす一歩',
      body: `「${session.answers.strength}」が強みで、半年後は「${session.answers.growth}」。今週、強みを使って半年後に近づく仕事を 1 つ選んで、誰に見てもらうかまで決めてください。`,
      basis: '聞き取りの「強み」と「半年後」',
    });
  }
  return out;
}

// --- チーム (同意した集計だけ) ----------------------------------------------

/** 同意したメンバーの**集計**だけを並べる。同意の無い人は一覧に出ない (出さないことが約束)。 */
export function teamSignals(sessions: readonly MentorSession[], members: readonly MentorMember[], today: string): readonly TeamSignal[] {
  const out: TeamSignal[] = [];
  for (const s of sessions) {
    if (!s.shareWithTeam) continue;
    const m = members.find((x) => x.key === s.member);
    if (m === undefined) continue;
    const recent = s.checkins.slice(-HIGH_LOAD_STREAK);
    const last = latestCheckIn(s);
    const gap = daysSinceLastCheckIn(s, today);
    out.push({
      member: s.member,
      name: m.name,
      highLoad: recent.length >= HIGH_LOAD_STREAK && recent.every((c) => c.workload >= 4),
      lowMood: last !== null && last.mood <= 2,
      silent: gap === null || gap > CHECKIN_INTERVAL_DAYS,
    });
  }
  return out;
}

/** 信頼度の低い組を見つける。**同意の無い人の評価は読まない** (片方の同意だけでも組は出さない)。 */
export function teamPairs(sessions: readonly MentorSession[], members: readonly MentorMember[]): readonly TeamPair[] {
  const byKey = new Map(sessions.map((s) => [s.member, s] as const));
  const nameOf = (k: string): string => members.find((m) => m.key === k)?.name ?? k;
  const seen = new Set<string>();
  const out: TeamPair[] = [];
  for (const s of sessions) {
    if (!s.shareWithTeam) continue;
    for (const r of s.relations) {
      if (r.trust > LOW_TRUST) continue;
      const other = byKey.get(r.with);
      const otherConsented = other?.shareWithTeam === true;
      if (!otherConsented) continue;
      const id = [s.member, r.with].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const back = other!.relations.find((x) => x.with === s.member);
      const mutual = back !== undefined && back.trust <= LOW_TRUST;
      // 相互なら鍵の順 (保管層の並びに依らず同じ答え)。片側なら距離を感じている側を a に置く
      // (仲介の 1 段目は a に先に話を聞く)。
      const [a, b] = mutual ? [s.member, r.with].sort() as [string, string] : [s.member, r.with];
      out.push({ a, b, aName: nameOf(a), bName: nameOf(b), kind: mutual ? 'mutual' : 'one-sided', consented: true });
    }
  }
  return out;
}

/**
 * 仲を取り持つ計画。**相手の本音 (メモ) は一切引用しない** —— 使うのは信頼度の高低だけ。
 * 同意が揃わなければ計画を組まず、理由を返す。
 */
export function mediationPlan(pair: TeamPair): MediationPlan {
  if (!pair.consented) {
    return { pair, steps: null, holdReason: '両方の同意が揃っていないので、仲介の計画は組みません。まず本人に「チームで使ってよいか」を聞いてください。' };
  }
  const first = pair.kind === 'mutual'
    ? `${pair.aName} さんと ${pair.bName} さんに別々に 10 分ずつ話を聞く (相手の評価は伝えない・困った出来事を 1 つだけ)`
    : `${pair.aName} さんに 10 分話を聞く (困った出来事を 1 つだけ)。${pair.bName} さんには「最近どう」とだけ聞く`;
  return {
    pair,
    holdReason: null,
    steps: [
      { step: 1, text: first },
      { step: 2, text: '2 人に共通する目的 (この仕事で何を達成したいか) を、それぞれの言葉で言ってもらう' },
      { step: 3, text: '次の 2 週間で守る約束を 1 つだけ決める (例: 依頼は締切つきで文章にする)。決めるのは本人たち、記録するのは仲介役' },
      { step: 4, text: '2 週間後に 3 人で 15 分振り返る。守れたかだけを見る。守れなければ約束を小さくする' },
    ],
  };
}

// --- AI へ渡す文 (本人の記録だけ) --------------------------------------------

/** 外部のモデルへ渡す 1 文を組む。入るのは**本人の**聞き取り・直近 3 回のチェックイン・問いだけ。 */
export function aiDeepDivePrompt(session: MentorSession, member: MentorMember, question: string): string {
  const answers = MENTOR_QUESTIONS
    .filter((q) => session.answers[q.key] !== undefined)
    .map((q) => `- ${q.prompt} → ${session.answers[q.key]}`)
    .join('\n');
  const recent = session.checkins.slice(-3).map((c) => `- ${c.on}: 気分 ${c.mood}/5・負荷 ${c.workload}/5 ${c.note}`).join('\n');
  return [
    `あなたは職場のメンバー 1 人に付く専属カウンセラーです。相手の役割は「${member.role}」。`,
    '人格の決めつけをせず、本人が明日できる小さな一歩を 3 つまで、短く提案してください。',
    '医療・法的な判断はせず、必要なら専門家へつなぐよう促してください。',
    answers === '' ? '聞き取り: まだ無し' : `聞き取り:\n${answers}`,
    recent === '' ? 'チェックイン: まだ無し' : `直近のチェックイン:\n${recent}`,
    `本人の相談: ${question.trim()}`,
  ].join('\n\n');
}

// --- ひとりひとりの負担 (同意した集計だけ · パス 555) -------------------------

/** 負担率に使う直近のチェックインの数 (窓)。1 回の数字で人を決めない。 */
export const WORKLOAD_WINDOW = 4;
/** 均等な分担に対して、この倍以上を 1 人が負っていたら「偏り」と言う。 */
export const WORKLOAD_SKEW_RATIO = 1.5;
/** 平均の負荷がこれ以上なら「高い」。 */
export const WORKLOAD_HIGH = 4;
/** 平均の負荷がこれ以下なら「余裕」。 */
export const WORKLOAD_LIGHT = 2;

export type WorkloadLevel = 'high' | 'normal' | 'light' | 'unknown';

/**
 * メンバー 1 人分の負担。**同意した人だけ**が行になる (同意の無い人は人数にしか出ない)。
 * 数は全部チェックインの「負荷 1〜5」から導く —— メモ (本音) は 1 字も持たない。
 */
export interface WorkloadShare {
  readonly member: string;
  readonly name: string;
  /** 直近のチェックインの負荷 (1〜5)。1 度も無ければ null。 */
  readonly latest: number | null;
  /** 直近 `WORKLOAD_WINDOW` 回の平均 (小数第 1 位)。1 度も無ければ null。 */
  readonly average: number | null;
  /** 窓に入った回数 (平均の分母)。 */
  readonly samples: number;
  /** 負担率 (%) = この人の平均 ÷ 平均を持つ全員の平均の合計 × 100 (小数第 1 位)。平均が無ければ null。 */
  readonly sharePct: number | null;
  /** 均等 (100 ÷ 人数) との差 (ポイント)。平均が無ければ null。 */
  readonly skewPt: number | null;
  readonly level: WorkloadLevel;
  /** 最後のチェックインの日。1 度も無ければ null。 */
  readonly lastOn: string | null;
  /** 最後のチェックインから `CHECKIN_INTERVAL_DAYS` を超えて空いている (1 度も無い場合も)。 */
  readonly stale: boolean;
}

export interface WorkloadDistribution {
  /** 同意した人の行。負担率の大きい順 (同率は鍵の順)。平均の無い人は末尾。 */
  readonly rows: readonly WorkloadShare[];
  /** 平均を持つ人数 (負担率の分母)。 */
  readonly counted: number;
  /** 均等なら 1 人が負う割合 (%)。平均を持つ人が居なければ null。 */
  readonly evenSharePct: number | null;
  /** 名簿に居るが同意していない (または記録が無い) 人数 —— 名前は出さない。 */
  readonly withoutConsent: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * **ひとりひとりの負担率** —— 同意した人のチェックインの負荷を、1 人ずつ・チーム全体に対する割合で出す。
 *
 * 守る物:
 * - **同意の無い人は行にならない** (`teamSignals` と同じ約束)。人数だけを `withoutConsent` で言う。
 * - **記録の無い人を 0 (余裕) にしない** —— 平均が無い人は `unknown` で、負担率の分母にも入れない。
 *   入れると「まだ書いていないだけの人」が一番楽に見え、残りの人の負担率が実物より高く出る。
 * - 1 回の数字で決めない —— 平均は直近 `WORKLOAD_WINDOW` 回。
 * - 並びは保管層の順に依らない (負担率 → 鍵)。
 */
export function workloadDistribution(
  sessions: readonly MentorSession[],
  members: readonly MentorMember[],
  today: string,
): WorkloadDistribution {
  const byKey = new Map(sessions.map((s) => [s.member, s] as const));
  const consented: { member: MentorMember; session: MentorSession }[] = [];
  let withoutConsent = 0;
  for (const m of members) {
    const s = byKey.get(m.key);
    if (s === undefined || !s.shareWithTeam) {
      withoutConsent += 1;
      continue;
    }
    consented.push({ member: m, session: s });
  }
  const partial = consented.map(({ member, session }) => {
    const window = session.checkins.slice(-WORKLOAD_WINDOW);
    const last = latestCheckIn(session);
    const gap = daysSinceLastCheckIn(session, today);
    const average = window.length === 0 ? null : round1(window.reduce((acc, c) => acc + c.workload, 0) / window.length);
    const level: WorkloadLevel = average === null ? 'unknown' : average >= WORKLOAD_HIGH ? 'high' : average <= WORKLOAD_LIGHT ? 'light' : 'normal';
    return { member, average, samples: window.length, latest: last === null ? null : last.workload, lastOn: last === null ? null : last.on, stale: gap === null || gap > CHECKIN_INTERVAL_DAYS, level };
  });
  const withAverage = partial.filter((p): p is typeof p & { average: number } => p.average !== null);
  const total = withAverage.reduce((acc, p) => acc + p.average, 0);
  const counted = withAverage.length;
  const evenSharePct = counted === 0 ? null : round1(100 / counted);
  const rows: WorkloadShare[] = partial.map((p) => {
    const sharePct = p.average === null || total <= 0 ? null : round1((p.average / total) * 100);
    return {
      member: p.member.key,
      name: p.member.name,
      latest: p.latest,
      average: p.average,
      samples: p.samples,
      sharePct,
      skewPt: sharePct === null || evenSharePct === null ? null : round1(sharePct - evenSharePct),
      level: p.level,
      lastOn: p.lastOn,
      stale: p.stale,
    };
  });
  rows.sort((a, b) => {
    const sa = a.sharePct ?? -1;
    const sb = b.sharePct ?? -1;
    return sb - sa || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0);
  });
  return { rows, counted, evenSharePct, withoutConsent };
}

/**
 * 偏りの 1 文。均等の `WORKLOAD_SKEW_RATIO` 倍以上を負う人が居るときだけ言う (2 人以上で測れる)。
 * 名指しするのは**同意した人**だけ (行がその人しか持たない)。
 */
export function workloadImbalanceNote(d: WorkloadDistribution): string | null {
  if (d.counted < 2 || d.evenSharePct === null) return null;
  const top = d.rows[0];
  if (top === undefined || top.sharePct === null) return null;
  if (top.sharePct < d.evenSharePct * WORKLOAD_SKEW_RATIO) return null;
  return `${top.name} さんに負担が偏っています（均等なら ${d.evenSharePct}% のところ ${top.sharePct}%）。渡せる仕事を 1 つ決めて、今週のうちに頼む相手を決めてください。`;
}

// --- 見本 (同梱の静的スナップショット) ----------------------------------------

/** `SNAPSHOT.mentor` の形。聞き取りの問いの台帳だけで、人の記録は持たない。 */
export interface MentorSnapshot {
  readonly questions: readonly MentorQuestion[];
  readonly checkinIntervalDays: number;
}

export function buildMentorSnapshot(): MentorSnapshot {
  return { questions: MENTOR_QUESTIONS, checkinIntervalDays: CHECKIN_INTERVAL_DAYS };
}
