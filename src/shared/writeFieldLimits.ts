/**
 * **外へ書く欄の上限 —— 送り先ごとに 1 つの台帳を、両ビルドと画面と音声が読む。**
 *
 * ## なぜ要るか (2026-09-09 · パス 110)
 *
 * 外部サービスへ**書く**操作 (Slack へ送る・GitHub に issue を立てる・カレンダーに
 * 予定を入れる) の欄は、2026-09-09 まで**型も長さの上限も無かった**:
 *
 * | 場所 | 検査 |
 * | --- | --- |
 * | `main/clients/slack.ts` `sendMessage` | `if (!channel \|\| !text)` だけ (真偽値の検査。object でも通る) |
 * | `main/clients/github.ts` `createIssue` | 同上。`labels` は届いた JSON をそのまま転送 |
 * | `main/clients/calendar.ts` `createEvent` | 同上 |
 * | `renderer/data/saasWriteWeb.ts` (ブラウザ版の双子) | `typeof === 'string'` は見るが**長さは見ない** |
 * | `SlackPage` / `GithubPage` / `CalendarPage` の入力欄 | `maxLength` **0 件** |
 *
 * 一方、同じ形の欄には上限が在る —— 業務メモ `MAX_RECORD_NOTE_CHARS` (2000)、
 * AI への質問 `MAX_ADVISOR_QUESTION_CHARS` (1000、制御文字も断る)、
 * そして**同じ `saasWriteWeb.ts` の中**の Atlassian の email `MAX_ATLASSIAN_EMAIL` (254)。
 * **外へ書く家系だけが上限を持たず、規準は同じファイルに在った** (15 か所目)。
 *
 * ## これは安全上限であって、設定ではない
 *
 * 貼り付けた数 MB の本文をそのまま外へ送らないための天井で、法定値でも参考値でもない。
 * `parameters.ts` の台帳には**載せない** (CLAUDE.md: 安全上限は台帳に載せない)。
 * **送り先の仕様上の上限は主張しない** —— このリポジトリからは確かめられないので、
 * ここに書く数はこの app の天井である。
 *
 * ## 1 つの台帳を 5 か所が読む
 *
 * main の handler (断る)・ブラウザ版の双子 (断る)・画面の `maxLength` (入れさせない)・
 * 音声の台帳 `voiceWriteRequirements.ts` (必須欄を導く)・検査 (突き合わせる)。
 * **数を写さない** —— `recordEntryLimits.ts` が 5 か所の写しを 1 つに寄せたのと同じ理由。
 */

export interface WriteFieldRule {
  /** 無ければ断るか。 */
  readonly required: boolean;
  /** 文字数の天井 (この app の安全上限)。 */
  readonly max: number;
  /** 改行を許すか (本文は許し、識別子・題名は許さない)。 */
  readonly multiline: boolean;
}

export type WriteFieldProblem = 'missing' | 'not-string' | 'too-long' | 'control-chars';

/** 識別子 (チャンネル・owner・repo・時間帯・日時文字列) の天井。 */
export const MAX_WRITE_ID_CHARS = 200;
/** 題名 (issue の title・予定の summary・場所) の天井。 */
export const MAX_WRITE_TITLE_CHARS = 256;
/** 本文 (Slack の text・issue の body・予定の description) の天井。 */
export const MAX_WRITE_TEXT_CHARS = 20_000;
/** GitHub のラベルは件数と 1 件の長さを別に見る。 */
export const MAX_WRITE_LABELS = 20;
export const MAX_WRITE_LABEL_CHARS = 50;

const id = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_ID_CHARS, multiline: false });
const title = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_TITLE_CHARS, multiline: false });
const text = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_TEXT_CHARS, multiline: true });

/** `slack/send-message` の欄。 */
export const SLACK_MESSAGE_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  channel: id(true),
  text: text(true),
};

/** `github/create-issue` の欄 (`labels` は {@link checkWriteLabels} で別に見る)。 */
export const GITHUB_ISSUE_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  owner: id(true),
  repo: id(true),
  title: title(true),
  body: text(false),
};

/** `calendar/create-event` の欄。 */
export const CALENDAR_EVENT_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  summary: title(true),
  start: id(true),
  end: id(true),
  description: text(false),
  location: title(false),
  timeZone: id(false),
};

/** 台帳から必須欄の名前を導く (音声の台帳が読む —— 手で写さない)。 */
export function requiredWriteFields(fields: Readonly<Record<string, WriteFieldRule>>): readonly string[] {
  return Object.entries(fields)
    .filter(([, r]) => r.required)
    .map(([k]) => k);
}

/**
 * 制御文字の判定。1 行の欄は CR / LF / NUL を断る (`checkAdvisorQuestion` と同じ規則)。
 * 本文は改行 (LF / CR) とタブを許し、それ以外の C0 制御文字 (NUL を含む) を断る。
 * 正規表現ではなくコード単位で書くのは、ソースに制御文字を置かないため。
 * `for…of` の 1 要素は空でないので `charCodeAt(0)` は必ず数を返す (サロゲート対は
 * 上位半分 0xD800 以上 = 制御文字ではない)。`?? 0` の倒し込みを置かないのは、
 * 到達しない倒し込みが 0 倒しの母集団を 1 つ増やすから (`lint:zero-fold`)。
 */
function hasForbiddenControl(value: string, multiline: boolean): boolean {
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c === 0) return true;
    if (multiline) {
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
    } else if (c === 10 || c === 13) {
      return true;
    }
  }
  return false;
}

/**
 * 1 つの欄を判定する。**判断はここ 1 つ**。
 *
 * 戻り値は失敗の理由 (`null` なら通す) —— 呼び出し側がそれぞれの流儀
 * (`throw` / `err()`) で伝えられるようにする (`checkAdvisorQuestion` と同じ形)。
 * 任意の欄は `undefined` なら通す。**空文字は「無い」**とみなす (空の題名を
 * 外へ送らない)。
 */
export function checkWriteField(value: unknown, rule: WriteFieldRule): WriteFieldProblem | null {
  if (value === undefined || value === null) return rule.required ? 'missing' : null;
  if (typeof value !== 'string') return 'not-string';
  if (value.trim().length === 0) return rule.required ? 'missing' : null;
  if (value.length > rule.max) return 'too-long';
  if (hasForbiddenControl(value, rule.multiline)) return 'control-chars';
  return null;
}

export interface WriteFieldFailure {
  readonly field: string;
  readonly problem: WriteFieldProblem;
  readonly rule: WriteFieldRule;
}

/**
 * payload の欄をまとめて判定し、**最初の**問題を返す (`null` なら全部通る)。
 * payload が辞書でなければ、台帳の最初の必須欄が `missing` として返る。
 */
export function checkWriteFields(
  payload: unknown,
  fields: Readonly<Record<string, WriteFieldRule>>,
): WriteFieldFailure | null {
  const obj = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  for (const [field, rule] of Object.entries(fields)) {
    const problem = checkWriteField(obj[field], rule);
    if (problem !== null) return { field, problem, rule };
  }
  return null;
}

/** GitHub のラベル: 無くてよい。在るなら文字列の配列で、件数と 1 件の長さに天井。 */
export function checkWriteLabels(labels: unknown): WriteFieldProblem | null {
  if (labels === undefined || labels === null) return null;
  if (!Array.isArray(labels)) return 'not-string';
  if (labels.length > MAX_WRITE_LABELS) return 'too-long';
  for (const l of labels) {
    const p = checkWriteField(l, { required: true, max: MAX_WRITE_LABEL_CHARS, multiline: false });
    if (p !== null) return p;
  }
  return null;
}

/** 断りの文面。`record-entry` の「note は 1-2000 文字で指定してください」と同じ形。 */
export function describeWriteFieldFailure(f: WriteFieldFailure): string {
  switch (f.problem) {
    case 'missing':
      return `${f.field} は必須です`;
    case 'not-string':
      return `${f.field} は文字列で指定してください`;
    case 'too-long':
      return `${f.field} は ${f.rule.max} 文字以内で指定してください`;
    case 'control-chars':
      return `${f.field} に制御文字を含めることはできません`;
  }
}
