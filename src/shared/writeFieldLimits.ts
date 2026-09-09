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
 * ## 3 家系ではなく 12 家系だった (2026-09-09 · パス 111 で訂正)
 *
 * パス 110 は「外へ書く 3 つ」に絞った —— が、`main/clients` で `method: 'POST'` を
 * 外へ投げる handler を数え直すと **16** で、うち AI への送信 3 つ (`emotions/analyze-text` ·
 * `skills/run-skill` · `security/scan-url` はそれぞれ自前の入口を持つ) を除いた
 * **書き込みは 12 家系**。残り 9 家系はすべて同じ形だった:
 *
 * | handler | 検査 (直す前) | 黙って直していた物 |
 * | --- | --- | --- |
 * | `gmail/create-draft` | `!to \|\| !subject` | — (`To:` の CR/LF だけは見ていた) |
 * | `drive/create-folder` | `!name` | ブラウザ版: 文字列でない `parentId` を**落とす** |
 * | `microsoft-365/send-mail` · `create-event` | `!to \|\| !subject` / `!subject \|\| !start \|\| !end` | — (ブラウザ版の双子は無い) |
 * | `canva/create-folder` | `!name` | ブラウザ版: 文字列でない `parentFolderId` を root に**すり替える** |
 * | `notion/create-page` | `!parentPageId \|\| !title` | ブラウザ版: 文字列でない `body` を**落とす** |
 * | `atlassian/create-issue` | `!projectKey \|\| !summary` | ブラウザ版: 文字列でない `description` を**落とす** |
 * | `cloudflare/create-dns-record` | 4 欄の真偽値 | `type` を一覧で見ない (main は `ttl` / `proxied` の型も見ない)・ブラウザ版: 数でない `ttl` を 1 に**すり替える** |
 * | `cloudflare/purge-cache` | `!zoneId` | ブラウザ版: 文字列でない URL を**間引いて**残りをパージする |
 * | `wordpress/create-post-draft` | `!siteId \|\| !title` | main は `status` を一覧で見ない・ブラウザ版: 知らない `status` を draft に**すり替える** |
 *
 * 「落とす / すり替える / 間引く」は、利用者が入れたつもりの物と違う物を外へ送る形
 * (パス 74 / 84 / 89 / 110 と同じ家系)。**壊れた入力は送らずに断る。**
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
 * 母集団 (POST する handler すべてが台帳を読む) は `__tests__/writeFieldLimits.test.ts` が
 * 実装から**導いて**数える (手で書いた一覧は、手で書いた分しか見つけない —— パス 107)。
 */

/** 文字列の欄。 */
export interface WriteFieldRule {
  /** 無ければ断るか。 */
  readonly required: boolean;
  /** 文字数の天井 (この app の安全上限)。 */
  readonly max: number;
  /** 改行を許すか (本文は許し、識別子・題名は許さない)。 */
  readonly multiline: boolean;
  /** 許される値の一覧 (投稿の status / DNS の type)。在れば、それ以外を断る。 */
  readonly choices?: readonly string[];
}

/** 整数の欄 (DNS の ttl)。 */
export interface WriteIntegerRule {
  readonly kind: 'integer';
  readonly required: boolean;
  /** これ未満を断る。 */
  readonly min: number;
}

/** 真偽値の欄 (proxied / purgeEverything)。 */
export interface WriteFlagRule {
  readonly kind: 'flag';
  readonly required: boolean;
}

/** 文字列の配列 (GitHub のラベル・パージする URL)。件数と 1 件の長さを別に見る。 */
export interface WriteListRule {
  readonly kind: 'list';
  readonly required: boolean;
  readonly maxItems: number;
  readonly item: WriteFieldRule;
}

export type WriteRule = WriteFieldRule | WriteIntegerRule | WriteFlagRule | WriteListRule;

export type WriteFieldProblem =
  | 'missing'
  | 'not-string'
  | 'too-long'
  | 'control-chars'
  | 'not-allowed'
  | 'not-integer'
  | 'not-boolean'
  | 'too-many';

/** 識別子 (チャンネル・owner・repo・時間帯・日時文字列・親フォルダ ID) の天井。 */
export const MAX_WRITE_ID_CHARS = 200;
/** 題名 (issue の title・予定の summary・場所・フォルダ名・DNS の name) の天井。 */
export const MAX_WRITE_TITLE_CHARS = 256;
/** 1 行だが長い欄 (宛先・DNS の content・パージする URL) の天井。 */
export const MAX_WRITE_LINE_CHARS = 4096;
/** 本文 (Slack の text・issue の body・予定の description・投稿の content) の天井。 */
export const MAX_WRITE_TEXT_CHARS = 20_000;
/** GitHub のラベルは件数と 1 件の長さを別に見る。 */
export const MAX_WRITE_LABELS = 20;
export const MAX_WRITE_LABEL_CHARS = 50;
/** 1 度にパージする URL の件数の天井。 */
export const MAX_WRITE_URLS = 30;

const id = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_ID_CHARS, multiline: false });
const title = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_TITLE_CHARS, multiline: false });
const line = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_LINE_CHARS, multiline: false });
const text = (required: boolean): WriteFieldRule => ({ required, max: MAX_WRITE_TEXT_CHARS, multiline: true });
const choice = (required: boolean, choices: readonly string[]): WriteFieldRule => ({
  required,
  max: MAX_WRITE_ID_CHARS,
  multiline: false,
  choices,
});
const integer = (required: boolean, min: number): WriteIntegerRule => ({ kind: 'integer', required, min });
const flag = (required: boolean): WriteFlagRule => ({ kind: 'flag', required });
const list = (required: boolean, maxItems: number, item: WriteFieldRule): WriteListRule => ({
  kind: 'list',
  required,
  maxItems,
  item,
});

/** `slack/send-message` の欄。 */
export const SLACK_MESSAGE_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  channel: id(true),
  text: text(true),
};

/** `github/create-issue` の欄 (`labels` は {@link GITHUB_LABELS} で別に見る)。 */
export const GITHUB_ISSUE_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  owner: id(true),
  repo: id(true),
  title: title(true),
  body: text(false),
};

/** GitHub のラベル: 無くてよい。在るなら文字列の配列で、件数と 1 件の長さに天井。 */
export const GITHUB_LABELS: WriteListRule = list(false, MAX_WRITE_LABELS, {
  required: true,
  max: MAX_WRITE_LABEL_CHARS,
  multiline: false,
});

/** `calendar/create-event` の欄。 */
export const CALENDAR_EVENT_FIELDS: Readonly<Record<string, WriteFieldRule>> = {
  summary: title(true),
  start: id(true),
  end: id(true),
  description: text(false),
  location: title(false),
  timeZone: id(false),
};

/** `gmail/create-draft` の欄。`to` の CR/LF は 1 行の欄として断る (`buildRfc2822` の検査は二重の備え)。 */
export const GMAIL_DRAFT_FIELDS = {
  to: line(true),
  subject: title(true),
  body: text(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** `drive/create-folder` の欄。 */
export const DRIVE_FOLDER_FIELDS = {
  name: title(true),
  parentId: id(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** `canva/create-folder` の欄。 */
export const CANVA_FOLDER_FIELDS = {
  name: title(true),
  parentFolderId: id(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** `notion/create-page` の欄。 */
export const NOTION_PAGE_FIELDS = {
  parentPageId: id(true),
  title: title(true),
  body: text(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** `atlassian/create-issue` の欄。 */
export const ATLASSIAN_ISSUE_FIELDS = {
  projectKey: id(true),
  summary: title(true),
  description: text(false),
  issueType: id(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** 投稿の状態。既定は draft —— 一覧に無い物は断る (draft にすり替えない)。 */
export const WORDPRESS_POST_STATUSES = ['draft', 'publish', 'pending', 'private'] as const;

/** `wordpress/create-post-draft` の欄。 */
export const WORDPRESS_POST_FIELDS = {
  siteId: id(true),
  title: title(true),
  content: text(false),
  status: choice(false, WORDPRESS_POST_STATUSES),
} satisfies Readonly<Record<string, WriteRule>>;

/** `microsoft-365/send-mail` の欄 (ブラウザ版の双子は無い —— Electron 版だけの操作)。 */
export const MS365_MAIL_FIELDS = {
  to: line(true),
  subject: title(true),
  body: text(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** `microsoft-365/create-event` の欄。 */
export const MS365_EVENT_FIELDS = {
  subject: title(true),
  start: id(true),
  end: id(true),
  location: title(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** この app が作れる DNS レコードの種別 (画面の選択肢と同じ)。 */
export const CLOUDFLARE_DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const;

/** `cloudflare/create-dns-record` の欄。`ttl` は 1 = 自動 なので 1 以上の整数。 */
export const CLOUDFLARE_DNS_FIELDS = {
  zoneId: id(true),
  type: choice(true, CLOUDFLARE_DNS_TYPES),
  name: title(true),
  content: line(true),
  ttl: integer(false, 1),
  proxied: flag(false),
} satisfies Readonly<Record<string, WriteRule>>;

/**
 * `cloudflare/purge-cache` の欄。`files` と `purgeEverything` のどちらかが要る
 * (その組み合わせは handler が見る —— 台帳は欄ごとの形だけを持つ)。
 */
export const CLOUDFLARE_PURGE_FIELDS = {
  zoneId: id(true),
  files: list(false, MAX_WRITE_URLS, line(true)),
  purgeEverything: flag(false),
} satisfies Readonly<Record<string, WriteRule>>;

/** 台帳から必須欄の名前を導く (音声の台帳が読む —— 手で写さない)。 */
export function requiredWriteFields(fields: Readonly<Record<string, WriteRule>>): readonly string[] {
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
 * 文字列の欄を判定する。**判断はここ 1 つ**。
 *
 * 戻り値は失敗の理由 (`null` なら通す) —— 呼び出し側がそれぞれの流儀
 * (`throw` / `err()`) で伝えられるようにする (`checkAdvisorQuestion` と同じ形)。
 * 任意の欄は `undefined` なら通す。**空文字は「無い」**とみなす (空の題名を
 * 外へ送らない)。一覧のある欄は、一覧に無い値を断る (既定値にすり替えない)。
 */
export function checkWriteField(value: unknown, rule: WriteFieldRule): WriteFieldProblem | null {
  if (value === undefined || value === null) return rule.required ? 'missing' : null;
  if (typeof value !== 'string') return 'not-string';
  if (value.trim().length === 0) return rule.required ? 'missing' : null;
  if (value.length > rule.max) return 'too-long';
  if (hasForbiddenControl(value, rule.multiline)) return 'control-chars';
  if (rule.choices !== undefined && !rule.choices.includes(value)) return 'not-allowed';
  return null;
}

/** 整数の欄: 無くてよければ `undefined` を通し、在るなら `min` 以上の整数だけを通す。 */
export function checkWriteInteger(value: unknown, rule: WriteIntegerRule): WriteFieldProblem | null {
  if (value === undefined || value === null) return rule.required ? 'missing' : null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min) return 'not-integer';
  return null;
}

/** 真偽値の欄: 真偽値そのもの以外 (1 / 'true') を断る (`=== true` ですり替えない)。 */
export function checkWriteFlag(value: unknown, rule: WriteFlagRule): WriteFieldProblem | null {
  if (value === undefined || value === null) return rule.required ? 'missing' : null;
  return typeof value === 'boolean' ? null : 'not-boolean';
}

/** 配列の欄: 配列でなければ断り、件数に天井、1 件ずつ文字列の欄として見る (間引かない)。 */
export function checkWriteList(value: unknown, rule: WriteListRule): WriteFieldProblem | null {
  if (value === undefined || value === null) return rule.required ? 'missing' : null;
  if (!Array.isArray(value)) return 'not-string';
  if (value.length > rule.maxItems) return 'too-many';
  for (const item of value) {
    const problem = checkWriteField(item, rule.item);
    if (problem !== null) return problem;
  }
  return null;
}

/** 欄の種類で判定を振り分ける。 */
export function checkWriteRule(value: unknown, rule: WriteRule): WriteFieldProblem | null {
  if (!('kind' in rule)) return checkWriteField(value, rule);
  switch (rule.kind) {
    case 'integer':
      return checkWriteInteger(value, rule);
    case 'flag':
      return checkWriteFlag(value, rule);
    case 'list':
      return checkWriteList(value, rule);
  }
}

export interface WriteFieldFailure {
  readonly field: string;
  readonly problem: WriteFieldProblem;
  readonly rule: WriteRule;
}

/**
 * payload の欄をまとめて判定し、**最初の**問題を返す (`null` なら全部通る)。
 * payload が辞書でなければ、台帳の最初の必須欄が `missing` として返る。
 */
export function checkWriteFields(
  payload: unknown,
  fields: Readonly<Record<string, WriteRule>>,
): WriteFieldFailure | null {
  const obj = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  for (const [field, rule] of Object.entries(fields)) {
    const problem = checkWriteRule(obj[field], rule);
    if (problem !== null) return { field, problem, rule };
  }
  return null;
}

/** GitHub のラベル ({@link GITHUB_LABELS} を読む)。 */
export function checkWriteLabels(labels: unknown): WriteFieldProblem | null {
  return checkWriteList(labels, GITHUB_LABELS);
}

/** 文字数の天井を持つ規則 (配列なら 1 件の規則)。整数・真偽値には無い。 */
function textRuleOf(rule: WriteRule): WriteFieldRule | null {
  if (!('kind' in rule)) return rule;
  return rule.kind === 'list' ? rule.item : null;
}

/** 断りの文面。`record-entry` の「note は 1-2000 文字で指定してください」と同じ形。 */
export function describeWriteFieldFailure(f: WriteFieldFailure): string {
  switch (f.problem) {
    case 'missing':
      return `${f.field} は必須です`;
    case 'not-string':
      return `${f.field} は文字列で指定してください`;
    case 'too-long': {
      const t = textRuleOf(f.rule);
      return t === null ? `${f.field} が長すぎます` : `${f.field} は ${t.max} 文字以内で指定してください`;
    }
    case 'control-chars':
      return `${f.field} に制御文字を含めることはできません`;
    case 'not-allowed': {
      const t = textRuleOf(f.rule);
      const choices = t?.choices === undefined ? [] : t.choices;
      return `${f.field} は ${choices.join(' / ')} のいずれかで指定してください`;
    }
    case 'not-integer':
      return 'kind' in f.rule && f.rule.kind === 'integer'
        ? `${f.field} は ${f.rule.min} 以上の整数で指定してください`
        : `${f.field} は整数で指定してください`;
    case 'not-boolean':
      return `${f.field} は true / false で指定してください`;
    case 'too-many':
      return 'kind' in f.rule && f.rule.kind === 'list'
        ? `${f.field} は ${f.rule.maxItems} 件以内で指定してください`
        : `${f.field} が多すぎます`;
  }
}
