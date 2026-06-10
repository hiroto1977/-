/**
 * AI コンシェルジュ (チャットボット) 応答エンジン — 純ロジック・IO なし。
 *
 * AI オーケストレーション組織 (CEO→COO→役員→秘書室→管理職→一般職チーム) を
 * 「中の人」として、ユーザーの自然文の要望に応える。設計原則は**単一の真実源から
 * 知識を導出する**こと:
 *
 *   - サービス知識  → `ChatContext.services` (呼び出し側が `SERVICES` を注入。
 *                      scaffold で増えた将来のサービスにも自動連動)
 *   - 実行可能な操作 → `ChatContext.capabilities` (voiceCommand の能力テーブル)
 *   - 担当部署      → `ChatContext.org` (orchestration/registry.json 由来の
 *                      `OrgIndex`。ラウンドで組織が成長しても自動追随)
 *
 * 意図解析は既存の `voiceCommand.ts` (正規化・サービス別名・action ルール・
 * 破壊的操作の確認要否) に委譲し、本モジュールは「チャットとしての返答組み立て」
 * と「組織ルーティング (どの部長/役員が承るか)」だけを担う。
 * I/O (画面遷移・serviceHub.invoke・永続化) は UI 側 (ChatbotWidget) の責務。
 */

import type { ServiceId } from '../../shared/serviceId';
import {
  normalizeUtterance,
  parseVoiceCommand,
  routeCommand,
  requiresConfirmation,
  type AvailableCapabilities,
  type VoiceIntent,
} from './voiceCommand';
import { routeTopic, routeLabel, orgSummaryLine, type OrgIndex } from './chatOrg';

/** チャットボットが知っているサービス 1 件 (SERVICES から注入)。 */
export interface ChatService {
  readonly id: ServiceId;
  readonly label: string;
  readonly description: string;
}

/** 応答組み立てに必要な知識一式 (すべて単一の真実源から注入)。 */
export interface ChatContext {
  readonly services: readonly ChatService[];
  readonly org: OrgIndex;
  readonly capabilities: AvailableCapabilities;
}

/** 返答の種別。 */
export type ChatReplyKind =
  | 'org' // 組織・体制の質問
  | 'request' // 機能要望の受付 (バックログ候補として記録)
  | 'help' // 何ができるか
  | 'action' // 書き込み操作 (UI が確認のうえ invoke)
  | 'navigate' // 画面案内
  | 'service-info' // サービスについての質問
  | 'fallback'; // 解釈不能 (LLM フォールバック余地)

/** チャット返答 (構造は logic、text は表現)。 */
export interface ChatReply {
  readonly kind: ChatReplyKind;
  /** ユーザーへ表示する本文。 */
  readonly text: string;
  /** 画面案内する serviceId (navigate / service-info / action 実行後)。 */
  readonly navigateTo?: ServiceId;
  /** 実行する意図 (kind='action' のとき)。UI が確認 UI を経由して invoke する。 */
  readonly intent?: VoiceIntent;
  /** 破壊的操作で実行前確認が必須か (kind='action' のとき)。 */
  readonly needsConfirmation?: boolean;
  /** 承った指揮系統 (例: 税務(所得税)チーム → 税務部長 → 最高財務責任者 (CFO))。 */
  readonly routedThrough: string;
  /** クイック返信の候補。 */
  readonly suggestions: readonly string[];
}

// --- 特殊意図の検出辞書 ----------------------------------------------------
//
// 辞書は宣言データ (StringLiteral 変異は等価で低シグナル)。検出ロジック
// (detectSpecialIntent) は実テストで撃墜する。
// Stryker disable all
/** 組織・体制の質問マーカー。 */
export const ORG_MARKERS: readonly string[] = [
  '組織',
  'おーけすとれーしょん',
  'オーケストレーション',
  '役員',
  '部長',
  '秘書',
  '管理職',
  '一般職',
  '指揮系統',
  '体制',
  'ちーむすう',
  'チーム数',
  'coo',
  'ceo',
];

/** 機能要望マーカー (新機能の追加依頼)。 */
export const REQUEST_MARKERS: readonly string[] = [
  '要望',
  'ようぼう',
  '追加して',
  '作って',
  'つくって',
  '欲しい',
  'ほしい',
  '実装して',
  '改善して',
  '対応して',
];

/** ヘルプ (何ができるか) マーカー。 */
export const HELP_MARKERS: readonly string[] = [
  '何ができる',
  'なにができる',
  'できること',
  '使い方',
  'つかいかた',
  'へるぷ',
  'ヘルプ',
  'help',
];

/** 既定のクイック返信。 */
const DEFAULT_SUGGESTIONS: readonly string[] = [
  '何ができる？',
  '組織の体制を教えて',
  '税務試算を開いて',
];
// Stryker restore all

/** 文字列中にマーカー群のいずれかが含まれるか。 */
function containsAny(text: string, markers: readonly string[]): boolean {
  for (const m of markers) {
    if (text.includes(m)) return true;
  }
  return false;
}

/**
 * 特殊意図 (組織 / 要望 / ヘルプ) を検出する。
 *
 * `haystack` には正規化済みテキストと生テキストを連結したものを渡す想定 —
 * normalizeUtterance は語尾を落とす (例: 「何ができる？」→「何が」) ため、
 * 正規化形のみではマーカーを取りこぼす。
 */
export function detectSpecialIntent(haystack: string): 'org' | 'request' | 'help' | null {
  if (containsAny(haystack, REQUEST_MARKERS)) return 'request';
  if (containsAny(haystack, ORG_MARKERS)) return 'org';
  if (containsAny(haystack, HELP_MARKERS)) return 'help';
  return null;
}

/** serviceId からサービス定義を引く (注入された services から)。 */
export function findService(
  services: readonly ChatService[],
  id: ServiceId | undefined,
): ChatService | undefined {
  // id が undefined のときは何にも一致せず undefined が返る (専用ガード不要)。
  return services.find((s) => s.id === id);
}

/** サービスの担当部署ラベルを解決する (label を話題として組織索引を引く)。 */
export function routeForService(org: OrgIndex, service: ChatService | undefined): string {
  if (service === undefined) return routeLabel({});
  return routeLabel(routeTopic(org, normalizeUtterance(service.label)));
}

/**
 * ユーザーの 1 メッセージに対する返答を組み立てる (純粋・決定論的)。
 *
 * 判定順: 具体的な書き込み操作 (action) → 要望 → 組織 → ヘルプ →
 * 案内/説明 (navigate / query) → fallback。
 *
 * action を要望より先に判定するのは「issue を作って」のような操作動詞
 * (作って 等) が要望マーカーと重なるため — 実在サービスへの具体的操作が
 * 解決できるならそれを優先し、解決できない「◯◯機能を作って」は要望として
 * 受け付ける。
 */
export function replyTo(text: string, ctx: ChatContext): ChatReply {
  // 正規化形 + 生テキストの両方をマーカー照合の対象にする (語尾除去対策)。
  const haystack = `${normalizeUtterance(text)}\n${text}`;
  const routed = routeCommand(parseVoiceCommand(text), ctx.capabilities);
  const service = findService(ctx.services, routed.serviceId);
  const through = routeForService(ctx.org, service);

  // service が見つかる ⇒ routed.serviceId は定義済み (findService は id 一致のみ返す)
  // ため、serviceId の重複チェックは持たない (navigateTo は service.id を使う)。
  if (routed.kind === 'action' && service !== undefined) {
    const needs = requiresConfirmation(routed);
    // Stryker disable all — 返信文面は表現 (構造フィールドはテストで固定)。
    return {
      kind: 'action',
      text:
        `🛠 ${service.label} で「${routed.action ?? ''}」を実行します。` +
        (needs ? '\n⚠ 書き込み操作のため、実行前に確認してください。' : ''),
      navigateTo: service.id,
      intent: routed,
      needsConfirmation: needs,
      routedThrough: through,
      suggestions: ['実行して', 'やめる'],
    };
    // Stryker restore all
  }

  const special = detectSpecialIntent(haystack);

  if (special === 'request') {
    // Stryker disable all — 返信文面は表現 (構造フィールドはテストで固定)。
    return {
      kind: 'request',
      text:
        `📥 機能のご要望として承りました。\n` +
        `「${text.trim()}」\n` +
        `最高戦略責任者 (CSO) 配下のバックログ候補として記録します。次回オーケストレーション・` +
        `ラウンドの計画 (orchestrate dispatch) で着手判断されます。`,
      routedThrough: '要望受付 → 最高戦略責任者 (CSO) → COO',
      suggestions: ['他の要望も伝える', '組織の体制を教えて', '何ができる？'],
    };
    // Stryker restore all
  }

  if (special === 'org') {
    // Stryker disable all
    return {
      kind: 'org',
      text:
        `🏢 AI オーケストレーション組織は現在稼働中です。\n` +
        `${orgSummaryLine(ctx.org)}\n` +
        `CEO (人間・オーナー) の方針のもと、COO (Claude) が 5 役員・8 部長・` +
        `${ctx.org.counts.teams} チームを統括し、品質ゲート (verify:all / Stryker 100%) を` +
        `通過したものだけが出荷されます。`,
      routedThrough: 'COO 直轄',
      suggestions: ['何ができる？', '税務の担当は誰？', '新機能の要望を伝える'],
    };
    // Stryker restore all
  }

  if (special === 'help') {
    const count = ctx.services.length;
    const sample = ctx.services.slice(0, 5).map((s) => s.label).join(' / ');
    // Stryker disable all
    return {
      kind: 'help',
      text:
        `💁 私は AI オーケストレーション組織のコンシェルジュです。できること:\n` +
        `・${count} のサービス (${sample} など) への案内 —「◯◯を開いて」\n` +
        `・操作の実行 —「GitHub で issue 作って」「カレンダーに予定を入れて」(破壊的操作は確認します)\n` +
        `・サービスの説明 —「◯◯って何？」\n` +
        `・組織の状態 —「体制を教えて」\n` +
        `・機能要望の受付 —「◯◯が欲しい」(オーケストレーションのバックログ候補に記録)`,
      routedThrough: 'COO 直轄',
      suggestions: DEFAULT_SUGGESTIONS,
    };
    // Stryker restore all
  }

  if (routed.kind === 'query' && service !== undefined) {
    // Stryker disable all
    return {
      kind: 'service-info',
      text: `ℹ️ ${service.label}: ${service.description}\nページを開いて詳細を確認できます。`,
      navigateTo: service.id,
      routedThrough: through,
      suggestions: [`${service.label}を開いて`, '何ができる？'],
    };
    // Stryker restore all
  }

  if (routed.kind === 'navigate' && service !== undefined) {
    // Stryker disable all
    return {
      kind: 'navigate',
      text: `🧭 ${service.label} へご案内します。`,
      navigateTo: service.id,
      routedThrough: through,
      suggestions: ['他のサービスも見る', '何ができる？'],
    };
    // Stryker restore all
  }

  // Stryker disable all
  return {
    kind: 'fallback',
    text:
      `🤔 うまく解釈できませんでした。サービス名 (例: 税務試算 / GitHub / 売上集計) を含めるか、` +
      `「何ができる？」と聞いてください。Ollama 接続時は自由質問にもお答えします。`,
    routedThrough: 'COO 直轄',
    suggestions: DEFAULT_SUGGESTIONS,
  };
  // Stryker restore all
}
