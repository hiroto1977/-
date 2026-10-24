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
 */
import path from 'node:path';
import { fileRequestAllowed } from './fileRequestGate';
import { clampToCeiling, moreThanChars } from '../shared/inputCeiling';

export type Tier = 'destructive' | 'credential-write' | 'external-write' | 'egress' | 'local-write' | 'read';

/** 毎回、人に確かめる段階。 */
export const CONFIRMED_TIERS: ReadonlySet<Tier> = new Set<Tier>(['destructive', 'credential-write', 'external-write']);

/**
 * 登録 action の段階の台帳 (`service/action`)。**載っていない action は `external-write` として扱う**
 * (fail closed)。台帳は LIVE_ACTIONS と両方向に突き合わせる (`userPresenceCensus.test.ts`)。
 */
export const ACTION_TIER: Readonly<Record<string, Tier>> = {
  'github/create-issue': 'external-write',
  'notion/create-page': 'external-write',
  'slack/send-message': 'external-write',
  'calendar/create-event': 'external-write',
  'atlassian/create-issue': 'external-write',
  'wordpress/create-post-draft': 'external-write',
  'gmail/create-draft': 'external-write',
  'drive/create-folder': 'external-write',
  'canva/create-folder': 'external-write',
  'cloudflare/create-dns-record': 'external-write',
  'cloudflare/purge-cache': 'external-write',
  'microsoft-365/send-mail': 'external-write',
  'microsoft-365/create-event': 'external-write',
  'shopify/sync-to-slack': 'external-write',
  'shopify/sync-to-discord': 'external-write',
  'shopify/sync-to-line': 'external-write',
  'shopify/sync-to-gmail': 'external-write',
  'shopify/sync-to-notion': 'external-write',
  'shopify/sync-to-salesforce': 'external-write',
  'shopify/sync-to-stripe': 'external-write',
  'skills/run-skill': 'egress',
  'security/check-email-breach': 'egress',
  // VirusTotal へ URL を送ると他の利用者から検索できる状態で残り取り消せない (red team 2026-10-21)
  'security/scan-url': 'external-write',
  'emotions/analyze-text': 'egress',
  'ollama/chat': 'egress',
  'stocks/advise': 'egress',
  'business/advise': 'egress',
  'uber-eats/advise': 'egress',
  'demae-can/advise': 'egress',
  'real-estate/advise': 'egress',
  'mutual-funds/advise': 'egress',
  'assistant/chat': 'egress',
  'assistant/chatAll': 'egress',
  'emotions/log-mood': 'local-write',
  'emotions/clear-history': 'destructive',
  'stocks/register-ticker': 'local-write',
  'stocks/unregister-ticker': 'local-write',
  'stocks/export-dashboard': 'local-write',
  'stocks/export-dashboard-md': 'local-write',
  'business/export-dashboard': 'local-write',
  'business/export-dashboard-md': 'local-write',
  'teamradar/save-state': 'local-write',
  'teamradar/export-svg': 'local-write',
  'templates/export-template': 'local-write',
  'talent/save-state': 'local-write',
  'uber-eats/record-entry': 'local-write',
  'demae-can/record-entry': 'local-write',
  'real-estate/record-entry': 'local-write',
  'mutual-funds/record-entry': 'local-write',
  'stocks/backtest': 'read',
  'stocks/compare-strategies': 'read',
  'talent/judge-leader': 'read',
  'assistant/providers': 'read',
  'docstudio/list-collections': 'read',
};

export function tierOfAction(serviceId: string, action: string): Tier {
  const key = `${serviceId}/${action}`;
  return Object.hasOwn(ACTION_TIER, key) ? ACTION_TIER[key]! : 'external-write';
}

/**
 * 1 回の呼び出しが外部へ何回分の費用を出すか (threat: T-152)。`assistant/chatAll` は設定済みの
 * 提供者すべてへ同じ要求 (最大 約 38 万字) を送る —— 門が 1 回と数えると、速度の上限 20/分 で
 * 実質 100 回分 (5 社なら 100 リクエスト/分) の課金が通る。実測: 3 社で 1 回の invoke が 3 回課金された。
 * 提供者の数は main の門から見えないので、上限の 5 (AI_PROVIDERS の数) で数える。
 */
export const MAX_CALL_WEIGHT = 5;
const ACTION_WEIGHT: Readonly<Record<string, number>> = {
  'assistant/chatAll': MAX_CALL_WEIGHT,
};

export function weightOfAction(serviceId: string, action: string): number {
  const key = `${serviceId}/${action}`;
  return Object.hasOwn(ACTION_WEIGHT, key) ? ACTION_WEIGHT[key]! : 1;
}

export const WINDOW_MS = 60_000;
/**
 * **費用の予算** (threat: T-158)。速度の上限 (1 分あたり) は**瞬間**しか見ないので、上限ぎりぎりを守って
 * 静かに撃ち続ける攻撃者は止まらない —— 実測: `assistant/chatAll` を 4 回/分で 1 時間撃つと重み 1,200 が通り
 * (5 社へ最大 約 38 万字ずつ)、警戒態勢にも入らず、1 日で 28,800 になる。課金される段階 (確認を出さない
 * `egress`) にだけ、**1 時間と 1 日の重みの合計**の上限を置く。確認を出す段階は人が毎回止めるので要らない。
 * 数えるのは速度の上限を通った呼び出しだけ (費用が出た分)・警戒中は 1/4・超えた呼び出しは警戒に数えない
 * (重く使う正規の利用者を警戒態勢へ落とさない)。
 */
export const BUDGET_HOUR_MS = 60 * 60_000;
export const BUDGET_DAY_MS = 24 * BUDGET_HOUR_MS;
export const BUDGET: Readonly<Partial<Record<Tier, { readonly perHour: number; readonly perDay: number }>>> = {
  egress: { perHour: 300, perDay: 1500 },
};
/** 1 分あたりの上限 (段階ごと)。確かめる段階は人の速さ以上に速く来たら怪しい。 */
export const RATE_LIMIT: Readonly<Record<Tier, number>> = {
  destructive: 3,
  'credential-write': 6,
  'external-write': 10,
  egress: 20,
  'local-write': 60,
  read: 120,
};
/**
 * **警戒態勢** (threat: T-155)。確認を断る・速度の上限・信頼できない呼び出し元・別の確認の割り込み・
 * 確認を出せない、そして他の感知器 (`report`: file:// の門が断った要求など) が**短時間に重なる**のは、
 * 画面を乗っ取った者が手探りで穴を探している形である。重なったら門が**自分で締まる**:
 * 確認する範囲が `read` 以外の全段階へ広がり、速度の上限が 1/4 になる。**止めはしない**
 * (止めると誤検知が可用性の事故になる) —— 摩擦を増やして、攻撃の速度を人の速さへ落とす。
 * 警戒の元が途絶えれば `ALERT_MS` 後に平常へ戻る (自動で緩む)。
 */
export const ALARM_WINDOW_MS = 5 * 60_000;
export const ALARMS_TO_ALERT = 6;
export const ALERT_MS = 10 * 60_000;
export const ALERT_RATE_DIVISOR = 4;
export type Posture = 'normal' | 'alert';
/** 外の感知器が門へ知らせる種類 (中身は運ばない・種類と場所の名前だけ)。 */
export type ExternalSignalKind = 'file-denied' | 'navigation-denied';
export const DENIAL_WINDOW_MS = 10 * 60_000;
export const DENIALS_TO_LOCK = 3;
export const BASE_LOCKOUT_MS = 5 * 60_000;
export const MAX_LOCKOUT_MS = 60 * 60_000;
/** ロックが明けてからこの時間ロックが無ければ、伸びたロックの長さを基準へ戻す (T-156: 減衰が無く、誤って断った利用者も最大 1 時間ロックされ続けた)。 */
export const LOCKOUT_FORGET_MS = 2 * 60 * 60_000;
export const MAX_SUMMARY_CHARS = 2400;
export const MAX_EVENTS = 50;

/**
 * 窓の内か。**読めない時刻 (NaN) は窓の内として数える** (fail closed: 数えそこなって上限を緩めない)。
 */
function within(now: number, at: number, span: number): boolean {
  return !(now - at >= span);
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
const ALARM_KINDS: ReadonlySet<PresenceEventKind> = new Set<PresenceEventKind>([
  'locked-out',
  'rate-limited',
  'busy',
  'untrusted-sender',
  'dialog-failed',
  'external-signal',
]);

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
 */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f], // DEL と C1
  [0x00ad, 0x00ad], // soft hyphen
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f], // ゼロ幅・方向の印
  [0x2028, 0x202e], // 行/段落区切りと双方向制御
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f], // Unicode Tag (T-133)
  // 見えない埋め文字・異体字選択子 (2026-10-21 レッドチームが素通りを実測): 欄や値を見えなくする / 偽の欄を見せる
  [0x034f, 0x034f], // combining grapheme joiner
  [0x115f, 0x1160], // hangul filler
  [0x17b4, 0x17b5], // khmer inherent vowel
  [0x2800, 0x2800], // braille blank
  [0x3164, 0x3164], // hangul filler
  [0xfe00, 0xfe0f], // variation selectors
  [0xffa0, 0xffa0], // halfwidth hangul filler
  [0xe0100, 0xe01ef], // variation selectors supplement
];

function isUnsafe(cp: number): boolean {
  return UNSAFE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function stripUnsafe(text: string): string {
  let out = '';
  for (const ch of text) out += isUnsafe(ch.codePointAt(0)!) ? ' ' : ch;
  return out;
}

/** 要約を整える前に読む長さ。空白を畳むと縮むので天井の数倍を読む (巨大な文字列で確認の前に固まらない · T-174)。 */
const SUMMARY_READ_CAP = MAX_SUMMARY_CHARS * 4;

export function safeSummary(text: string): string {
  // `throttleMessage` 経由 (openPath / revealInFolder ほか) は値を事前に切らずに渡す。警戒中は全 tier が
  // ここを通るので、5,000 万字で main が 22 秒止まった (実測)。読む長さを先に固定する。
  const overRead = moreThanChars(text, SUMMARY_READ_CAP);
  const flat = stripUnsafe(overRead ? clampToCeiling(text, SUMMARY_READ_CAP) : text).replace(/\s+/g, ' ').trim();
  if (moreThanChars(flat, MAX_SUMMARY_CHARS)) return `${clampToCeiling(flat, MAX_SUMMARY_CHARS)}…`;
  return overRead ? `${flat}…` : flat;
}

/** 1 つの値を見せる長さ。超えたら切って全体の長さを添える (切ったことを必ず述べる)。 */
export const MAX_VALUE_CHARS = 60;
/** 見せる欄の数。超えた分は名前と件数だけ。 */
export const MAX_FIELDS_SHOWN = 24;
/** 欄と欄の区切り。 */
const FIELD_SEPARATOR = ' / ';
/** 1 欄の行の最低の長さ (鍵の表示 24 字 + 区切りが必ず収まる)。 */
const FIELD_LINE_MIN_CHARS = 40;
/** 値を読む前に切る長さ (巨大な文字列で確認の前に固まらない)。 */
const READ_CAP = MAX_VALUE_CHARS * 4;

function describeValue(v: unknown): string {
  if (typeof v === 'string') {
    const shown = clampToCeiling(safeSummary(clampToCeiling(v, READ_CAP)), MAX_VALUE_CHARS);
    return moreThanChars(v, MAX_VALUE_CHARS) ? `${JSON.stringify(shown)}…(全 ${v.length} 文字)` : JSON.stringify(shown);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '(有限でない数)';
  if (typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return `[配列 ${v.length} 件]`;
  if (typeof v === 'object') return `{入れ子 ${Object.keys(v as object).length} 欄}`;
  return `(${typeof v})`;
}

/**
 * payload を「どの欄に何が入るか」へ。**欄名は全部見せ**(隠れた欄に本物の指示を置かせない)、
 * 値は JSON の引用で示す (値の中の引用符で偽の欄を作らせない)・長い値は切って全体の長さを添える。
 * 値の読みは固定長で止める (巨大な値で確認の前に固まらない)。
 */
export function describePayload(payload: unknown): string {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return '(内容なし)';
  const obj = payload as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return '(内容なし)';
  const shownKeys = keys.slice(0, MAX_FIELDS_SHOWN);
  // 「ほか N 欄」の行は先に組む (欄ごとの予算から引くため)。名前を並べるのも固定個数まで (鍵が 100 万個でも
  // 要約が膨らまず、確認の前に固まらない · T-156)。
  let restLine = '';
  if (keys.length > MAX_FIELDS_SHOWN) {
    const rest = keys.slice(MAX_FIELDS_SHOWN, MAX_FIELDS_SHOWN * 2).map(keyLabel);
    const more = keys.length - MAX_FIELDS_SHOWN > rest.length ? ', …' : '';
    restLine = `ほか ${keys.length - MAX_FIELDS_SHOWN} 欄: ${rest.join(', ')}${more}`;
  }
  // **欄ごとに予算を割り当てる** (T-172)。以前は 24 欄を素のまま繋いでから全体を MAX_SUMMARY_CHARS で切っていたので、
  // JSON の引用で倍に膨らむ値 (引用符・バックスラッシュ) を先頭の欄に置くと、後ろの欄 (宛先など) が
  // 切り捨てられて確認に出なかった (24 欄は payloadTooWide を通る・実測で 3,668 字 → 2,400 字)。
  // どの欄も予算の中で名前から始まるので、全部の欄名が必ず見える。
  const lineCount = shownKeys.length + (restLine === '' ? 0 : 1);
  const budget = Math.max(
    FIELD_LINE_MIN_CHARS,
    Math.floor((MAX_SUMMARY_CHARS - restLine.length - FIELD_SEPARATOR.length * lineCount) / Math.max(1, shownKeys.length)),
  );
  const shown = shownKeys.map((k) => {
    const line = `${keyLabel(k)}: ${describeValue(obj[k])}`;
    return moreThanChars(line, budget) ? `${clampToCeiling(line, budget - 1)}…` : line;
  });
  if (restLine !== '') shown.push(restLine);
  return shown.join(FIELD_SEPARATOR);
}

/** 鍵の表示。**長さ無制限の鍵を丸ごと走査しない** (50 MB の鍵で確認より前に 13 秒固まった · T-156)。 */
const KEY_READ_CAP = 96;
const KEY_SHOWN_CHARS = 24;
function keyLabel(k: string): string {
  return safeSummary(clampToCeiling(k, KEY_READ_CAP)).slice(0, KEY_SHOWN_CHARS);
}

/**
 * **欄が多すぎる payload か** (T-156)。確認のダイアログが値を見せるのは先頭 `MAX_FIELDS_SHOWN` 欄だけで、
 * 先頭に無害な欄を 24 個置けば、後ろの本物の欄 (`text` など) の値が確認に出ない。正規の操作に 24 欄を
 * 超える物は無いので、超えたら見せ方を工夫せず断る (fail closed)。数えるのは固定個数まで。
 */
export function payloadTooWide(payload: unknown): boolean {
  // null は `for…in` が 0 回で終わるので別に弾かない。配列と文字列などは欄を持つ物ではないので数えない。
  if (typeof payload !== 'object' || Array.isArray(payload)) return false;
  let n = 0;
  for (const k in payload as Record<string, unknown>) {
    if (!Object.hasOwn(payload as object, k)) continue;
    n += 1;
    if (n > MAX_FIELDS_SHOWN) return true;
  }
  return false;
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
    return fileRequestAllowed(url, path.resolve(distRoot));
  }
  // 開発サーバが無い (undefined / 空) ときは URL として読めず投げる → 断る。
  try {
    return parsed.origin === new URL(String(devUrl)).origin;
  } catch {
    return false;
  }
}

export interface PresenceGate {
  guard(req: PresenceRequest, trustedSender: boolean): Promise<PresenceDecision>;
  recentEvents(): readonly PresenceEvent[];
  /** いまの態勢。警戒の元が途絶えて `ALERT_MS` が過ぎれば `normal` に戻る。 */
  posture(): Posture;
  /** 外の感知器 (file:// の門・窓の遷移の門) が「断った」ことを知らせる。中身は受け取らない。 */
  report(kind: ExternalSignalKind, where: string): void;
}

export function createPresenceGate(deps: PresenceDeps): PresenceGate {
  const now = deps.now ?? (() => Date.now());
  const events: PresenceEvent[] = [];
  const calls: Record<string, number[]> = {};
  /** 通った呼び出しの重みを 1 件 1 要素で (費用の予算 · 1 日分・長さは 1 日の予算で頭打ち)。 */
  const spent: Record<string, number[]> = {};
  let denials: number[] = [];
  let lockedUntil = 0;
  let lockoutMs = BASE_LOCKOUT_MS;
  let lastLockEnd = 0;
  let pending = false;
  let alarms: number[] = [];
  let alertUntil = 0;

  function push(kind: PresenceEventKind, channel: string, tier: Tier): void {
    events.push({ at: now(), kind, channel, tier });
    if (events.length > MAX_EVENTS) events.shift();
  }

  function postureAt(t: number): Posture {
    return t < alertUntil ? 'alert' : 'normal';
  }

  /** 警戒の元が `ALARMS_TO_ALERT` 件に届いたら警戒へ入る (届いている間は延び続ける)。 */
  function noteAlarm(t: number): void {
    alarms = alarms.filter((x) => within(t, x, ALARM_WINDOW_MS));
    alarms.push(t);
    // 警戒に要るのは「窓の中の新しい ALARMS_TO_ALERT 件」だけ (配列を伸ばさない · T-156)。
    alarms = alarms.slice(-ALARMS_TO_ALERT);
    if (alarms.length < ALARMS_TO_ALERT) return;
    const entering = postureAt(t) === 'normal';
    alertUntil = t + ALERT_MS;
    if (entering) push('posture-alert', 'posture', 'read');
  }

  function record(kind: PresenceEventKind, req: PresenceRequest): void {
    push(kind, req.channel, req.tier);
    if (ALARM_KINDS.has(kind)) noteAlarm(now());
  }

  function deny(kind: PresenceEventKind, req: PresenceRequest, message: string): PresenceDecision {
    record(kind, req);
    return { ok: false, message };
  }

  return {
    recentEvents: () => events.slice(),
    posture: () => postureAt(now()),
    report(kind, where) {
      // 場所の名前は短く切る (呼び手が渡す文字列でも記録を膨らませない・中身は運ばない)。
      push('external-signal', `${kind}:${clampToCeiling(String(where), 60)}`, 'read');
      noteAlarm(now());
    },
    async guard(req, trustedSender) {
      if (!trustedSender) {
        return deny('untrusted-sender', req, '信頼できない呼び出し元のため断りました。');
      }
      const t = now();

      // 速度の制限 (段階ごと)。断った呼び出しも数える —— 連打で上限を押し続ける間は通らない。
      const list = (calls[req.tier] ??= []).filter((x) => within(t, x, WINDOW_MS));
      const weight = Math.min(Math.max(Number.isInteger(req.weight) ? req.weight! : 1, 1), MAX_CALL_WEIGHT);
      for (let i = 0; i < weight; i += 1) list.push(t);
      // 保つのは「上限 + 1 件」まで (T-156): 連打で配列が伸びて 1 呼び出しの費用が増え、門自身が
      // 主プロセスを止める増幅器になった (20,000 回で 8 秒)。新しい側を残せば「上限を超えたか」は同じ答え。
      const kept = list.slice(-(RATE_LIMIT[req.tier] + 1));
      calls[req.tier] = kept;
      const alert = postureAt(t) === 'alert';
      const limit = alert ? Math.max(1, Math.floor(RATE_LIMIT[req.tier] / ALERT_RATE_DIVISOR)) : RATE_LIMIT[req.tier];
      if (kept.length > limit) {
        return deny('rate-limited', req, '短時間に操作が集中したため断りました。しばらく待ってからやり直してください。');
      }

      // 費用の予算 (T-158): 速度の上限を通った呼び出しだけを数える。超える呼び出しは通さず、数えない。
      const budget = BUDGET[req.tier];
      if (budget !== undefined) {
        const shrink = (n: number): number => (alert ? Math.max(1, Math.floor(n / ALERT_RATE_DIVISOR)) : n);
        const history = (spent[req.tier] ??= []).filter((x) => within(t, x, BUDGET_DAY_MS));
        const lastHour = history.filter((x) => within(t, x, BUDGET_HOUR_MS)).length;
        if (history.length + weight > shrink(budget.perDay) || lastHour + weight > shrink(budget.perHour)) {
          spent[req.tier] = history;
          return deny('budget-exceeded', req, '費用の使用量の上限 (1 時間・1 日) に達したため断りました。しばらく待ってからやり直してください。');
        }
        for (let i = 0; i < weight; i += 1) history.push(t);
        spent[req.tier] = history;
      }

      // 警戒中は `read` 以外の全段階を確かめる (平常は CONFIRMED_TIERS だけ)。
      if (!alert && !CONFIRMED_TIERS.has(req.tier)) return { ok: true };
      if (alert && req.tier === 'read') return { ok: true };

      // ロックと断りの数えは、平常から確かめている段階だけ (T-156): 警戒中に広がった確認 (egress / local-write)
      // の断りまでロックに数えると、保存や送信が止まり、漏えいを疑った利用者の取り消しの道まで塞がる。
      const lockable = CONFIRMED_TIERS.has(req.tier);
      if (lockable && t < lockedUntil) {
        const minutes = Math.ceil((lockedUntil - t) / 60_000);
        return deny('locked-out', req, `確認を断った回数が多いため、あと約 ${minutes} 分は操作できません。`);
      }

      const summary = safeSummary(req.summary);
      if (pending) {
        return deny('busy', req, '別の確認が開いています。先にそちらへ答えてください。');
      }
      pending = true;
      let allowed: boolean;
      try {
        allowed = (await deps.confirm({ ...req, summary, posture: postureAt(now()) })) === true;
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
        denials = denials.filter((x) => within(after, x, DENIAL_WINDOW_MS));
        denials.push(after);
        if (denials.length >= DENIALS_TO_LOCK) {
          if (after - lastLockEnd >= LOCKOUT_FORGET_MS) lockoutMs = BASE_LOCKOUT_MS;
          lockedUntil = after + lockoutMs;
          lastLockEnd = lockedUntil;
          lockoutMs = Math.min(lockoutMs * 2, MAX_LOCKOUT_MS);
          denials = [];
        }
      }
      return { ok: false, message: '確認が許可されなかったため実行しませんでした。' };
    },
  };
}
