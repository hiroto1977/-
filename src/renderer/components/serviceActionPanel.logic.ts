import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

/**
 * ServiceActionPanel の純ロジック層。
 *
 * UI から切り離した pure function + reducer に集約することで、
 * (1) DOM 無しで単体テスト可能 / (2) Stryker mutation のスコープに乗せられる
 * / (3) コンポーネントを宣言的な薄いビューに保てる。
 *
 * SESSION_HANDOFF.md follow-up:
 * - R2-2: amount 入力の locale 対応 (全角数字・カンマ区切り・全角記号)
 * - R2-3: useState 7 個 → 単一 reducer の state machine
 * - NIT:  note の制御文字 / XSS 安全性チェック
 */

// ---------------------------------------------------------------------------
// 金額パース (R2-2: 全角・カンマ対応)
// ---------------------------------------------------------------------------

/** 全角数字 '０'(U+FF10) と半角 '0'(U+0030) のコードポイント差。 */
const FULLWIDTH_DIGIT_OFFSET = 0xff10 - 0x30;

export type AmountResult =
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false; readonly error: string };

/**
 * 全角数字・全角記号・桁区切りを正規化して半角の数値文字列にする。
 *
 * - 全角数字 ０-９ → 0-9
 * - 全角ピリオド ． / 全角カンマ ， → . / ,
 * - 全角ハイフン － / マイナス記号 − → -
 * - 半角/全角スペースを除去
 * - 桁区切りのカンマを除去
 *
 * 数値判定そのものは行わない (純粋に文字変換のみ)。
 */
export function normalizeNumericInput(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET),
    )
    .replace(/．/g, '.')
    .replace(/[－−]/g, '-')
    .replace(/，/g, ',')
    .replace(/\s/g, '') // \s は全角スペース U+3000 も含む
    .replace(/,/g, '');
}

/**
 * 金額入力をパースする。空入力は「金額なし」(`value: undefined`) として成功扱い。
 * 全角・カンマ区切りを許容したうえで有限数のみ受理する。
 */
export function parseAmount(raw: string): AmountResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: undefined };
  }
  const normalized = normalizeNumericInput(trimmed);
  // 正規化後に空 / 記号のみ → Number('') が 0 になる罠を防ぐ
  if (normalized.length === 0 || !/[0-9]/.test(normalized)) {
    return { ok: false, error: '金額は数値で入力してください' };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return { ok: false, error: '金額は数値で入力してください' };
  }
  return { ok: true, value: n };
}

// ---------------------------------------------------------------------------
// note 検証 (NIT: 制御文字 / XSS 安全性)
// ---------------------------------------------------------------------------

/** メモの最大文字数 (input の maxLength と一致させる)。 */
export const NOTE_MAX_LENGTH = 2000;

/**
 * 制御文字 + 行/段落区切り。
 * C0 (U+0000-001F) / DEL+C1 (U+007F-009F) に加え、JSON/JS 文字列を破壊し得る
 * LINE/PARAGRAPH SEPARATOR (U+2028/U+2029) を拒否する。Phase 6 で note を
 * IndexedDB / audit JSONL に永続化する際の混入を構造的に防ぐ。
 */
// eslint-disable-next-line no-control-regex -- 制御文字の検出が目的
const FORBIDDEN_NOTE_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

export type NoteResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

/**
 * メモを検証する。表示は React が自動エスケープするため DOM XSS は発生しないが、
 * 永続化・エクスポート経路に備え制御文字を拒否し、前後空白を除去する。
 */
export function validateNote(raw: string): NoteResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'メモを入力してください' };
  }
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `メモは ${NOTE_MAX_LENGTH} 文字以内で入力してください` };
  }
  if (FORBIDDEN_NOTE_CHARS.test(trimmed)) {
    return { ok: false, error: 'メモに制御文字は使用できません' };
  }
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// state machine (R2-3: useState 7 個 → 単一 reducer)
// ---------------------------------------------------------------------------

/**
 * 非同期操作の状態。idle / 実行中 / 結果 / エラー を排他的に表現し、
 * 「busy だが error も feedback も残っている」といった矛盾状態を型で排除する。
 */
export type ActionStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recording' }
  | { readonly kind: 'advising' }
  | { readonly kind: 'recorded'; readonly message: string }
  | { readonly kind: 'advised'; readonly advice: ServiceAdvisorResponse }
  | { readonly kind: 'error'; readonly message: string };

export interface ActionPanelState {
  readonly note: string;
  readonly amount: string;
  readonly status: ActionStatus;
}

export type ActionPanelEvent =
  | { readonly type: 'setNote'; readonly value: string }
  | { readonly type: 'setAmount'; readonly value: string }
  | { readonly type: 'recordStart' }
  | { readonly type: 'recordSuccess'; readonly message: string }
  | { readonly type: 'adviseStart' }
  | { readonly type: 'adviseSuccess'; readonly advice: ServiceAdvisorResponse }
  | { readonly type: 'fail'; readonly message: string };

export const initialActionPanelState: ActionPanelState = {
  note: '',
  amount: '',
  status: { kind: 'idle' },
};

export function actionPanelReducer(
  state: ActionPanelState,
  event: ActionPanelEvent,
): ActionPanelState {
  switch (event.type) {
    case 'setNote':
      return { ...state, note: event.value };
    case 'setAmount':
      return { ...state, amount: event.value };
    case 'recordStart':
      return { ...state, status: { kind: 'recording' } };
    case 'recordSuccess':
      // 記録成功時は入力欄をクリアして次の入力に備える
      return { note: '', amount: '', status: { kind: 'recorded', message: event.message } };
    case 'adviseStart':
      return { ...state, status: { kind: 'advising' } };
    case 'adviseSuccess':
      return { ...state, status: { kind: 'advised', advice: event.advice } };
    case 'fail':
      return { ...state, status: { kind: 'error', message: event.message } };
    default:
      return state;
  }
}

/** record ボタンを押せるか (実行中でなく note が非空)。 */
export function canSubmitRecord(state: ActionPanelState): boolean {
  return state.status.kind !== 'recording' && state.note.trim().length > 0;
}

/** advise ボタンを押せるか (実行中でない)。 */
export function canSubmitAdvise(state: ActionPanelState): boolean {
  return state.status.kind !== 'advising';
}
