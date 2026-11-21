/**
 * クラウド同期ランタイムの **純粋オーケストレーション核** (round 85).
 *
 * round 83 の `cloudBackup.ts` (マニフェスト生成 / 差分 / チャンク計画 / 整合検証)
 * を **実際に動かす** ための、I/O を一切持たない計算層。実際の暗号バイト処理は
 * `security/vault.ts` に、実送信は薄いアダプタ (`cloud/cloudProviderAdapter.ts`)
 * に委譲し、本モジュールは「何を・どの順で・どう進めるか」という **同期計画と
 * 状態遷移** を決定論的な純粋関数だけで担う。
 *
 * ── 担当 ──────────────────────────────────────────────────────────────
 *  1. planSync()        — local/remote マニフェスト差分から、暗号化+アップロード
 *                         のキュー・スキップ・**削除候補 (自動削除しない)** を生成。
 *  2. reduceSyncState() — idle→scanning→encrypting→uploading→verifying→done/error
 *                         の状態機械。各アップロード結果で進捗・失敗リトライ可否を算出。
 *  3. shouldSync()      — 自動同期トリガ判定 (変更あり or 間隔経過)。
 *
 * ── 安全側 (非破壊) の不変条件 ────────────────────────────────────────
 *  - リモートのみに存在 (removedLocally) は **削除候補として返すだけ**。本核は
 *    削除を計画に含めない (deletions は常に「候補」であって実行命令ではない)。
 *  - 失敗イベントはキューから消さず retriable を立て、再試行に委ねる (データ喪失なし)。
 *  - 空集合・分母0・非有限・未知イベントは入口でガードし no-op か安全停止に倒す。
 *
 * すべて決定論的 (同入力→同出力)。`Date.now()` 等の環境依存は呼出側が渡す。
 */

import {
  diffManifests,
  encryptionEnvelope,
  planChunks,
  type BackupManifest,
  type EncryptionEnvelope,
  type ChunkPlan,
} from './cloudBackup';

// ---------------------------------------------------------------------------
// 同期計画 (planSync)
// ---------------------------------------------------------------------------

/** 1 ファイルの暗号化 + アップロード計画。 */
export interface UploadPlanItem {
  /** ツリー内のファイルパス。 */
  readonly path: string;
  /** 差分種別 ('added' = 新規 / 'changed' = 内容変更)。 */
  readonly reason: 'added' | 'changed';
  /** 平文バイト長。 */
  readonly size: number;
  /** このファイルのチャンク分割計画 (大ファイルの分割アップロード用)。 */
  readonly chunks: readonly ChunkPlan[];
  /** 暗号メタ (IV / 暗号後サイズ)。実暗号は vault に委譲。 */
  readonly envelope: EncryptionEnvelope;
}

/** 削除候補 1 件 (リモートのみに存在。**自動削除しない**)。 */
export interface DeletionCandidate {
  readonly path: string;
  /** 常に true。安全側ポリシーの明示。 */
  readonly deletionCandidate: true;
}

/** planSync の入力オプション。 */
export interface SyncPlanOptions {
  /** チャンク分割サイズ (バイト)。正の有限値が必須 (planChunks が検証)。 */
  readonly chunkSize: number;
  /** path → 平文バイト長。アップロード計画のサイズ / チャンク算出に使う。 */
  readonly sizes: ReadonlyMap<string, number>;
  /** path → 暗号メタ (IV / 暗号後サイズ)。呼出側 (vault/WebCrypto) が用意。 */
  readonly envelopes: ReadonlyMap<string, EncryptionEnvelope>;
}

/** planSync の結果。アップロード対象・スキップ・削除候補を分離。 */
export interface SyncPlan {
  /** added + changed のアップロード計画 (path 昇順)。 */
  readonly uploads: readonly UploadPlanItem[];
  /** 送信不要 (unchanged) の path (昇順)。 */
  readonly skipped: readonly string[];
  /** リモートのみに存在 → **削除候補** (自動削除しない、path 昇順)。 */
  readonly deletions: readonly DeletionCandidate[];
  /** アップロード対象の合計平文バイト数 (進捗の分母などに使う)。 */
  readonly totalBytes: number;
  /** アップロードすべきファイル数 (= uploads.length のキャッシュ)。 */
  readonly fileCount: number;
}

/**
 * local / remote マニフェスト差分から同期計画を生成する。
 *
 * - added / changed → 暗号化+アップロードのキューへ (チャンク計画 + envelope 付き)。
 * - unchanged       → skipped (送信不要)。
 * - removedLocally  → deletions (**削除候補のみ。自動削除は計画しない**)。
 *
 * ガード:
 *  - chunkSize は planChunks 内で正の有限値が検証される (不正は throw)。
 *  - size が sizes に無い path は 0 として扱う (planChunks は size=0 で空チャンク)。
 *  - envelope が envelopes に無い path は **整合性を担保できないため throw**
 *    (envelope 無しの暗号文を送ると復号不能になる — 安全側で早期失敗)。
 *
 * @param local  ローカル (送りたい) マニフェスト。
 * @param remote クラウド上の現行マニフェスト。
 * @param opts   チャンクサイズ / サイズ表 / envelope 表。
 */
export function planSync(
  local: BackupManifest,
  remote: BackupManifest,
  opts: SyncPlanOptions,
): SyncPlan {
  const diff = diffManifests(local, remote);

  const uploads: UploadPlanItem[] = [];
  let totalBytes = 0;

  // added と changed をまとめて 1 つのキューに。reason で区別する。
  const toPlan: { path: string; reason: 'added' | 'changed' }[] = [
    ...diff.added.map((d) => ({ path: d.path, reason: 'added' as const })),
    ...diff.changed.map((d) => ({ path: d.path, reason: 'changed' as const })),
  ];

  for (const item of toPlan) {
    const size = opts.sizes.get(item.path) ?? 0;
    const envelope = opts.envelopes.get(item.path);
    if (envelope === undefined) {
      throw new Error(`envelope が未指定です: ${item.path} (暗号文の復号に必須)`);
    }
    const chunks = planChunks(size, opts.chunkSize);
    uploads.push({ path: item.path, reason: item.reason, size, chunks, envelope });
    totalBytes += size;
  }

  // path 昇順で安定化 (added/changed を連結したため、連結順に依存しない
  // 決定論的出力にするには明示ソートが必須)。
  uploads.sort(comparePathAsc);

  // skipped / deletions は diffManifests が既に path 昇順で返す単一バケット
  // (unchanged / removedLocally) をそのまま写すだけなので、ここでの再ソートは
  // 不要 (冗長ソートを置くと等価変異になる)。順序保証は diffManifests に委ねる。
  const skipped = diff.unchanged.map((d) => d.path);

  const deletions: DeletionCandidate[] = diff.removedLocally.map((d) => ({
    path: d.path,
    deletionCandidate: true as const,
  }));

  return {
    uploads,
    skipped,
    deletions,
    totalBytes,
    fileCount: uploads.length,
  };
}

/** path 昇順比較 (オブジェクト)。一意な path 前提で全順序を成す。 */
function comparePathAsc(a: { path: string }, b: { path: string }): number {
  // path は (diffManifests が一意 path を返すため) 一意。`<`→`<=` の
  // EqualityOperator は等価 (「等しい」は来ない) なので局所 disable。
  // 第 1 三項の条件畳みは順序を壊し撃墜可能なため disable しない。
  // Stryker disable next-line EqualityOperator
  if (a.path < b.path) return -1;
  // 第 2 三項はまるごと等価 (どの順序でも同じ全順序)。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  return a.path > b.path ? 1 : 0;
}

/**
 * 1 ファイルの envelope を planSync 用に組み立てる純ヘルパ。
 * vault/WebCrypto から得た IV と暗号後サイズを cloudBackup.encryptionEnvelope へ。
 * 入力検証 (空 IV / 負サイズ) は encryptionEnvelope が担う。
 */
export function buildUploadEnvelope(iv: string, encryptedSize: number): EncryptionEnvelope {
  return encryptionEnvelope(iv, encryptedSize);
}

// ---------------------------------------------------------------------------
// 状態機械 (reduceSyncState)
// ---------------------------------------------------------------------------

/** 同期フェーズ。 */
export type SyncPhase =
  | 'idle'
  | 'scanning'
  | 'encrypting'
  | 'uploading'
  | 'verifying'
  | 'done'
  | 'error';

/** 同期の進行状態 (純粋: イベント適用で次状態を返す)。 */
export interface SyncState {
  readonly phase: SyncPhase;
  /** アップロード対象の総ファイル数。 */
  readonly total: number;
  /** 完了 (成功) したファイル数。 */
  readonly completed: number;
  /** 失敗したファイル数 (リトライ候補)。 */
  readonly failed: number;
  /** 0..1 の進捗率 (total===0 のとき 0)。 */
  readonly progress: number;
  /** 整合検証の結果 (verifying 通過後のみ true/false、未到達は null)。 */
  readonly integrityOk: boolean | null;
  /** 失敗があり、再試行可能か。 */
  readonly retriable: boolean;
  /** 直近のエラー理由 (なければ空文字)。 */
  readonly error: string;
}

/** 状態機械を駆動するイベント。 */
export type SyncEvent =
  | { readonly type: 'start'; readonly total: number }
  | { readonly type: 'scan-complete' }
  | { readonly type: 'encrypt-complete' }
  | { readonly type: 'file-uploaded' }
  | { readonly type: 'file-failed'; readonly reason: string }
  | { readonly type: 'verify-complete'; readonly ok: boolean }
  | { readonly type: 'abort'; readonly reason: string }
  | { readonly type: 'reset' };

/** 初期状態 (idle)。 */
export const INITIAL_SYNC_STATE: SyncState = {
  phase: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  progress: 0,
  integrityOk: null,
  retriable: false,
  error: '',
};

/**
 * 進捗率を算出する。total が 0 / 負 / 非有限なら 0 (ゼロ除算 / NaN 防止)。
 * 0..1 にクランプする。
 */
export function computeProgress(completed: number, failed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const handled = completed + failed;
  const ratio = handled / total;
  // 下限/上限クランプ。境界 (ratio===0 / ratio===1) では早期 return 値が
  // ratio 自身と一致するため `<`→`<=` / `>`→`>=` の EqualityOperator は
  // 観測上等価 (返り値が変わらない)。負/超過の本来の振る舞いは下の専用テスト
  // (handled 負で 0 / handled 超過で 1) で撃墜済みなので境界等価のみ disable。
  // Stryker disable next-line EqualityOperator
  if (ratio < 0) return 0;
  // Stryker disable next-line EqualityOperator
  if (ratio > 1) return 1;
  return ratio;
}

/**
 * 同期状態機械の遷移関数 (純粋・全域)。
 *
 * 遷移規則:
 *  - start            : → scanning (total を確定し進捗をリセット)。
 *  - scan-complete    : scanning → encrypting。
 *  - encrypt-complete : encrypting → uploading。
 *  - file-uploaded    : uploading で completed++。全件処理済なら → verifying。
 *  - file-failed      : uploading で failed++ + retriable。全件処理済なら → verifying。
 *  - verify-complete  : verifying → done(ok) / error(!ok)。integrityOk を確定。
 *  - abort            : 任意フェーズ → error (reason 保持)。
 *  - reset            : 任意フェーズ → INITIAL_SYNC_STATE。
 *
 * 不正な (現フェーズに合わない) イベントは **状態を変えず現状を返す** (安全側 no-op)。
 */
export function reduceSyncState(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'reset':
      return INITIAL_SYNC_STATE;

    case 'abort':
      return {
        ...state,
        phase: 'error',
        retriable: state.failed > 0,
        error: event.reason,
      };

    case 'start': {
      // total は 0 以上の有限値のみ受理。不正は no-op (現状維持)。
      if (!Number.isFinite(event.total) || event.total < 0) return state;
      return {
        phase: 'scanning',
        total: event.total,
        completed: 0,
        failed: 0,
        progress: 0,
        integrityOk: null,
        retriable: false,
        error: '',
      };
    }

    case 'scan-complete':
      if (state.phase !== 'scanning') return state;
      return { ...state, phase: 'encrypting' };

    case 'encrypt-complete':
      if (state.phase !== 'encrypting') return state;
      return { ...state, phase: 'uploading' };

    case 'file-uploaded': {
      if (state.phase !== 'uploading') return state;
      const completed = state.completed + 1;
      return advanceUpload({ ...state, completed });
    }

    case 'file-failed': {
      if (state.phase !== 'uploading') return state;
      const failed = state.failed + 1;
      return advanceUpload({ ...state, failed, retriable: true, error: event.reason });
    }

    case 'verify-complete':
      if (state.phase !== 'verifying') return state;
      return {
        ...state,
        phase: event.ok ? 'done' : 'error',
        integrityOk: event.ok,
        progress: computeProgress(state.completed, state.failed, state.total),
        // 整合 NG はリトライ可能 (再アップロードで修復しうる)。OK は失敗有無のみ。
        retriable: event.ok ? state.failed > 0 : true,
        error: event.ok ? state.error : '整合性検証に失敗しました',
      };

    // 既知の全イベントを上で処理済み。default は到達不能だが、any 経由の
    // 不正イベントに備えて安全側 no-op で受ける (型上は never)。
    // Stryker disable next-line all
    default:
      return state;
  }
}

/**
 * uploading 中に 1 件処理し終えた後の共通遷移:
 * 進捗を更新し、completed+failed が total に達したら verifying へ進める。
 */
function advanceUpload(state: SyncState): SyncState {
  const progress = computeProgress(state.completed, state.failed, state.total);
  const handled = state.completed + state.failed;
  // 全件処理済 → 整合検証フェーズへ。まだなら uploading のまま進捗だけ更新。
  const phase: SyncPhase = handled >= state.total ? 'verifying' : 'uploading';
  return { ...state, progress, phase };
}

// ---------------------------------------------------------------------------
// スケジューラ (shouldSync)
// ---------------------------------------------------------------------------

/**
 * 自動同期を起動すべきか判定する。
 *
 * トリガ条件 (いずれか):
 *  - 一度も同期していない (lastSync が null) かつ変更あり (dirty)。
 *  - 前回同期から intervalMs 以上経過している (定期同期)。
 *
 * 安全側ガード:
 *  - dirty=false かつ間隔未経過なら false (無駄な同期をしない)。
 *  - now / lastSync / intervalMs が非有限なら false (誤起動防止)。
 *  - intervalMs <= 0 は「間隔による起動を無効」とみなす (dirty 起動のみ)。
 *
 * @param now        現在時刻 (epoch ms)。呼出側が Date.now() を渡す。
 * @param lastSync   前回同期時刻 (epoch ms)。未同期は null。
 * @param intervalMs 定期同期の間隔 (ms)。
 * @param dirty      未同期の変更があるか。
 */
export function shouldSync(
  now: number,
  lastSync: number | null,
  intervalMs: number,
  dirty: boolean,
): boolean {
  if (!Number.isFinite(now)) return false;
  if (!Number.isFinite(intervalMs)) return false;

  // 未同期: 変更がある時だけ初回同期する。
  if (lastSync === null) {
    return dirty;
  }

  if (!Number.isFinite(lastSync)) return false;

  // 間隔による定期同期は intervalMs > 0 のときのみ有効。
  const elapsed = now - lastSync;
  const intervalElapsed = intervalMs > 0 && elapsed >= intervalMs;

  // 変更あり、または間隔経過なら同期。
  return dirty || intervalElapsed;
}
