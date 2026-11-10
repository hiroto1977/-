// 生成物 —— src/main/userPresence.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * **画面から独立した本人確認の門** (2026-10-21 · パス 546 · threat: T-147)。
 *
 * 前提 (ゼロトラスト): **レンダラーは信用しない**。XSS・取り込んだ文書に仕込まれた指示に従う UI
 * エージェント・悪意のある拡張が画面を動かしても、`window.serviceHub` の口は正しい引数で呼べてしまう。
 * 実測 (2026-10-21): 主プロセスの IPC 15 本に、画面とは別の経路で人に確かめる所は 0 件だった
 * (`showMessageBox` 等の出現 0)。画面側の `window.confirm` は、その画面を操る攻撃者自身が
 * 押せるので本人確認にならない。
 *
 * ここは**主プロセスが出すネイティブのダイアログ**で確かめる (画面の JS からは押せない・見えない物を
 * 偽装できない)。判定は純関数に寄せ、ダイアログは注入する (検査では偽物を渡す)。
 *
 * ## 段階 (`Tier`)
 *
 * - `destructive` / `credential-write` / `external-write`: **毎回、何が起きるかを見せて確かめる**。
 * - `egress` (外部 AI へ送る) / `local-write`: 確かめないが**速度を制限する** (費用と持ち出しの暴走を止める)。
 * - `read`: 制限だけ。
 *
 * ## 進化する (適応) 部分
 *
 * 断られた回数に応じて**自動で締まる**: 10 分に 3 回断られると、確認を出さずに一定時間すべて断る
 * (ロックアウト)。ロックアウトが続くたびに倍にする (上限 1 時間)。確認ダイアログが開いている間の
 * 次の要求は断る (ダイアログの連打で人を疲れさせて「はい」を押させる攻撃を止める)。
 * 起きたことは件数だけを記録し (`recentEvents`)、中身 (payload) は残さない。
 *
 * ## 保証しないこと (正直に)
 *
 * OS 全体を操る攻撃者 (OS 上の画面操作エージェント・マルウェア) はネイティブのダイアログも押せる。
 * この門が止めるのは**アプリの中身 (画面) を乗っ取った攻撃者**である。
 *
 * ## Mamori で書いてある (2026-11-10 · MG-054)
 *
 * 元は TypeScript (541 行)。Node / 時計 / 原型の読みは判断を持たない薄い壁 `userPresenceHost.ts` へ閉じ込め、
 * **判断は全部ここに残した**: 段階ごとの速度の上限・費用の予算・警戒態勢・ロックアウトと減衰・確認の連打を断る・
 * 要約の整え (見えない文字を空白へ)・payload を欄ごとに見せる・資格情報の置き換えで送り先を見せる・信頼できる呼び出し元の判定。
 * 書き直したのは `!` (非 null)・`as`・template 文字列・複合代入・c-for・入れ子の関数宣言・文字列の鍵の添字・
 * 配列の `push` / `shift` (作った const の配列でないものへの変更) で、
 * 表の `RATE_LIMIT[tier]` などは `Map` へ写して引き、組み上がる文字列・数・順序は 1 字も変えていない。
 * 唯一の振る舞いの差は**知らない段階の速度の上限**で、元は表の欄が無く `NaN` と比べて「通す」に倒れていた
 * (型が `Tier` なので呼び手からは届かない) のを、上限 0 として「断る」へ倒した (fail closed)。
 */

import { clampToCeiling, moreThanChars } from '../shared/inputCeiling';
import { fileRequestAllowed } from './fileRequestGate';
import { CONFIRMED_TIERS } from '../shared/actionTier';
import type { Tier } from '../shared/actionTier';
import { hostNow, hostField, hostHasPlainPrototype, hostResolvePath } from './userPresenceHost';

export { ACTION_TIER, CONFIRMED_TIERS, OUTBOUND_TIERS, tierOfAction, type Tier } from '../shared/actionTier';

/**
 * 1 回の呼び出しが外部へ何回分の費用を出すか (threat: T-152)。`assistant/chatAll` は設定済みの
 * 提供者すべてへ同じ要求 (最大 約 38 万字) を送る —— 門が 1 回と数えると、速度の上限 20/分 で
 * 実質 100 回分 (5 社なら 100 リクエスト/分) の課金が通る。実測: 3 社で 1 回の invoke が 3 回課金された。
 * 提供者の数は main の門から見えないので、上限の 5 (AI_PROVIDERS の数) で数える。
 */
export const MAX_CALL_WEIGHT = 5;

const ACTION_WEIGHT = new Map<string, number>([['assistant/chatAll', MAX_CALL_WEIGHT]]);

export function weightOfAction(serviceId: string, action: string): number {
  const key = serviceId + '/' + action;
  return ACTION_WEIGHT.get(key) ?? 1;
}

export const WINDOW_MS = 60000;

/**
 * **費用の予算** (threat: T-158)。速度の上限 (1 分あたり) は**瞬間**しか見ないので、上限ぎりぎりを守って
 * 静かに撃ち続ける攻撃者は止まらない —— 実測: `assistant/chatAll` を 4 回/分で 1 時間撃つと重み 1,200 が通り
 * (5 社へ最大 約 38 万字ずつ)、警戒態勢にも入らず、1 日で 28,800 になる。課金される段階 (確認を出さない
 * `egress`) にだけ、**1 時間と 1 日の重みの合計**の上限を置く。確認を出す段階は人が毎回止めるので要らない。
 * 数えるのは速度の上限を通った呼び出しだけ (費用が出た分)・警戒中は 1/4・超えた呼び出しは警戒に数えない
 * (重く使う正規の利用者を警戒態勢へ落とさない)。
 */
export const BUDGET_HOUR_MS = 60 * 60000;

export const BUDGET_DAY_MS = 24 * BUDGET_HOUR_MS;

export const BUDGET: Readonly<Partial<Record<Tier, { readonly perHour: number; readonly perDay: number }>>> = { egress: { perHour: 300, perDay: 1500 } };

/**
 * 費用の予算に数えない口 (T-180)。`egress` の予算は課金される AI 呼び出しの量を抑えるためで、無料の
 * リンクを開く操作 (`app:openExternal` · 窓の遷移も同じ口) を数えると、1 時間に約 300 回開いただけで
 * 有料の `assistant/chat` が「費用の上限」で断られる (リンクは黙って開かないだけ)。速度の上限は別に効く。
 */
export const BUDGET_FREE_CHANNELS: ReadonlySet<string> = new Set<string>(['app:openExternal', 'oauth:authorize']);

/** 1 分あたりの上限 (段階ごと)。確かめる段階は人の速さ以上に速く来たら怪しい。 */
export const RATE_LIMIT: Readonly<Record<Tier, number>> = { destructive: 3, 'credential-write': 6, 'external-write': 10, egress: 20, 'local-write': 60, read: 120 };

const RATE_BY_TIER = new Map<string, number>(Object.entries(RATE_LIMIT));

const BUDGET_BY_TIER = new Map<string, { readonly perHour: number; readonly perDay: number } | undefined>(Object.entries(BUDGET));

/**
 * **警戒態勢** (threat: T-155)。確認を断る・速度の上限・信頼できない呼び出し元・別の確認の割り込み・
 * 確認を出せない、そして他の感知器 (`report`: file:// の門が断った要求など) が**短時間に重なる**のは、
 * 画面を乗っ取った者が手探りで穴を探している形である。重なったら門が**自分で締まる**:
 * 確認する範囲が `read` 以外の全段階へ広がり、速度の上限が 1/4 になる。**止めはしない**
 * (止めると誤検知が可用性の事故になる) —— 摩擦を増やして、攻撃の速度を人の速さへ落とす。
 * 警戒の元が途絶えれば `ALERT_MS` 後に平常へ戻る (自動で緩む)。
 */
export const ALARM_WINDOW_MS = 5 * 60000;

export const ALARMS_TO_ALERT = 6;

export const ALERT_MS = 10 * 60000;

export const ALERT_RATE_DIVISOR = 4;

export type Posture = 'normal' | 'alert';

/** 外の感知器が門へ知らせる種類 (中身は運ばない・種類と場所の名前だけ)。 */
export type ExternalSignalKind = 'file-denied' | 'navigation-denied';

export const DENIAL_WINDOW_MS = 10 * 60000;

export const DENIALS_TO_LOCK = 3;

export const BASE_LOCKOUT_MS = 5 * 60000;

export const MAX_LOCKOUT_MS = 60 * 60000;

/** ロックが明けてからこの時間ロックが無ければ、伸びたロックの長さを基準へ戻す (T-156: 減衰が無く、誤って断った利用者も最大 1 時間ロックされ続けた)。 */
export const LOCKOUT_FORGET_MS = 2 * 60 * 60000;

export const MAX_SUMMARY_CHARS = 2400;

export const MAX_EVENTS = 50;

/** 窓の内か。**読めない時刻 (NaN) は窓の内として数える** (fail closed: 数えそこなって上限を緩めない)。 */
function within(now: number, at: number, span: number): boolean {
  return !(now - at >= span);
}

/** いまの態勢。警戒の期限 (`alertUntil`) の手前なら警戒。 */
function postureOf(t: number, alertUntil: number): Posture {
  return (t < alertUntil) ? 'alert' : 'normal';
}

/** 警戒中は上限を 1/4 に (最低 1)。平常はそのまま。 */
function shrunk(n: number, alert: boolean): number {
  return alert ? Math.max(1, Math.floor(n / ALERT_RATE_DIVISOR)) : n;
}

/** 断りの返事を 1 か所で組む (リテラルの `ok: false` が `boolean` に広がらないよう型を付ける)。 */
function denial(message: string): PresenceDecision {
  return { ok: false, message: message };
}

export interface PresenceRequest {
  readonly channel: string;
  readonly tier: Tier;
  /** 何が起きるか (人が読む文)。ダイアログにそのまま出す。 */
  readonly summary: string;
  /** 速度の上限に何回分として数えるか (既定 1・上限 `MAX_CALL_WEIGHT`)。 */
  readonly weight?: number;
  /** 確認を出すときの態勢 (警戒中ならダイアログがそう告げる)。門が付ける —— 呼び出し側は渡さない。 */
  readonly posture?: Posture;
}

export type PresenceDecision = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type PresenceEventKind =
  | 'approved'
  | 'denied-by-user'
  | 'locked-out'
  | 'rate-limited'
  | 'budget-exceeded'
  | 'busy'
  | 'untrusted-sender'
  | 'dialog-failed'
  | 'external-signal'
  | 'posture-alert';

/** 警戒に数える種類。利用者が自分で断った (`denied-by-user`) は別の仕組み (ロックアウト) が数える。 */
const ALARM_KINDS: ReadonlySet<PresenceEventKind> = new Set<PresenceEventKind>(['locked-out', 'rate-limited', 'busy', 'untrusted-sender', 'dialog-failed', 'external-signal']);

export interface PresenceEvent {
  readonly at: number;
  readonly kind: PresenceEventKind;
  readonly channel: string;
  readonly tier: Tier;
}

export interface PresenceDeps {
  /** ネイティブのダイアログで確かめる。許したら true。投げたら断る扱い。 */
  readonly confirm: (req: PresenceRequest) => Promise<boolean>;
  readonly now?: () => number;
}

/**
 * 制御文字・方向制御・不可視文字を空白へ (ダイアログの表示を偽装させない)。
 * 範囲はコード点の対で持つ —— 不可視の文字そのものをソースに書かない (lint:charset)。
 * 内訳: DEL と C1 / soft hyphen / ゼロ幅・方向の印 / 行・段落区切りと双方向制御 / Unicode Tag (T-133) /
 * 見えない埋め文字・異体字選択子 (combining grapheme joiner・hangul filler・khmer inherent vowel・braille blank・
 * variation selectors とその補助面・halfwidth hangul filler)。2026-10-21 レッドチームが素通りを実測: 欄や値を見えなくする / 偽の欄を見せる。
 */
const UNSAFE_RANGES: ReadonlyArray<{ readonly lo: number; readonly hi: number }> = [{ lo: 0x0000, hi: 0x001f }, { lo: 0x007f, hi: 0x009f }, { lo: 0x00ad, hi: 0x00ad }, { lo: 0x061c, hi: 0x061c }, { lo: 0x180e, hi: 0x180e }, { lo: 0x200b, hi: 0x200f }, { lo: 0x2028, hi: 0x202e }, { lo: 0x2060, hi: 0x2064 }, { lo: 0x2066, hi: 0x2069 }, { lo: 0xfeff, hi: 0xfeff }, { lo: 0xe0000, hi: 0xe007f }, { lo: 0x034f, hi: 0x034f }, { lo: 0x115f, hi: 0x1160 }, { lo: 0x17b4, hi: 0x17b5 }, { lo: 0x2800, hi: 0x2800 }, { lo: 0x3164, hi: 0x3164 }, { lo: 0xfe00, hi: 0xfe0f }, { lo: 0xffa0, hi: 0xffa0 }, { lo: 0xe0100, hi: 0xe01ef }];

function isUnsafe(cp: number): boolean {
  for (const r of UNSAFE_RANGES) {
    if (cp >= r.lo && cp <= r.hi) return true;
  }
  return false;
}

function stripUnsafe(text: string): string {
  let out = '';
  for (const ch of text) {
    // 1 文字の `codePointAt(0)` は必ず数になる。`undefined` は届かないが、型の絞り込みのため空白へ倒す (fail closed)。
    const cp = ch.codePointAt(0);
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BooleanLiteral: 反復で取り出した 1 文字は必ず code point を持つので `undefined` の枝には届かない (等価)。
    out = out + (cp === undefined || isUnsafe(cp) ? ' ' : ch);
  }
  return out;
}

/** 要約を整える前に読む長さ。空白を畳むと縮むので天井の数倍を読む (巨大な文字列で確認の前に固まらない · T-174)。 */
const SUMMARY_READ_CAP = MAX_SUMMARY_CHARS * 4;

export function safeSummary(text: string): string {
  // `throttleMessage` 経由 (openPath / revealInFolder ほか) は値を事前に切らずに渡す。警戒中は全 tier が
  // ここを通るので、5,000 万字で main が 22 秒止まった (実測)。読む長さを先に固定する。
  const overRead = moreThanChars(text, SUMMARY_READ_CAP);
  const flat = stripUnsafe(overRead ? clampToCeiling(text, SUMMARY_READ_CAP) : text).replace(/\s+/g, ' ').trim();
  if (moreThanChars(flat, MAX_SUMMARY_CHARS)) return clampToCeiling(flat, MAX_SUMMARY_CHARS) + '…';
  return overRead ? flat + '…' : flat;
}

/** 1 つの値を見せる長さ。超えたら切って全体の長さを添える (切ったことを必ず述べる)。 */
export const MAX_VALUE_CHARS = 60;

/** 見せる欄の数。超えた分は名前と件数だけ。 */
export const MAX_FIELDS_SHOWN = 24;

/** 欄と欄の区切り。 */
const FIELD_SEPARATOR = ' / ';

/** 1 欄の行の最低の長さ (鍵の表示 24 字 + 区切りが必ず収まる)。 */
const FIELD_LINE_MIN_CHARS = 40;

/** 入れ子の中で見せる欄・要素の数と、1 つの値の長さ (T-179)。超えた分は件数で述べる。 */
const MAX_NESTED_SHOWN = 8;

const MAX_NESTED_VALUE_CHARS = 40;

function describeScalar(v: unknown, max: number): string {
  if (typeof v === 'string') {
    const shown = clampToCeiling(safeSummary(clampToCeiling(v, max * 4)), max);
    return moreThanChars(v, max) ? JSON.stringify(shown) + '…(全 ' + String(v.length) + ' 文字)' : JSON.stringify(shown);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '(有限でない数)';
  if (typeof v === 'boolean' || v === null) return String(v);
  return '(' + typeof v + ')';
}

/**
 * 1 つの値を見せる。**入れ子は 1 段だけ中身を見せる** (T-179): 以前は `{入れ子 5 欄}` / `[配列 3 件]` と件数だけで、
 * `shopify/sync-to-*` の `order` (本文・宛先・URL) や Gmail の宛先のように、書き込みの中身が入れ子の中に在る
 * 操作で、確認が「何を書くか」を見せていなかった。2 段目より深い物は件数だけ (深さの上限を固定する)。
 */
function describeValue(v: unknown, depth: number = 0): string {
  if (Array.isArray(v)) {
    if (depth > 0) return '[配列 ' + String(v.length) + ' 件]';
    const items = v.slice(0, MAX_NESTED_SHOWN).map((x) => describeValue(x, 1));
    const more = v.length > MAX_NESTED_SHOWN ? ', …ほか ' + String(v.length - MAX_NESTED_SHOWN) + ' 件' : '';
    return '[' + items.join(', ') + more + ']';
  }
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (depth > 0) return '{入れ子 ' + String(keys.length) + ' 欄}';
    const fields = keys.slice(0, MAX_NESTED_SHOWN).map((k) => keyLabel(k) + ': ' + describeValue(hostField(v, k), 1));
    const more = keys.length > MAX_NESTED_SHOWN ? ', …ほか ' + String(keys.length - MAX_NESTED_SHOWN) + ' 欄' : '';
    return '{' + fields.join(', ') + more + '}';
  }
  return describeScalar(v, depth === 0 ? MAX_VALUE_CHARS : MAX_NESTED_VALUE_CHARS);
}

/**
 * payload を「どの欄に何が入るか」へ。**欄名は全部見せ**(隠れた欄に本物の指示を置かせない)、
 * 値は JSON の引用で示す (値の中の引用符で偽の欄を作らせない)・長い値は切って全体の長さを添える。
 * 値の読みは固定長で止める (巨大な値で確認の前に固まらない)。
 */
export function describePayload(payload: unknown): string {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return '(内容なし)';
  const keys = Object.keys(payload);
  if (keys.length === 0) return '(内容なし)';
  const shownKeys = keys.slice(0, MAX_FIELDS_SHOWN);
  // 「ほか N 欄」の行は先に組む (欄ごとの予算から引くため)。名前を並べるのも固定個数まで (鍵が 100 万個でも
  // 要約が膨らまず、確認の前に固まらない · T-156)。
  let restLine = '';
  if (keys.length > MAX_FIELDS_SHOWN) {
    const rest = keys.slice(MAX_FIELDS_SHOWN, MAX_FIELDS_SHOWN * 2).map(keyLabel);
    const more = keys.length - MAX_FIELDS_SHOWN > rest.length ? ', …' : '';
    restLine = 'ほか ' + String(keys.length - MAX_FIELDS_SHOWN) + ' 欄: ' + rest.join(', ') + more;
  }
  // **欄ごとに予算を割り当てる** (T-172)。以前は 24 欄を素のまま繋いでから全体を MAX_SUMMARY_CHARS で切っていたので、
  // JSON の引用で倍に膨らむ値 (引用符・バックスラッシュ) を先頭の欄に置くと、後ろの欄 (宛先など) が
  // 切り捨てられて確認に出なかった (24 欄は payloadTooWide を通る・実測で 3,668 字 → 2,400 字)。
  // どの欄も予算の中で名前から始まるので、全部の欄名が必ず見える。
  const lineCount = shownKeys.length + (restLine === '' ? 0 : 1);
  const budget = Math.max(FIELD_LINE_MIN_CHARS, Math.floor((MAX_SUMMARY_CHARS - restLine.length - FIELD_SEPARATOR.length * lineCount) / Math.max(1, shownKeys.length)));
  const shown = shownKeys.map((k) => {
  const line = keyLabel(k) + ': ' + describeValue(hostField(payload, k));
  return moreThanChars(line, budget) ? clampToCeiling(line, budget - 1) + '…' : line;
});
  const lines = restLine === '' ? shown : [...shown, restLine];
  return lines.join(FIELD_SEPARATOR);
}

/** 鍵の表示。**長さ無制限の鍵を丸ごと走査しない** (50 MB の鍵で確認より前に 13 秒固まった · T-156)。 */
const KEY_READ_CAP = 96;

const KEY_SHOWN_CHARS = 24;

function keyLabel(k: string): string {
  return safeSummary(clampToCeiling(k, KEY_READ_CAP)).slice(0, KEY_SHOWN_CHARS);
}

/**
 * **payload として受けてよい形か** (T-188)。原始値・配列・素のオブジェクト (`Object.prototype` か `null` が
 * 原型) だけ。IPC の構造化複製は型付き配列・`Map`・`Set`・`Date` なども運べるが、どの action もそれを
 * 欄の入れ物としては読まない。**キーを数え上げる処理 (`for…in` / `Object.keys`) は、これを通してから**。
 */
export function isPlainPayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return true;
  return hostHasPlainPrototype(payload);
}

/**
 * **欄が多すぎる payload か** (T-156)。確認のダイアログが値を見せるのは先頭 `MAX_FIELDS_SHOWN` 欄だけで、
 * 先頭に無害な欄を 24 個置けば、後ろの本物の欄 (`text` など) の値が確認に出ない。正規の操作に 24 欄を
 * 超える物は無いので、超えたら見せ方を工夫せず断る (fail closed)。数えるのは固定個数まで。
 */
export function payloadTooWide(payload: unknown): boolean {
  // null・配列・文字列などは欄を持つ物ではないので数えない。
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  // 型付き配列・Map・Date などは `for…in` の前に断る (T-188): V8 の `for…in` は 25 欄で打ち切る前に
  // **全キーを列挙する**ので、2,000 万要素の Uint8Array 1 つで 7.6 秒・RSS 1 GB (実測)。
  if (!isPlainPayload(payload)) return true;
  // 自分の欄だけを数える (`for…in` + `hasOwn` の形は、平らな物では継承した欄が無いので
  // `hasOwn` の門が等価になる —— 形ごと消した · パス 552)。
  return Object.keys(payload).length > MAX_FIELDS_SHOWN;
}

/**
 * レンダラーが「アプリ自身の画面」から呼んでいるか。同梱の `dist/` の `file:` か、開発時のサーバだけ。
 * 別の窓・フレーム・ナビゲートされた先 (`https://…`) からの呼び出しは信用しない。
 */
export function isTrustedSenderUrl(url: string, distRoot: string, devUrl?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') {
    // file の判定は T-140 の門と同じ関数に 1 つだけ持つ。
    return fileRequestAllowed(url, hostResolvePath(distRoot));
  }
  // 開発サーバが無い (undefined / 空) ときは URL として読めず投げる → 断る。
  try {
    return parsed.origin === new URL(String(devUrl)).origin;
  } catch {
    return false;
  }
}

export interface PresenceGate {
  readonly guard: (req: PresenceRequest, trustedSender: boolean) => Promise<PresenceDecision>;
  readonly recentEvents: () => readonly PresenceEvent[];
  /** いまの態勢。警戒の元が途絶えて `ALERT_MS` が過ぎれば `normal` に戻る。 */
  readonly posture: () => Posture;
  /** 外の感知器 (file:// の門・窓の遷移の門) が「断った」ことを知らせる。中身は受け取らない。 */
  readonly report: (kind: ExternalSignalKind, where: string) => void;
}

export function createPresenceGate(deps: PresenceDeps): PresenceGate {
  const now = deps.now ?? hostNow;
  let events: PresenceEvent[] = [];
  const calls = new Map<string, number[]>();
  // 通った呼び出しの重みを 1 件 1 要素で (費用の予算 · 1 日分・長さは 1 日の予算で頭打ち)。
  const spent = new Map<string, number[]>();
  let denials: number[] = [];
  let lockedUntil = 0;
  let lockoutMs = BASE_LOCKOUT_MS;
  let lastLockEnd = 0;
  let pending = false;
  let alarms: number[] = [];
  let alertUntil = 0;
  const push = (kind: PresenceEventKind, channel: string, tier: Tier) => {
  events = [...events, { at: now(), kind: kind, channel: channel, tier: tier }];
  if (events.length > MAX_EVENTS) {
    events = events.slice(1);
  }
};
  // 警戒の元が `ALARMS_TO_ALERT` 件に届いたら警戒へ入る (届いている間は延び続ける)。
  const noteAlarm = (t: number) => {
  // 警戒に要るのは「窓の中の新しい ALARMS_TO_ALERT 件」だけ (配列を伸ばさない · T-156)。
  alarms = [...alarms.filter((x) => within(t, x, ALARM_WINDOW_MS)), t].slice(-ALARMS_TO_ALERT);
  if (alarms.length < ALARMS_TO_ALERT) return;
  const entering = postureOf(t, alertUntil) === 'normal';
  alertUntil = t + ALERT_MS;
  if (entering) {
    push('posture-alert', 'posture', 'read');
  }
};
  const record = (kind: PresenceEventKind, req: PresenceRequest) => {
  push(kind, req.channel, req.tier);
  if (ALARM_KINDS.has(kind)) {
    noteAlarm(now());
  }
};
  const deny = (kind: PresenceEventKind, req: PresenceRequest, message: string) => {
  record(kind, req);
  return denial(message);
};
  return { recentEvents: () => events.slice(), posture: () => postureOf(now(), alertUntil), report: (kind: ExternalSignalKind, where: string) => {
  // 場所の名前は短く切る (呼び手が渡す文字列でも記録を膨らませない・中身は運ばない)。
  push('external-signal', kind + ':' + clampToCeiling(String(where), 60), 'read');
  noteAlarm(now());
}, guard: async (req: PresenceRequest, trustedSender: boolean) => {
  if (!trustedSender) return deny('untrusted-sender', req, '信頼できない呼び出し元のため断りました。');
  const t = now();
  // 速度の制限 (段階ごと)。断った呼び出しも数える —— 連打で上限を押し続ける間は通らない。
  const recent = (calls.get(req.tier) ?? []).filter((x) => within(t, x, WINDOW_MS));
  const w = req.weight;
  const weight = Math.min(Math.max(Number.isInteger(w) ? Number(w) : 1, 1), MAX_CALL_WEIGHT);
  const added: number[] = [];
  let i = 0;
  while (i < weight) {
    added.push(t);
    i = i + 1;
  }
  const rate = RATE_BY_TIER.get(req.tier) ?? 0;
  // 保つのは「上限 + 1 件」まで (T-156): 連打で配列が伸びて 1 呼び出しの費用が増え、門自身が
  // 主プロセスを止める増幅器になった (20,000 回で 8 秒)。新しい側を残せば「上限を超えたか」は同じ答え。
  const kept = [...recent, ...added].slice(-(rate + 1));
  calls.set(req.tier, kept);
  const alert = postureOf(t, alertUntil) === 'alert';
  const limit = shrunk(rate, alert);
  if (kept.length > limit) return deny('rate-limited', req, '短時間に操作が集中したため断りました。しばらく待ってからやり直してください。');
  // 費用の予算 (T-158): 速度の上限を通った呼び出しだけを数える。超える呼び出しは通さず、数えない。
  const budget = BUDGET_FREE_CHANNELS.has(req.channel) ? undefined : BUDGET_BY_TIER.get(req.tier);
  if (budget !== undefined) {
    const history = (spent.get(req.tier) ?? []).filter((x) => within(t, x, BUDGET_DAY_MS));
    const lastHour = history.filter((x) => within(t, x, BUDGET_HOUR_MS)).length;
    const perDay = shrunk(budget.perDay, alert);
    const perHour = shrunk(budget.perHour, alert);
    // 断った呼び出しは数えない。古い要素を落とした `history` を書き戻さなくても、次の呼び出しが同じ窓で落とし直すので答えは同じ
    // (残る古い要素は断る前に保たれていた分だけで、予算の上限を超えて伸びない)。
    if (history.length + weight > perDay || lastHour + weight > perHour) return deny('budget-exceeded', req, '費用の使用量の上限 (1 時間・1 日) に達したため断りました。しばらく待ってからやり直してください。');
    spent.set(req.tier, [...history, ...added]);
  }
  // 警戒中は `read` 以外の全段階を確かめる (平常は CONFIRMED_TIERS だけ)。
  if (!alert && !CONFIRMED_TIERS.has(req.tier)) return { ok: true };
  if (alert && req.tier === 'read') return { ok: true };
  // ロックと断りの数えは、平常から確かめている段階だけ (T-156): 警戒中に広がった確認 (egress / local-write)
  // の断りまでロックに数えると、保存や送信が止まり、漏えいを疑った利用者の取り消しの道まで塞がる。
  // **取り消しの道 (destructive) はロックに数えず、ロックにも塞がれない** (T-178): 資格情報の削除と全消去は
  // 利用者が「漏えいを疑って止める」ための口で、攻撃者が外への書き込み (external-write) を 3 回断らせるだけで
  // その口まで 5 分〜60 分塞がると、読む・送る・保存する経路が残ったまま取り消しだけが使えなくなる。
  // 確認は毎回出る (本人確認は外れない) し、1 分あたりの上限 (3 件・警戒中は 1 件) は別に効く。
  const lockable = CONFIRMED_TIERS.has(req.tier) && req.tier !== 'destructive';
  if (lockable && (t < lockedUntil)) {
    const minutes = Math.ceil((lockedUntil - t) / 60000);
    return deny('locked-out', req, '確認を断った回数が多いため、あと約 ' + String(minutes) + ' 分は操作できません。');
  }
  const summary = safeSummary(req.summary);
  if (pending) return deny('busy', req, '別の確認が開いています。先にそちらへ答えてください。');
  pending = true;
  let allowed: boolean;
  try {
    allowed = await deps.confirm({ ...req, summary: summary, posture: postureOf(now(), alertUntil) }) === true;
  } catch {
    return deny('dialog-failed', req, '確認を出せなかったため断りました。');
  } finally {
    pending = false;
  }
  const after = now();
  if (allowed) {
    record('approved', req);
    return { ok: true };
  }
  record('denied-by-user', req);
  if (lockable) {
    denials = [...denials.filter((x) => within(after, x, DENIAL_WINDOW_MS)), after];
    if (denials.length >= DENIALS_TO_LOCK) {
      if (after - lastLockEnd >= LOCKOUT_FORGET_MS) {
        lockoutMs = BASE_LOCKOUT_MS;
      }
      lockedUntil = after + lockoutMs;
      lastLockEnd = lockedUntil;
      lockoutMs = Math.min(lockoutMs * 2, MAX_LOCKOUT_MS);
      denials = [];
    }
  }
  return { ok: false, message: '確認が許可されなかったため実行しませんでした。' };
} };
}

/** JSON の束で預かる資格情報のうち、送り先 (ホスト) を決める欄 (T-181 · `shared/ai/credentials.ts` の欄名)。 */
const ENDPOINT_FIELDS: readonly string[] = ['ollamaUrl', 'compatUrl'];

/** 値が入っている (空でない文字列の) 欄だけを残す。 */
function filledKeys(o: object, keys: readonly string[]): string[] {
  return keys.filter((k) => typeof hostField(o, k) === 'string' && hostField(o, k) !== '');
}

/**
 * 資格情報を置き換える確認に見せる 1 文 (T-181)。値の「長さと末尾 4 文字」だけでは、JSON の束
 * (AI の資格情報) は末尾が JSON の括りで、**以後のプロンプトの送り先 (compatUrl / ollamaUrl) が別物に
 * 差し替わっても見分けがつかない**。束を解析できたら、送り先のホストと、どの欄に値が入るかを見せる
 * (鍵そのものは見せない)。解析できない物は従来どおり長さと末尾だけ。
 */
export function describeCredentialWrite(serviceId: string, value: string): string {
  const base = safeSummary(serviceId) + ' の資格情報を置き換えます。新しい値: 全 ' + String(value.length) + ' 文字' + (value.length > 8 ? '・末尾「…' + safeSummary(value.slice(-4)) + '」' : '');
  let detail = '';
  // `{` で始まる値だけ束として読む (JSON.parse が成功すれば、`{` で始まる値は必ず物 —— 型の検めは要らない)。
  if (value.trimStart().startsWith('{') && value.length <= 64 * 1024) {
    try {
      const o = JSON.parse(value);
      const hosts = filledKeys(o, ENDPOINT_FIELDS).map((k) => {
  let host = '(読めない URL)';
  try {
    host = new URL(String(hostField(o, k))).host;
  } catch {
    // 読めない URL は読めないと見せる
  }
  return k + ' → ' + safeSummary(host);
});
      detail = '。値が入る欄: ' + safeSummary(filledKeys(o, Object.keys(o)).slice(0, 16).join(', ')) + (hosts.length > 0 ? '。送り先: ' + hosts.join(' / ') : '');
    } catch {
      // JSON でなければ長さと末尾だけ
    }
  }
  return base + detail + '。心当たりが無ければ「実行しない」を選んでください。';
}
