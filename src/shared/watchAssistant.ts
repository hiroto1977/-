/**
 * 見張りアシスタント (2026-11-21) —— 貼り付けたメール・スラック・予定の文から、
 * 平日の要約と返信の下書きを作る。週ごとの数字 (エックス・広告・アナリティクス) の
 * 週次レポートは `renderer/data/watchWeekly.ts` が持つ。
 *
 * **このアシスタントは送信も投稿もしない。** 作るのは文だけで、端末の外へ出す口を
 * 1 つも持たない —— 下書きは持ち主が読み、書き換え、自分の手でメールやスラックへ貼る
 * (「送信や投稿は必ず持ち主が確認してから」を、確認の画面ではなく構造で守る)。
 *
 * 判定は決まった語の表で行う (AI へ送らない)。だから貼り付けた文は端末の外へ出ず、
 * 同じ文には必ず同じ答えが返る。語の表に無い言い回しは拾えない —— 拾えなかった物は
 * 「参考」に入り、要約から消えはしない。
 *
 * 貼り付けた文は第三者が書いた文である。差出人・件名を文へ入れるときは `displayField`
 * (天井 + 見えない字の逃がし) を通す。本文は要約の 1 行にだけ使う。
 */

import { displayField } from './apiResponse';
import { moreThanChars } from './inputCeiling';
import { parseIsoDate, utcMsFromParts } from './isoDate';

/** 文で渡す材料の種類。 */
export const WATCH_TEXT_SOURCES = ['mail', 'slack', 'calendar'] as const;
export type WatchTextSource = (typeof WATCH_TEXT_SOURCES)[number];

export const WATCH_TEXT_SOURCE_LABEL: Readonly<Record<WatchTextSource, string>> = {
  mail: 'メール',
  slack: 'スラック',
  calendar: '予定',
};

/** 見張る 6 つの先と、このアシスタントへの渡し方。画面の先頭の一覧がこれを描く。 */
export const WATCH_SOURCES = [
  { id: 'mail', label: 'メール', kind: 'text', how: '届いた文を貼り付ける' },
  { id: 'calendar', label: '予定', kind: 'text', how: '予定の内容を貼り付ける' },
  { id: 'slack', label: 'スラック (Slack)', kind: 'text', how: 'メッセージの文を貼り付ける' },
  { id: 'x', label: 'エックス (X)', kind: 'numbers', how: '週ごとの数字を入力する' },
  { id: 'ads', label: 'グーグル広告 (Google Ads)', kind: 'numbers', how: '週ごとの数字を入力する' },
  { id: 'analytics', label: 'アナリティクス (Google Analytics)', kind: 'numbers', how: '週ごとの数字を入力する' },
] as const;

/** 入口の天井。表示の天井も同じ数を読む。 */
export const MAX_WATCH_BODY_CHARS = 4000;
export const MAX_WATCH_FROM_CHARS = 60;
export const MAX_WATCH_SUBJECT_CHARS = 120;
/** 1 度に持てる材料の件数 (画面の中だけに在る)。 */
export const MAX_WATCH_ITEMS = 50;
/** 要約の 1 行に使う本文の長さ。 */
export const MAX_WATCH_LINE_CHARS = 60;
/** 1 件から拾う「期限らしき表記」の上限。 */
export const MAX_WATCH_DEADLINES = 5;

export const WATCH_OWNER_NOTE =
  'このアシスタントは送信も投稿もしません。下書きは必ずご自身で読み、【 】の箇所を書き換えてから、メールやスラックへ貼り付けてください。';

export const WATCH_PRIVACY_NOTE =
  '貼り付けた文は、この画面を開いている間だけ端末の中に在ります（保存しません・どこにも送りません）。画面を離れると消えます。';

/** 貼り付けた 1 件。 */
export interface WatchItem {
  readonly source: WatchTextSource;
  /** 差出人・相手の名前 (任意)。 */
  readonly from: string;
  /** 件名 (任意)。 */
  readonly subject: string;
  readonly body: string;
}

export function isWatchTextSource(v: unknown): v is WatchTextSource {
  return (WATCH_TEXT_SOURCES as readonly unknown[]).includes(v);
}

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 画面の入力を材料 1 件にする。直せる文を添えて断る。 */
export function parseWatchItem(input: {
  source?: unknown;
  from?: unknown;
  subject?: unknown;
  body?: unknown;
}): WatchItem {
  if (!isWatchTextSource(input.source)) throw new Error('種類を選んでください');
  const body = trimmed(input.body);
  if (body === '') throw new Error('本文が未入力です（メールやスラックの文を貼り付けてください）');
  if (moreThanChars(body, MAX_WATCH_BODY_CHARS)) {
    throw new Error(`本文は ${MAX_WATCH_BODY_CHARS} 文字以内で貼り付けてください（長いときは要点の部分だけにしてください）`);
  }
  const from = trimmed(input.from);
  if (moreThanChars(from, MAX_WATCH_FROM_CHARS)) {
    throw new Error(`相手の名前は ${MAX_WATCH_FROM_CHARS} 文字以内で入力してください`);
  }
  const subject = trimmed(input.subject);
  if (moreThanChars(subject, MAX_WATCH_SUBJECT_CHARS)) {
    throw new Error(`件名は ${MAX_WATCH_SUBJECT_CHARS} 文字以内で入力してください`);
  }
  return { source: input.source, from, subject, body };
}

/** 材料がこれ以上持てないときの断り。持てるなら null。 */
export function watchItemsFullNote(count: number): string | null {
  if (count < MAX_WATCH_ITEMS) return null;
  return `材料は ${MAX_WATCH_ITEMS} 件までです。済んだ物を × で消してから追加してください。`;
}

/* ───────────── 読み取り (決まった語の表) ───────────── */

/** 急ぎを表す語。照合は NFKC + 小文字にそろえた文に当てる。 */
export const WATCH_URGENT_WORDS = ['至急', '緊急', '早急', '急ぎ', '本日中', '今日中', 'asap', 'urgent'] as const;

/** 返事を求める言い回し。全角の「？」は NFKC で「?」になる。 */
export const WATCH_REPLY_WORDS = [
  '?',
  'ご確認',
  'ご回答',
  'ご返信',
  'お返事',
  'ご連絡ください',
  'お知らせください',
  '教えてください',
  'いかがでしょうか',
  '可能でしょうか',
  'お願いします',
  'お願いいたします',
  'お願い致します',
  'ご検討',
] as const;

/** 日程の相談を表す語。 */
export const WATCH_MEETING_WORDS = ['打ち合わせ', '打合せ', 'ミーティング', '会議', '面談', '日程', '候補日', 'meeting'] as const;

/** お金の話を表す語。 */
export const WATCH_MONEY_WORDS = ['請求', '見積', '支払', '振込', '入金'] as const;

/** 期限を表す語 (日付の表記は下の正規表現が拾う)。 */
export const WATCH_DEADLINE_WORDS = ['本日', '今日', '明日', '明後日', '今週中', '来週', '今月中', '月末', '年内'] as const;

/** 金額の表記 (「¥1,000」「1000円」)。NFKC の後なので「￥」も「¥」になっている。 */
const MONEY_AMOUNT = /¥ ?\d|\d ?円/;

/** 日付の表記 (「2026-11-25」「2026/11/25」「11月25日」「11/25」)。長い形を先に試す。 */
const DATE_MENTION = /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}/g;

export interface WatchSignals {
  readonly urgent: boolean;
  readonly needsReply: boolean;
  readonly meeting: boolean;
  readonly money: boolean;
  /** 期限らしき表記 (見つけた順・重複なし・{@link MAX_WATCH_DEADLINES} 件まで)。 */
  readonly deadlines: readonly string[];
}

const hasAny = (text: string, words: readonly string[]): boolean => words.some((w) => text.includes(w));

/** 件名と本文から合図を読む。予定は返事を求めない (自分の予定なので)。 */
export function readWatchSignals(item: WatchItem): WatchSignals {
  const text = `${item.subject}\n${item.body}`.normalize('NFKC').toLowerCase();
  const found: string[] = [];
  for (const m of text.matchAll(DATE_MENTION)) found.push(m[0]);
  for (const w of WATCH_DEADLINE_WORDS) if (text.includes(w)) found.push(w);
  const deadlines = [...new Set(found)].slice(0, MAX_WATCH_DEADLINES);
  return {
    urgent: hasAny(text, WATCH_URGENT_WORDS),
    needsReply: item.source !== 'calendar' && hasAny(text, WATCH_REPLY_WORDS),
    meeting: hasAny(text, WATCH_MEETING_WORDS),
    money: hasAny(text, WATCH_MONEY_WORDS) || MONEY_AMOUNT.test(text),
    deadlines,
  };
}

/** 要約での並び (上から)。 */
export const WATCH_PRIORITIES = ['urgent', 'reply', 'schedule', 'info'] as const;
export type WatchPriority = (typeof WATCH_PRIORITIES)[number];

export const WATCH_PRIORITY_LABEL: Readonly<Record<WatchPriority, string>> = {
  urgent: '至急',
  reply: '返信が要る',
  schedule: '予定・期限',
  info: '参考',
};

export function watchPriority(item: WatchItem, s: WatchSignals): WatchPriority {
  if (s.urgent) return 'urgent';
  if (s.needsReply) return 'reply';
  if (item.source === 'calendar' || s.meeting || s.deadlines.length > 0) return 'schedule';
  return 'info';
}

/** その 1 件について読み取れた事を、短い語の一覧にする。 */
export function watchReasons(s: WatchSignals): readonly string[] {
  const out: string[] = [];
  if (s.urgent) out.push('至急');
  if (s.needsReply) out.push('要返信');
  if (s.meeting) out.push('日程の相談');
  if (s.money) out.push('お金の話');
  if (s.deadlines.length > 0) out.push(`期限らしき表記: ${s.deadlines.join('・')}`);
  return out;
}

/** 要約の 1 行 —— 件名が在れば件名、無ければ本文の最初の行。 */
export function watchLine(item: WatchItem): string {
  if (item.subject !== '') return displayField(item.subject, MAX_WATCH_SUBJECT_CHARS);
  const first = item.body.split('\n').map((l) => l.trim()).find((l) => l !== '') as string;
  return displayField(first, MAX_WATCH_LINE_CHARS);
}

/** 相手の名前 (未入力なら「相手の名前なし」)。 */
export function watchFromText(item: WatchItem): string {
  return item.from === '' ? '相手の名前なし' : displayField(item.from, MAX_WATCH_FROM_CHARS);
}

/* ───────────── 平日の要約 ───────────── */

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** `YYYY-MM-DD` の曜日 (0 = 日 … 6 = 土)。読めなければ null。 */
export function isoWeekday(iso: unknown): number | null {
  const p = parseIsoDate(iso);
  if (p === null || p.day === null) return null;
  const days = Math.round(utcMsFromParts(p.year, p.month, p.day) / 86_400_000);
  // 1970-01-01 (0 日目) は木曜 (4)。負の日数でも 0〜6 に収まるよう 11 (= 7 + 4) を足す。
  return ((days % 7) + 11) % 7;
}

export interface WatchDigestEntry {
  /** 材料の一覧での位置 (0 始まり)。 */
  readonly index: number;
  readonly source: WatchTextSource;
  readonly from: string;
  readonly line: string;
  readonly reasons: readonly string[];
}

export interface WatchDigestGroup {
  readonly priority: WatchPriority;
  readonly label: string;
  readonly entries: readonly WatchDigestEntry[];
}

export interface WatchDigest {
  /** 「2026-11-20 (金)」。日付が読めなければ空。 */
  readonly dayLabel: string;
  /** 土日なら真 (平日の要約は月〜金に届ける想定)。日付が読めなければ偽。 */
  readonly weekend: boolean;
  readonly total: number;
  readonly bySource: Readonly<Record<WatchTextSource, number>>;
  /** 件数が 1 件以上の群だけ (並びは {@link WATCH_PRIORITIES})。 */
  readonly groups: readonly WatchDigestGroup[];
  /** そのまま読める・コピーできる全文。 */
  readonly text: string;
}

export const WATCH_DIGEST_EMPTY_NOTE =
  'まだ材料がありません。上の欄にメール・スラック・予定の文を貼り付けて「材料を渡す」を押してください。';

function nextStepLine(groups: readonly WatchDigestGroup[]): string {
  const first = groups[0] as WatchDigestGroup;
  if (first.priority === 'urgent') return `次の一手: 「至急」の ${first.entries.length} 件から、返信の下書きを作りましょう。`;
  if (first.priority === 'reply') return `次の一手: 「返信が要る」の ${first.entries.length} 件に、返信の下書きを作りましょう。`;
  if (first.priority === 'schedule') return '次の一手: 予定と期限を、ご自身の予定表で確かめてください。';
  return '次の一手: 急ぎの物・返信が要る物は見つかりませんでした。目を通すだけで大丈夫です。';
}

/**
 * 平日の要約を作る。材料が 0 件なら null (呼び手が {@link WATCH_DIGEST_EMPTY_NOTE} を出す)。
 *
 * 件数・群・全文は同じ一覧から 1 度に組む (数と文が食い違わないように)。
 */
export function buildWatchDigest(items: readonly WatchItem[], todayIso: unknown): WatchDigest | null {
  if (items.length === 0) return null;
  const bySource: Record<WatchTextSource, number> = { mail: 0, slack: 0, calendar: 0 };
  const buckets: Record<WatchPriority, WatchDigestEntry[]> = { urgent: [], reply: [], schedule: [], info: [] };
  items.forEach((item, index) => {
    const s = readWatchSignals(item);
    bySource[item.source] += 1;
    buckets[watchPriority(item, s)].push({
      index,
      source: item.source,
      from: watchFromText(item),
      line: watchLine(item),
      reasons: watchReasons(s),
    });
  });
  const groups = WATCH_PRIORITIES.filter((p) => buckets[p].length > 0).map((p) => ({
    priority: p,
    label: WATCH_PRIORITY_LABEL[p],
    entries: buckets[p],
  }));

  const weekday = isoWeekday(todayIso);
  const dayLabel = weekday === null ? '' : `${String(todayIso)} (${WEEKDAY_NAMES[weekday]})`;
  const weekend = weekday === 0 || weekday === 6;

  const lines: string[] = [];
  lines.push(`【平日の要約】${dayLabel === '' ? '' : `${dayLabel} `}材料 ${items.length} 件 (メール ${bySource.mail} / スラック ${bySource.slack} / 予定 ${bySource.calendar})`);
  if (weekend) lines.push('※ 今日は土日です。平日の要約は月〜金に作る想定ですが、いま受け取っている材料でまとめました。');
  for (const g of groups) {
    lines.push('');
    lines.push(`■ ${g.label} (${g.entries.length} 件)`);
    for (const e of g.entries) {
      const why = e.reasons.length === 0 ? '' : ` (${e.reasons.join(' / ')})`;
      lines.push(`・[${WATCH_TEXT_SOURCE_LABEL[e.source]}] ${e.from} — ${e.line}${why}`);
    }
  }
  lines.push('');
  lines.push(nextStepLine(groups));
  return { dayLabel, weekend, total: items.length, bySource, groups, text: lines.join('\n') };
}

/* ───────────── 返信の下書き ───────────── */

/** 返信の方向。 */
export const WATCH_REPLY_INTENTS = ['accept', 'schedule', 'later', 'thanks', 'decline'] as const;
export type WatchReplyIntent = (typeof WATCH_REPLY_INTENTS)[number];

export const WATCH_REPLY_INTENT_LABEL: Readonly<Record<WatchReplyIntent, string>> = {
  accept: '引き受ける',
  schedule: '日程を調整する',
  later: '確認して後で答える',
  thanks: 'お礼を伝える',
  decline: '丁寧に断る',
};

export function isWatchReplyIntent(v: unknown): v is WatchReplyIntent {
  return (WATCH_REPLY_INTENTS as readonly unknown[]).includes(v);
}

/** 読み取った合図から、最初に選んでおく返信の方向。 */
export function suggestWatchReplyIntent(s: WatchSignals): WatchReplyIntent {
  if (s.meeting) return 'schedule';
  if (s.needsReply || s.money || s.urgent) return 'later';
  return 'thanks';
}

/** 持ち主が書き換える箇所の印。 */
const SLOT_OPEN = '【';

const MAIL_BODY: Readonly<Record<WatchReplyIntent, string>> = {
  accept: 'ご依頼の件、承知いたしました。\n【いつまでに・何をするか】の形で進めます。',
  schedule:
    '日程の件、下記の候補はいかがでしょうか。\n・【候補の日時 1】\n・【候補の日時 2】\n・【候補の日時 3】\nご都合の良い日時をお知らせください。',
  later: 'お問い合わせの件、確認のうえ【いつまでに】あらためてご連絡いたします。\n少しお時間をいただけますと幸いです。',
  thanks: 'ご共有いただいた内容、確かに拝見しました。\nお知らせいただきありがとうございます。',
  decline:
    'せっかくお声がけいただいたのですが、今回は【理由】のため、お受けすることが難しい状況です。\nご期待に沿えず申し訳ございません。',
};

const SLACK_BODY: Readonly<Record<WatchReplyIntent, string>> = {
  accept: '承知しました。【いつまでに・何をするか】で進めます。',
  schedule: '日程の件、【候補の日時 1】か【候補の日時 2】はいかがでしょうか。',
  later: '確認して、【いつまでに】あらためてお返事します。少しお時間をください。',
  thanks: '共有ありがとうございます。確認しました。',
  decline: '申し訳ありません、今回は【理由】のため難しいです。',
};

export interface WatchReplyDraft {
  /** そのままコピーできる全文。 */
  readonly text: string;
  /** 書き換える箇所 (【 】) の数。 */
  readonly slots: number;
}

/** 予定には返信の下書きを作らない (返事をする相手が居ない)。 */
export const WATCH_NO_REPLY_FOR_CALENDAR = '予定には返信の下書きを作りません（返事をする相手が居ないため）。';

/**
 * 返信の下書きを作る。予定は null。
 *
 * 文は決まった型で、相手の名前と件名だけを材料から入れる。本文の中身は写さない ——
 * 相手の文をそのまま返信へ運ばない。
 */
export function draftWatchReply(item: WatchItem, intent: WatchReplyIntent): WatchReplyDraft | null {
  if (item.source === 'calendar') return null;
  const from = item.from === '' ? '' : displayField(item.from, MAX_WATCH_FROM_CHARS);
  let text: string;
  if (item.source === 'mail') {
    const subject = item.subject === '' ? '【件名】' : `Re: ${displayField(item.subject, MAX_WATCH_SUBJECT_CHARS)}`;
    text = [
      `件名: ${subject}`,
      '',
      `${from === '' ? 'ご担当者' : from} 様`,
      '',
      'お世話になっております。【自分の名前】です。',
      'ご連絡ありがとうございます。',
      '',
      MAIL_BODY[intent],
      '',
      '何卒よろしくお願いいたします。',
      '',
      '【署名】',
    ].join('\n');
  } else {
    text = [...(from === '' ? [] : [`${from} さん`]), 'ご連絡ありがとうございます。', SLACK_BODY[intent]].join('\n');
  }
  return { text, slots: text.split(SLOT_OPEN).length - 1 };
}

/** 下書きに添える 1 文 (書き換える箇所の数を言う)。 */
export function watchDraftNote(slots: number): string {
  return `【 】の箇所が ${slots} か所あります。書き換えてから、ご自身で送ってください。`;
}

/* ───────────── 台帳の見出し (fetcher が返す) ───────────── */

export interface WatchSnapshot {
  readonly sources: ReadonlyArray<{ readonly id: string; readonly label: string; readonly kind: 'text' | 'numbers'; readonly how: string }>;
  readonly intents: ReadonlyArray<{ readonly id: WatchReplyIntent; readonly label: string }>;
  readonly ownerNote: string;
}

/** 見張る先と返信の方向の一覧。人の文も数字も持たない。 */
export function buildWatchSnapshot(): WatchSnapshot {
  return {
    sources: WATCH_SOURCES.map((s) => ({ ...s })),
    intents: WATCH_REPLY_INTENTS.map((id) => ({ id, label: WATCH_REPLY_INTENT_LABEL[id] })),
    ownerNote: WATCH_OWNER_NOTE,
  };
}
