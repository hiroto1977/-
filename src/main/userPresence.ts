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

export const WINDOW_MS = 60_000;
/** 1 分あたりの上限 (段階ごと)。確かめる段階は人の速さ以上に速く来たら怪しい。 */
export const RATE_LIMIT: Readonly<Record<Tier, number>> = {
  destructive: 3,
  'credential-write': 6,
  'external-write': 10,
  egress: 20,
  'local-write': 60,
  read: 120,
};
export const DENIAL_WINDOW_MS = 10 * 60_000;
export const DENIALS_TO_LOCK = 3;
export const BASE_LOCKOUT_MS = 5 * 60_000;
export const MAX_LOCKOUT_MS = 60 * 60_000;
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
}

export type PresenceDecision = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type PresenceEventKind = 'approved' | 'denied-by-user' | 'locked-out' | 'rate-limited' | 'busy' | 'untrusted-sender' | 'dialog-failed';

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

export function safeSummary(text: string): string {
  const flat = stripUnsafe(text).replace(/\s+/g, ' ').trim();
  return moreThanChars(flat, MAX_SUMMARY_CHARS) ? `${clampToCeiling(flat, MAX_SUMMARY_CHARS)}…` : flat;
}

/** 1 つの値を見せる長さ。超えたら切って全体の長さを添える (切ったことを必ず述べる)。 */
export const MAX_VALUE_CHARS = 60;
/** 見せる欄の数。超えた分は名前と件数だけ。 */
export const MAX_FIELDS_SHOWN = 24;
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
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) return '(内容なし)';
  const shown = entries.slice(0, MAX_FIELDS_SHOWN).map(([k, v]) => `${safeSummary(k).slice(0, 24)}: ${describeValue(v)}`);
  if (entries.length > MAX_FIELDS_SHOWN) {
    const rest = entries.slice(MAX_FIELDS_SHOWN).map(([k]) => safeSummary(k).slice(0, 24));
    shown.push(`ほか ${rest.length} 欄: ${rest.join(', ')}`);
  }
  return shown.join(' / ');
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
}

export function createPresenceGate(deps: PresenceDeps): PresenceGate {
  const now = deps.now ?? (() => Date.now());
  const events: PresenceEvent[] = [];
  const calls: Record<string, number[]> = {};
  let denials: number[] = [];
  let lockedUntil = 0;
  let lockoutMs = BASE_LOCKOUT_MS;
  let pending = false;

  function record(kind: PresenceEventKind, req: PresenceRequest): void {
    events.push({ at: now(), kind, channel: req.channel, tier: req.tier });
    if (events.length > MAX_EVENTS) events.shift();
  }

  function deny(kind: PresenceEventKind, req: PresenceRequest, message: string): PresenceDecision {
    record(kind, req);
    return { ok: false, message };
  }

  return {
    recentEvents: () => events.slice(),
    async guard(req, trustedSender) {
      if (!trustedSender) {
        return deny('untrusted-sender', req, '信頼できない呼び出し元のため断りました。');
      }
      const t = now();

      // 速度の制限 (段階ごと)。断った呼び出しも数える —— 連打で上限を押し続ける間は通らない。
      const list = (calls[req.tier] ??= []).filter((x) => within(t, x, WINDOW_MS));
      list.push(t);
      calls[req.tier] = list;
      if (list.length > RATE_LIMIT[req.tier]) {
        return deny('rate-limited', req, '短時間に操作が集中したため断りました。しばらく待ってからやり直してください。');
      }

      if (!CONFIRMED_TIERS.has(req.tier)) return { ok: true };

      if (t < lockedUntil) {
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
        allowed = (await deps.confirm({ ...req, summary })) === true;
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

      denials = denials.filter((x) => within(after, x, DENIAL_WINDOW_MS));
      denials.push(after);
      record('denied-by-user', req);
      if (denials.length >= DENIALS_TO_LOCK) {
        lockedUntil = after + lockoutMs;
        lockoutMs = Math.min(lockoutMs * 2, MAX_LOCKOUT_MS);
        denials = [];
      }
      return { ok: false, message: '確認が許可されなかったため実行しませんでした。' };
    },
  };
}
