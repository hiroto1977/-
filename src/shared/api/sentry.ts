/**
 * Sentry (エラー監視) —— 未解決の問題 (Issue) を読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/sentry.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `GET /organizations/` | 配列の各要素の `slug`・`name` |
 * | `GET /organizations/<slug>/issues/?query=is:unresolved&limit=21` | 配列の各要素の `shortId`・`title`・`level`・`count`・`lastSeen`・`project.name` |
 *
 * 書き込み (問題の解決・割り当て・削除・コメントほか) は 1 つも持たない。
 * イベントの中身 (スタックトレース・利用者の情報・送信データ) は照会しない。
 *
 * ## 2 つ目の照会は 1 つ目の答えで決まる
 *
 * 問題の照会には組織の slug が要る。使うのは**応答に並んだ、slug の読める 1 つ目**で、slug は
 * 小文字の英数字・`-`・`_` だけであることを確かめてから URL へ入れる ({@link sentryOrgSlug} ·
 * `encodeURIComponent` も通す)。組織が 2 つ以上あるときは、見ていない分が在ることを画面が述べる
 * ({@link sentryScopeNote})。
 *
 * ## 「ほかにも在る」の決め方
 *
 * Sentry は続きの有無を応答のヘッダで伝えるが、ここが受け取るのは本文だけである。
 * 表示する件数 ({@link SENTRY_ISSUE_LIMIT}) より **1 件多く**照会し、それが返ってきたら
 * 「ほかにも在る」と述べる (画面に出すのは先頭の {@link SENTRY_ISSUE_LIMIT} 件まで)。
 *
 * ## 読めなかった物を「無い」と混ぜない
 *
 * - 発生回数は 0 以上の整数だけを受ける (Sentry は 10 進の文字列で返す)。それ以外は「発生回数が読めません」。
 * - 重大度は Sentry の 5 つの値だけを受ける。それ以外は「重大度が読めません」。
 * - 最終発生日が日時として読めなければ「最終発生日が読めません」。
 * - 一覧そのものが読めなかった (応答が配列でない) → `issuesRead: false`。画面が「0 件」と言い分ける。
 * - 読める組織が 1 つも無ければ問題は照会しない (`issuesAsked: false`)。
 */
import { apiNumberOf, displayField, objectRows } from '../apiResponse';
import { displayDateOf } from '../isoDate';
import { has } from '../lookup';
import { refuseDotSegment } from './pathSegment';

/** Sentry API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const SENTRY_API_BASE = 'https://sentry.io/api/0';

/** 組織の一覧の道 (基底は送る所で付ける —— 宛先の走査が送信の行で基底を見られるように)。 */
export const SENTRY_ORGS_PATH = '/organizations/';

/** 未解決の問題を何件まで画面に出すか。 */
export const SENTRY_ISSUE_LIMIT = 20;

/** 重大度。Sentry の 5 つの値。 */
export type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

/** 1 件の問題。 */
export interface SentryIssue {
  /** 問題の番号 (例: `WEB-1A`)。読めなければ空文字。 */
  readonly shortId: string;
  readonly title: string;
  /** 重大度。読めなければ `null`。 */
  readonly level: SentryLevel | null;
  /** 発生回数。読めなければ `null`。 */
  readonly count: number | null;
  /** 最終発生日 (`YYYY-MM-DD`)。読めなければ `null`。 */
  readonly lastSeen: string | null;
  /** プロジェクトの名前。読めなければ空文字。 */
  readonly projectName: string;
}

export interface SentrySnapshot {
  /** 問題を照会した組織の名前。読めなければ空文字。 */
  readonly orgName: string;
  /** 応答に並んだ、slug の読める組織の数。 */
  readonly orgCount: number;
  readonly issues: readonly SentryIssue[];
  /** 組織の一覧を読めたか (応答が配列だった)。 */
  readonly orgsRead: boolean;
  /** 問題を照会したか (読める組織が在った)。 */
  readonly issuesAsked: boolean;
  /** 問題の一覧を読めたか (応答が配列だった)。 */
  readonly issuesRead: boolean;
  /** 表示した分のほかにも問題が在るか。 */
  readonly more: boolean;
}

/** 問題の題名が空だったときの文。 */
export const SENTRY_TITLE_MISSING = '(題名なし)';

/** 重大度が読めなかったときの文。 */
export const SENTRY_LEVEL_UNREADABLE = '重大度が読めません';

/** 発生回数が読めなかったときの文。 */
export const SENTRY_COUNT_UNREADABLE = '発生回数が読めません';

/** 最終発生日が読めなかったときの文。 */
export const SENTRY_LAST_SEEN_UNREADABLE = '最終発生日が読めません';

/** 重大度の呼び名。 */
export const SENTRY_LEVEL_LABELS: Readonly<Record<SentryLevel, string>> = {
  fatal: '致命的',
  error: 'エラー',
  warning: '警告',
  info: '情報',
  debug: 'デバッグ',
};

/**
 * Sentry の組織の slug (小文字の英数字で始まり、小文字の英数字・`-`・`_` が続く。50 字まで)。
 * 読めなければ空文字。両端を留めた照合なので、それ以外の字を 1 字でも含む値は URL へ入らない。
 */
export function sentryOrgSlug(v: unknown): string {
  if (typeof v !== 'string') return '';
  return /^[a-z0-9][a-z0-9_-]{0,49}$/.test(v) ? v : '';
}

/**
 * 未解決の問題の照会の道。`orgSlug` は {@link sentryOrgSlug} を通した値を渡す。
 * ここでも符号化し、`.` と `..` は区間として受けずに断る (符号化では畳み込みを防げない · `pathSegment.ts`)。
 */
export function sentryIssuesPath(orgSlug: string): string {
  return `/organizations/${encodeURIComponent(refuseDotSegment(orgSlug))}/issues/?query=is%3Aunresolved&limit=${SENTRY_ISSUE_LIMIT + 1}`;
}

/** 重大度の欄を読む。表に在る 5 つの値だけを受ける (表そのものの鍵だけ —— prototype 側の名前は読まない)。 */
export function sentryLevel(v: unknown): SentryLevel | null {
  return typeof v === 'string' && has(SENTRY_LEVEL_LABELS, v) ? (v as SentryLevel) : null;
}

/** 発生回数の欄を読む。0 以上の整数 (数か、10 進の文字列) だけを受ける。 */
export function sentryCount(v: unknown): number | null {
  const n = apiNumberOf(v);
  return Number.isInteger(n) && (n as number) >= 0 ? n : null;
}

interface OrgRow {
  readonly slug?: unknown;
  readonly name?: unknown;
}

/** 組織の照会から読んだ物。 */
export interface SentryOrgs {
  /** 問題を照会する組織の slug。読めるものが無ければ空文字。 */
  readonly orgSlug: string;
  readonly orgName: string;
  readonly orgCount: number;
  readonly read: boolean;
}

/** 組織の一覧の応答を読む。slug の読める物だけを数え、1 つ目を使う。 */
export function normalizeSentryOrgs(body: unknown): SentryOrgs {
  const usable = objectRows<OrgRow>(body).filter((o) => sentryOrgSlug(o.slug) !== '');
  const first = usable[0];
  return {
    orgSlug: sentryOrgSlug(first?.slug),
    orgName: displayField(first?.name),
    orgCount: usable.length,
    read: Array.isArray(body),
  };
}

interface IssueRow {
  readonly shortId?: unknown;
  readonly title?: unknown;
  readonly level?: unknown;
  readonly count?: unknown;
  readonly lastSeen?: unknown;
  readonly project?: unknown;
}

/** 問題の照会から読んだ物。 */
export interface SentryIssueList {
  readonly issues: readonly SentryIssue[];
  readonly read: boolean;
  readonly more: boolean;
}

/** 問題の一覧の応答を行へ。画面に出すのは先頭の {@link SENTRY_ISSUE_LIMIT} 件まで。 */
export function normalizeSentryIssues(body: unknown): SentryIssueList {
  const rows = objectRows<IssueRow>(body);
  return {
    issues: rows.slice(0, SENTRY_ISSUE_LIMIT).map((row) => ({
      shortId: displayField(row.shortId),
      title: displayField(row.title),
      level: sentryLevel(row.level),
      count: sentryCount(row.count),
      lastSeen: displayDateOf(row.lastSeen),
      projectName: displayField((Object(row.project) as { name?: unknown }).name),
    })),
    read: Array.isArray(body),
    more: rows.length > SENTRY_ISSUE_LIMIT,
  };
}

/** 2 つの照会の結果から画面の形を組む。問題を照会しなかったときは `issues` に `null` を渡す。 */
export function buildSentrySnapshot(orgs: SentryOrgs, issues: SentryIssueList | null): SentrySnapshot {
  return {
    orgName: orgs.orgName,
    orgCount: orgs.orgCount,
    issues: issues === null ? [] : issues.issues,
    orgsRead: orgs.read,
    issuesAsked: issues !== null,
    issuesRead: issues !== null && issues.read,
    more: issues !== null && issues.more,
  };
}

/** 画面に出す問題の題名 (番号つき)。題名が空なら理由を述べる (空欄にしない)。 */
export function sentryIssueTitle(issue: Pick<SentryIssue, 'shortId' | 'title'>): string {
  const title = issue.title === '' ? SENTRY_TITLE_MISSING : issue.title;
  return issue.shortId === '' ? title : `${issue.shortId} ${title}`;
}

/**
 * 画面に出す重大度の文。表は {@link sentryLevel} を通した値でだけ引く ——
 * 素の値で引くと、`'constructor'` のような鍵が prototype 側の値を返す。
 */
export function sentryLevelText(level: SentryLevel | null): string {
  const l = sentryLevel(level);
  return l === null ? SENTRY_LEVEL_UNREADABLE : SENTRY_LEVEL_LABELS[l];
}

/** 画面に出す発生回数の文 (桁区切りつき)。 */
export function sentryCountText(count: number | null): string {
  return count === null ? SENTRY_COUNT_UNREADABLE : `発生 ${count.toLocaleString('ja-JP')} 回`;
}

/** 画面に出す最終発生日の文。 */
export function sentryLastSeenText(lastSeen: string | null): string {
  return lastSeen === null ? SENTRY_LAST_SEEN_UNREADABLE : `最終発生 ${lastSeen}`;
}

/** 問題 1 件の補足の行 (プロジェクト · 重大度 · 発生回数 · 最終発生日)。読めなかった名前は並べない。 */
export function sentryIssueMeta(issue: SentryIssue): string {
  return [
    issue.projectName,
    `重大度: ${sentryLevelText(issue.level)}`,
    sentryCountText(issue.count),
    sentryLastSeenText(issue.lastSeen),
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * 読めなかった物を名指しする 1 文。全部読めていれば `null`。
 * 原因は上流から順に 1 つだけ述べる (組織の一覧 → 読める組織 → 問題)。
 */
export function sentryIntakeNote(snap: Pick<SentrySnapshot, 'orgsRead' | 'issuesAsked' | 'issuesRead'>): string | null {
  if (!snap.orgsRead) return 'Sentry の応答から組織の一覧を読み取れませんでした (問題は照会していません)。';
  if (!snap.issuesAsked) return 'Sentry の応答に、読める組織がありませんでした (問題は照会していません)。';
  if (!snap.issuesRead) return 'Sentry の応答から未解決の問題の一覧を読み取れませんでした (0 件という意味ではありません)。';
  return null;
}

/**
 * 画面が見せている範囲の断り。見ていない物が無ければ `null`。
 * 組織が 2 つ以上・表示した分のほかにも問題が在る、の 2 つを述べる。
 */
export function sentryScopeNote(snap: Pick<SentrySnapshot, 'orgCount' | 'orgName' | 'more'>): string | null {
  const parts: string[] = [];
  if (snap.orgCount > 1) {
    const named = snap.orgName === '' ? '' : ` (${snap.orgName})`;
    parts.push(`組織が ${snap.orgCount} 個あります。表示しているのは 1 つ目${named}の問題だけです。`);
  }
  if (snap.more) parts.push(`未解決の問題はほかにもあります (先頭 ${SENTRY_ISSUE_LIMIT} 件までを表示しています)。`);
  return parts.length === 0 ? null : parts.join(' ');
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 * Sentry の 2 つの照会は**配列を直接返す**ので、封筒が物であることは要求しない (配列でなければここが「読めなかった」と述べる)。
 */
export type SentryJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 送るヘッダ。鍵は `Authorization: Bearer` に置く。 */
export function sentryHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 組織と未解決の問題を取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchSentrySnapshotWith(jsonFetch: SentryJsonFetch, token: string): Promise<SentrySnapshot> {
  const headers = sentryHeaders(token);
  const orgs = normalizeSentryOrgs(await jsonFetch(`${SENTRY_API_BASE}${SENTRY_ORGS_PATH}`, { headers }));
  if (orgs.orgSlug === '') return buildSentrySnapshot(orgs, null);
  const issuesBody = await jsonFetch(`${SENTRY_API_BASE}${sentryIssuesPath(orgs.orgSlug)}`, { headers });
  return buildSentrySnapshot(orgs, normalizeSentryIssues(issuesBody));
}
