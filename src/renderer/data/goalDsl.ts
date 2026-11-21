/**
 * ゴール・タスク・予定を **1 つの書き方で表す小さな業務 DSL** (純ロジック・IO なし)。
 *
 * 字句解析 → 構文解析 → 検査して木 (`GoalDslDoc`) にする。エラーは例外にせず
 * `{ ok: false, errors: [{ line, message }] }` (日本語・行番号つき)。
 * 木と文は**往復する** —— `parseGoalDsl(serializeGoalDsl(doc))` は doc と等しい。
 * ゴールコーチの状態 (`CoachState`) との相互変換は `goalDslCoach.ts`。
 *
 * ## 書き方 (1 行に 1 項目。入れ子は半角の空白 2 つで 1 段)
 *
 * ```
 * 目的: 家族を安心させる
 *   目標 2027-12-31: 月の売上を 100 万円にする
 *     節目 2027-06-30: 営業の仕組みを作る
 *       タスク 30分: 見込み客 10 件に連絡
 *       タスク 2027-01-05 45分 済: 提案書の雛形を作る
 *   予定 2027-01-05 60分: 税理士と打合せ
 * # 行頭が # の行と空行は読み飛ばす
 * ```
 *
 * - 行頭の語は `目的` / `目標` / `節目` / `タスク` / `予定`。続けて指定 (順不同・各 1 回まで) と `:` (全角 `：` も可)・題名。
 *   指定は **日付** (暦に在る `YYYY-MM-DD`) / **分数** (`30分`・`タスク` と `予定` だけ・1〜45 の半角整数) / **済**。
 *   `予定` は日付が要る。タスクと予定は**葉** (その下に項目を書けない)。
 * - 指定の部分は NFKC に畳んで読む (全角数字・全角コロンも通る)。題名は 1 字も変えない。
 *
 * ## 守り (外から貼られた文を信用しない)
 *
 * - **値は常に文字列か数として持つ**。式として評価する物・保存・通信・動的 import は 1 つも無い (この
 *   ファイルは import だけで外へ触れない)。
 * - **制御文字・不可視文字・双方向制御 (Trojan Source) は 1 字でも断る** (`escapeInvisibleUnits` の判定 =
 *   `lint:charset` の群 + ZWJ/ZWNJ。絵文字の連結も断る厳しい側)。タブも断る (インデントは空白だけ)。
 * - **天井は切らずに断る** (`MAX_DSL_*`)。数えるのは文字 (`countChars` / `moreThanChars`) で、
 *   巨大な入力は先頭の数え始めで止まる (O(天井))。構文解析は反復で、入れ子の深さで再帰しない。
 */

import { escapeInvisibleUnits } from '../../shared/escape';
import { moreThanChars } from '../../shared/inputCeiling';
import { calendarDateMessage, isCalendarDate } from '../../shared/isoDate';
import { readNumeric } from '../../shared/readNumeric';
import { MAX_NODES, MAX_TASK_MINUTES } from './goalCoach';

// --- 型 ------------------------------------------------------------------

export type DslKind = 'purpose' | 'goal' | 'milestone' | 'task' | 'event';

export interface GoalDslItem {
  readonly kind: DslKind;
  readonly title: string;
  /** 期日 / 予定の日 (暦に在る ISO 日付)。無ければ null。 */
  readonly due: string | null;
  /** 見込みの所要分 (タスクは 1〜`MAX_DSL_TASK_MINUTES`・予定は 1〜`MAX_DSL_EVENT_MINUTES`)。`task` と `event` だけが持てる。無ければ null。 */
  readonly minutes: number | null;
  readonly done: boolean;
  readonly children: readonly GoalDslItem[];
}

export interface GoalDslDoc {
  /** 根の項目 (書いた順)。 */
  readonly items: readonly GoalDslItem[];
}

export interface DslError {
  /** 1 始まりの行番号。**0 は文全体** (長さの天井など)。 */
  readonly line: number;
  readonly message: string;
}

export type ParseResult = { readonly ok: true; readonly doc: GoalDslDoc } | { readonly ok: false; readonly errors: readonly DslError[] };

// --- 天井 (超えたら**切らずに断る**) -----------------------------------------

/** 文全体の文字数。200 項目 × (インデント + 指定 + 題名 160) が収まる大きさ。 */
export const MAX_DSL_CHARS = 50_000;
/** 行数 (空行・注記行も数える)。 */
export const MAX_DSL_LINES = 1_000;
/** 1 行の文字数 (注記行も)。題名 160 + インデントと指定が収まる大きさ。 */
export const MAX_DSL_LINE_CHARS = 400;
/** 項目数。ゴールコーチの木の上限と同じ 1 つを読む。 */
export const MAX_DSL_NODES = MAX_NODES;
/** 入れ子の段数 (根が 1 段目)。コーチの木は 4 段。 */
export const MAX_DSL_DEPTH = 8;
/** 題名の文字数。ゴールコーチが保存する題名の上限と同じ (検査が一致を見る)。 */
export const MAX_DSL_TITLE_CHARS = 160;
/** 1 回の解析で言うエラーの数 (これを超えたら以降は確かめない)。 */
export const MAX_DSL_ERRORS = 20;
/** タスク 1 つの上限分 — ゴールコーチの物を読む (数を写さない)。 */
export const MAX_DSL_TASK_MINUTES = MAX_TASK_MINUTES;
/** 予定 1 つの上限分 (1 日 = 24 時間)。予定は「割る」対象ではなく、打合せなど長い物がある。 */
export const MAX_DSL_EVENT_MINUTES = 24 * 60;

// --- 語彙 -----------------------------------------------------------------

export const DSL_WORDS: Readonly<Record<DslKind, string>> = {
  purpose: '目的',
  goal: '目標',
  milestone: '節目',
  task: 'タスク',
  event: '予定',
};

const KIND_BY_WORD: ReadonlyMap<string, DslKind> = new Map(
  (Object.keys(DSL_WORDS) as DslKind[]).map((k) => [DSL_WORDS[k], k] as const),
);

const WORD_LIST = (Object.keys(DSL_WORDS) as DslKind[]).map((k) => DSL_WORDS[k]).join(' / ');

/** 子を持てない種類。 */
export const isLeafKind = (k: DslKind): boolean => k === 'task' || k === 'event';
/** 分数を持てる種類。 */
export const takesMinutes = (k: DslKind): boolean => k === 'task' || k === 'event';
/** 種類ごとの分数の上限 (タスクは今日の一手の大きさ・予定は 1 日)。 */
export const maxMinutesOf = (k: DslKind): number => (k === 'event' ? MAX_DSL_EVENT_MINUTES : MAX_DSL_TASK_MINUTES);

const minutesRangeMessage = (k: DslKind): string =>
  k === 'event'
    ? `予定の分数は 1〜${MAX_DSL_EVENT_MINUTES} の整数で書いてください`
    : `分数は 1〜${MAX_DSL_TASK_MINUTES} の整数で書いてください (1 つの作業は ${MAX_DSL_TASK_MINUTES} 分までに割ります)`;

const INDENT_UNIT = 2;

// --- 項目の検査 (parse と validate が同じ 1 つを読む) ---------------------------

/** 見えない字 (制御・書式・行区切り) を含むか。 */
export function hasInvisibleChar(s: string): boolean {
  return escapeInvisibleUnits(s) !== s;
}

/** 最初の見えない字の `U+XXXX` (無ければ null)。 */
function firstInvisible(s: string): string | null {
  for (const ch of s) {
    if (escapeInvisibleUnits(ch) !== ch) return `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return null;
}

const KIND_SET: ReadonlySet<string> = new Set(Object.keys(DSL_WORDS));

/**
 * 1 項目の欄の誤り (無ければ null)。**行の文法ではなく欄の値**だけを見る —— 解析した行と
 * 手で組んだ木 (`validateGoalDslDoc`) の両方が通る 1 つ。
 */
export function itemProblem(item: {
  readonly kind: unknown;
  readonly title: unknown;
  readonly due: unknown;
  readonly minutes: unknown;
  readonly done: unknown;
}): string | null {
  if (typeof item.kind !== 'string' || !KIND_SET.has(item.kind)) return '種類が読めません';
  const kind = item.kind as DslKind;
  const title = item.title;
  if (typeof title !== 'string' || title.trim() === '') return '題名がありません';
  if (title !== title.trim()) return '題名の前後に空白は置けません';
  const bad = firstInvisible(title);
  if (bad !== null) return `題名に使えない文字 (${bad}) があります。制御文字・不可視文字・双方向制御は使えません`;
  if (moreThanChars(title, MAX_DSL_TITLE_CHARS)) return `題名は ${MAX_DSL_TITLE_CHARS} 文字までです`;
  if (item.due !== null && !isCalendarDate(item.due)) {
    return typeof item.due === 'string' ? `${calendarDateMessage('日付')} (「${item.due}」は読めません)` : calendarDateMessage('日付');
  }
  if (kind === 'event' && item.due === null) return '予定には日付が要ります (例: 予定 2027-01-05: 打合せ)';
  if (item.minutes !== null) {
    if (!takesMinutes(kind)) return `分数は ${DSL_WORDS.task} と ${DSL_WORDS.event} だけが持てます`;
    const m = item.minutes;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > maxMinutesOf(kind)) return minutesRangeMessage(kind);
  }
  if (typeof item.done !== 'boolean') return '済みかどうかが読めません';
  return null;
}

// --- 構文解析 ---------------------------------------------------------------

interface Draft {
  kind: DslKind;
  title: string;
  due: string | null;
  minutes: number | null;
  done: boolean;
  children: Draft[];
}

interface Head {
  readonly kind: DslKind;
  readonly due: string | null;
  readonly minutes: number | null;
  readonly done: boolean;
}

/** 指定の部分 (`:` の左) を読む。誤りは文字列で返す。 */
function parseHead(headRaw: string): Head | string {
  const tokens = headRaw.normalize('NFKC').trim().split(/\s+/);
  const kind = KIND_BY_WORD.get(tokens[0] ?? '');
  if (kind === undefined) return `行頭は ${WORD_LIST} のどれかで書いてください`;
  let due: string | null = null;
  let minutes: number | null = null;
  let done = false;
  let seenDone = false;
  for (const tok of tokens.slice(1)) {
    if (tok === '済') {
      if (seenDone) return '「済」が 2 回あります';
      seenDone = true;
      done = true;
    } else if (tok.endsWith('分')) {
      if (minutes !== null) return '分数が 2 回あります';
      if (!takesMinutes(kind)) return `分数は ${DSL_WORDS.task} と ${DSL_WORDS.event} だけが持てます`;
      const digits = tok.slice(0, -1);
      const n = readNumeric(digits);
      if (n === null || String(n) !== digits || !Number.isInteger(n)) {
        return `分数は半角の整数で書いてください (例: 30分)。「${tok}」は読めません`;
      }
      minutes = n;
    } else if (tok.charAt(0) >= '0' && tok.charAt(0) <= '9') {
      if (due !== null) return '日付が 2 回あります';
      due = tok; // 暦に在るかは `itemProblem` が 1 か所で決める
    } else {
      return `「${tok}」は読めません。指定は 日付 (YYYY-MM-DD) / 分数 (30分) / 済 のどれかです`;
    }
  }
  return { kind, due, minutes, done };
}

const fail = (errors: readonly DslError[]): ParseResult => ({ ok: false, errors });

/**
 * 文 → 木。**検査に通らなければ木を返さず、全部の誤りを行番号つきで返す** (最大 `MAX_DSL_ERRORS` 件)。
 * 切らずに断る: 天井を超える入力は 1 字も読まずに断る (長さは数え始めで止まる)。
 */
export function parseGoalDsl(text: string): ParseResult {
  if (typeof text !== 'string') return fail([{ line: 0, message: '文字列ではありません' }]);
  if (moreThanChars(text, MAX_DSL_CHARS)) return fail([{ line: 0, message: `文が長すぎます (${MAX_DSL_CHARS} 文字まで)` }]);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > MAX_DSL_LINES) return fail([{ line: 0, message: `行が多すぎます (${MAX_DSL_LINES} 行まで)` }]);

  const errors: DslError[] = [];
  const roots: Draft[] = [];
  /** 今の入れ子の道筋 (stack[i] が i 段目の最後の項目)。 */
  const stack: Draft[] = [];
  let count = 0;

  const bad = (line: number, message: string): void => {
    if (errors.length < MAX_DSL_ERRORS) errors.push({ line, message });
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (errors.length >= MAX_DSL_ERRORS) break;
    const lineNo = i + 1;
    const line = lines[i] ?? '';
    if (moreThanChars(line, MAX_DSL_LINE_CHARS)) {
      bad(lineNo, `1 行が長すぎます (${MAX_DSL_LINE_CHARS} 文字まで)`);
      continue;
    }
    const invisible = firstInvisible(line);
    if (invisible !== null) {
      bad(lineNo, `使えない文字 (${invisible}) があります。制御文字・タブ・不可視文字・双方向制御は使えません`);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    let indent = 0;
    while (line.charAt(indent) === ' ') indent += 1;
    const rest = line.slice(indent);
    if (/^\s/.test(rest)) {
      bad(lineNo, 'インデントは半角の空白だけで書いてください');
      continue;
    }
    if (indent % INDENT_UNIT !== 0) {
      bad(lineNo, `インデントは半角の空白 ${INDENT_UNIT} つで 1 段です`);
      continue;
    }
    const level = indent / INDENT_UNIT;
    if (level >= MAX_DSL_DEPTH) {
      bad(lineNo, `入れ子が深すぎます (${MAX_DSL_DEPTH} 段まで)`);
      continue;
    }
    if (level > stack.length) {
      bad(lineNo, 'インデントは 1 段ずつ深くしてください');
      continue;
    }
    stack.length = level; // 今の段より深い道筋を閉じる

    const colon = rest.search(/[:：]/);
    if (colon < 0) {
      bad(lineNo, '「:」がありません (例: タスク 30分: 見込み客に連絡)');
      stack.push(placeholder());
      continue;
    }
    const head = parseHead(rest.slice(0, colon));
    const title = rest.slice(colon + 1).trim();
    let problem: string | null = null;
    if (typeof head === 'string') problem = head;
    else {
      problem = itemProblem({ kind: head.kind, title, due: head.due, minutes: head.minutes, done: head.done });
    }
    const parent = level > 0 ? stack[level - 1] : undefined;
    if (problem === null && parent !== undefined && isLeafKind(parent.kind)) {
      problem = `${DSL_WORDS[parent.kind]}の下には書けません (葉です)`;
    }
    if (problem !== null) {
      bad(lineNo, problem);
      stack.push(placeholder()); // 子の行が「親が無い」と連鎖して鳴らないように
      continue;
    }
    count += 1;
    if (count > MAX_DSL_NODES) {
      bad(lineNo, `項目が多すぎます (${MAX_DSL_NODES} 件まで)`);
      break;
    }
    const h = head as Head;
    const node: Draft = { kind: h.kind, title, due: h.due, minutes: h.minutes, done: h.done, children: [] };
    (parent === undefined ? roots : parent.children).push(node);
    stack.push(node);
  }
  if (errors.length >= MAX_DSL_ERRORS) errors.push({ line: 0, message: 'エラーが多いため、以降は確かめていません' });
  if (errors.length > 0) return fail(errors);
  return { ok: true, doc: { items: roots } };
}

/** 失敗した行の代わりに道筋へ置く物 (その子の行が連鎖して鳴らない。木には入らない)。 */
function placeholder(): Draft {
  return { kind: 'goal', title: '', due: null, minutes: null, done: false, children: [] };
}

// --- 書き出し ---------------------------------------------------------------

/**
 * 木 → 文。**前提: 木が `validateGoalDslDoc` を通ること** (題名は前後の空白なし・見えない字なし)。
 * 反復で書く (深い木でも再帰しない)。空の木は空文字、それ以外は末尾に改行 1 つ。
 */
export function serializeGoalDsl(doc: GoalDslDoc): string {
  const out: string[] = [];
  const stack: { item: GoalDslItem; depth: number }[] = [];
  for (let i = doc.items.length - 1; i >= 0; i -= 1) stack.push({ item: doc.items[i] as GoalDslItem, depth: 0 });
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { item, depth } = next;
    const attrs = `${item.due === null ? '' : ` ${item.due}`}${item.minutes === null ? '' : ` ${item.minutes}分`}${item.done ? ' 済' : ''}`;
    out.push(`${' '.repeat(depth * INDENT_UNIT)}${DSL_WORDS[item.kind]}${attrs}: ${item.title}`);
    for (let i = item.children.length - 1; i >= 0; i -= 1) stack.push({ item: item.children[i] as GoalDslItem, depth: depth + 1 });
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

/**
 * 手で組んだ木の検査 (`parseGoalDsl` が通す物と同じ規則)。誤りの `line` は
 * **`serializeGoalDsl` が書く行の番号** (先行順に 1 項目 1 行)。深すぎる木・多すぎる木は
 * 入口で断り、それ以上は辿らない (敵性の木でも O(天井))。
 */
export function validateGoalDslDoc(doc: GoalDslDoc): readonly DslError[] {
  const errors: DslError[] = [];
  const bad = (line: number, message: string): void => {
    if (errors.length < MAX_DSL_ERRORS) errors.push({ line, message });
  };
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.items)) return [{ line: 0, message: '木の形ではありません' }];
  let line = 0;
  const stack: { item: unknown; depth: number }[] = [];
  for (let i = doc.items.length - 1; i >= 0; i -= 1) stack.push({ item: doc.items[i], depth: 0 });
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    line += 1;
    if (errors.length >= MAX_DSL_ERRORS) break;
    if (line > MAX_DSL_NODES) {
      bad(line, `項目が多すぎます (${MAX_DSL_NODES} 件まで)`);
      break;
    }
    const { item, depth } = next;
    if (typeof item !== 'object' || item === null) {
      bad(line, '項目の形ではありません');
      continue;
    }
    const it = item as Partial<Record<keyof GoalDslItem, unknown>>;
    const problem = itemProblem({ kind: it.kind, title: it.title, due: it.due, minutes: it.minutes, done: it.done });
    if (problem !== null) bad(line, problem);
    if (depth >= MAX_DSL_DEPTH) {
      bad(line, `入れ子が深すぎます (${MAX_DSL_DEPTH} 段まで)`);
      continue;
    }
    if (!Array.isArray(it.children)) {
      bad(line, '子の一覧が読めません');
      continue;
    }
    if (it.children.length > 0 && typeof it.kind === 'string' && KIND_SET.has(it.kind) && isLeafKind(it.kind as DslKind)) {
      bad(line, `${DSL_WORDS[it.kind as DslKind]}の下には項目を置けません (葉です)`);
      continue;
    }
    // 子を逆順に積む → 先行順 (serialize と同じ行番号) で出てくる。
    // 子が `MAX_DSL_NODES` を超える巨大な配列でも、積むのは天井までにして O(天井) に保つ。
    const kids = it.children as readonly unknown[];
    const take = Math.min(kids.length, MAX_DSL_NODES + 1);
    for (let i = take - 1; i >= 0; i -= 1) stack.push({ item: kids[i], depth: depth + 1 });
  }
  return errors;
}
