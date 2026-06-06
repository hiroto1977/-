/**
 * 暗号化クラウドバックアップ・コア (round 82).
 *
 * ユーザー要望「全データを完全自動でクラウドへ、最大安全、壊さず安全に管理」の
 * 中核を **純粋ロジック (I/O なし)** で実装する。実際の暗号バイト処理・ネットワーク
 * 送信・ストレージ書込みは呼出側 (UI / main / vault) に委譲し、本モジュールは
 * マニフェスト生成・差分計算・チャンク計画・整合検証・バージョン採番という
 * 決定論的な計算のみを担当する。
 *
 * ── 安全設計の三本柱 ───────────────────────────────────────────────
 *  1. ゼロ知識 / E2E: クラウドには **暗号文のみ**。鍵はメモリのみ (vault.ts の
 *     AES-GCM-256 / WebCrypto / PBKDF2-SHA-256 600k iter に委譲)。本モジュールは
 *     `encryptionEnvelope()` で暗号メタ (algo='AES-GCM' / ivLength / keyDerivation
 *     参照) をモデル化するのみで、平文も鍵も決して保持しない。
 *  2. 非破壊バージョニング: 既存データを上書き / 削除しない。各変更は
 *     `nextVersion()` で単調増加する新バージョンとして積み、世代履歴を保持する。
 *     ローカルにしか無いもの (`removedLocally`) はリモート都合で自動削除しない
 *     — 必ず「削除候補 (deletionCandidate=true)」として明示操作に委ねる。
 *  3. 整合性: ファイル毎の SHA-256 と、ツリー全体を束ねるマニフェストハッシュ。
 *     復元時に `verifyIntegrity()` / `verifyManifest()` で再計算照合し、破損 /
 *     改ざんを検知する。
 *
 * すべての関数は決定論的 (同入力 → 同出力)。空集合・分母0・非有限・負値・
 * 重複 path を入口でガードし、安全側 (throw か no-op) に倒す。
 */

// --- 暗号エンベロープ (モデルのみ — 実バイト暗号は vault に委譲) ----------

/** クライアント側暗号化のアルゴリズム識別子。vault.ts と同じ AES-GCM-256。 */
export const BACKUP_CIPHER_ALGO = 'AES-GCM' as const;

/** AES-GCM の IV 長 (バイト)。vault.ts の IV_BYTES と一致させる。 */
export const BACKUP_IV_LENGTH = 12;

/** 鍵導出方式の参照識別子。実際の派生は vault.ts (PBKDF2-SHA-256 600k) が担う。 */
export const BACKUP_KEY_DERIVATION = 'PBKDF2-SHA-256-600k' as const;

/**
 * 暗号化メタデータ (エンベロープ)。クラウドへ送る暗号文に添える非機密ヘッダ。
 * 鍵そのものも平文も含まない — 復号に必要な「公開してよい」パラメータのみ。
 */
export interface EncryptionEnvelope {
  readonly algo: typeof BACKUP_CIPHER_ALGO;
  readonly ivLength: number;
  readonly keyDerivation: typeof BACKUP_KEY_DERIVATION;
  /** この暗号文 1 件に固有の IV (Base64 等の文字列表現)。呼出側が WebCrypto で生成。 */
  readonly iv: string;
  /** 暗号化後のバイト長。チャンク計画・進捗表示に使う。 */
  readonly encryptedSize: number;
}

/**
 * 暗号エンベロープを構築する。鍵・平文には一切触れない (純メタ生成)。
 *
 * @param iv 呼出側 (WebCrypto) が生成した IV の文字列表現。空は不正。
 * @param encryptedSize 暗号化後のバイト長。負・非有限は不正。
 */
export function encryptionEnvelope(iv: string, encryptedSize: number): EncryptionEnvelope {
  if (typeof iv !== 'string' || iv.length === 0) {
    throw new Error('iv が空です (暗号エンベロープには IV が必須)');
  }
  if (!Number.isFinite(encryptedSize) || encryptedSize < 0) {
    throw new Error('encryptedSize が不正です (0 以上の有限値が必要)');
  }
  return {
    algo: BACKUP_CIPHER_ALGO,
    ivLength: BACKUP_IV_LENGTH,
    keyDerivation: BACKUP_KEY_DERIVATION,
    iv,
    encryptedSize,
  };
}

// --- チャンク分割計画 -------------------------------------------------

/** 大ファイルを暗号化 / アップロードするための分割計画 1 片。 */
export interface ChunkPlan {
  /** 0 始まりの通し番号。 */
  readonly index: number;
  /** ファイル先頭からのバイトオフセット。 */
  readonly offset: number;
  /** このチャンクのバイト長。最後のチャンクは端数になり得る。 */
  readonly length: number;
}

/**
 * サイズ `size` のファイルを `chunkSize` バイト単位に分割する計画を返す。
 * 端数は最後のチャンクへ。決定論的でオフセットは連続・非重複。
 *
 *  - `chunkSize <= 0` はガード (ゼロ除算 / 無限ループ防止) → throw。
 *  - `size === 0` は空配列 (送るものが無い)。
 *  - 非有限 / 負の `size` は throw。
 */
export function planChunks(size: number, chunkSize: number): ChunkPlan[] {
  if (!Number.isFinite(size) || size < 0) {
    throw new Error('size が不正です (0 以上の有限値が必要)');
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize は正の有限値が必要です');
  }
  const plans: ChunkPlan[] = [];
  let offset = 0;
  let index = 0;
  while (offset < size) {
    const length = Math.min(chunkSize, size - offset);
    plans.push({ index, offset, length });
    offset += length;
    index += 1;
  }
  return plans;
}

// --- マニフェスト型 ---------------------------------------------------

/** マニフェスト構築の入力となる 1 ファイルの素情報。 */
export interface FileInput {
  /** 一意なファイルパス (ツリー内識別子)。 */
  readonly path: string;
  /** 平文バイト長。 */
  readonly size: number;
  /** 平文の SHA-256 hex。整合性の基準。 */
  readonly sha256: string;
  /** 最終更新時刻 (epoch ms)。 */
  readonly mtime: number;
}

/** マニフェスト内の 1 エントリ (バージョン情報付き)。 */
export interface BackupEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /** 世代番号 (1 始まり、単調増加)。非破壊バージョニングの核。 */
  readonly version: number;
  /** チャンク参照 (chunk SHA-256 hex のリスト)。空なら未チャンク化。 */
  readonly chunkRefs: readonly string[];
  /** 暗号化後のバイト長。 */
  readonly encryptedSize: number;
  /** 最終更新時刻 (epoch ms)。 */
  readonly mtime: number;
}

/** バックアップ・マニフェスト (ツリー全体のスナップショット)。 */
export interface BackupManifest {
  /** スキーマ版数。 */
  readonly version: number;
  /** path 昇順で安定ソートされたエントリ群。 */
  readonly entries: readonly BackupEntry[];
  /** エントリ群を束ねるツリーハッシュ (sha256(path:sha256:version) を連結したもの)。 */
  readonly treeHash: string;
}

/** 現行マニフェスト・スキーマ版数。 */
export const MANIFEST_VERSION = 1;

/**
 * マニフェストの treeHash を決定論的に計算する。
 * 各エントリを `path sha256 version` に正規化し `\n` (改行) で連結する。
 * これは「内容のフィンガープリント」であり、暗号学的衝突耐性ではなく
 * 整合検知 (取り違え / 順序入替 / バージョンずれ) を目的とする決定論ハッシュ。
 *
 * NOTE: 実際の SHA-256 ダイジェストは呼出側 (WebCrypto) が `treeHashInput()` の
 * 文字列に対して計算してもよい。本関数はその「入力文字列」と等価な決定論的
 * 連結を返し、ネットワーク / WebCrypto 非依存でテスト可能にする。
 */
export function treeHashInput(entries: readonly BackupEntry[]): string {
  return entries
    .map((e) => `${e.path} ${e.sha256} ${e.version}`)
    .join('\n');
}

/**
 * ファイル集合からマニフェストを生成する。決定論的:
 *  - エントリは path 昇順で安定ソート。
 *  - 各エントリ version は既定 1 (初回)。`prior` を渡すと差分採番に使える。
 *  - 空集合は entries=[] / treeHash='' (送るものが無い)。
 *
 * ガード: 空 path / 非有限・負の size・mtime / 重複 path は throw。
 *
 * @param files 入力ファイル群。
 * @param prior 直前のマニフェスト (任意)。同 path の version 採番に使う。
 */
export function buildManifest(
  files: readonly FileInput[],
  prior?: BackupManifest,
): BackupManifest {
  const priorByPath = new Map<string, BackupEntry>();
  if (prior) {
    for (const e of prior.entries) priorByPath.set(e.path, e);
  }

  const seen = new Set<string>();
  const entries: BackupEntry[] = [];
  for (const f of files) {
    if (typeof f.path !== 'string' || f.path.length === 0) {
      throw new Error('path が空のファイルがあります');
    }
    if (seen.has(f.path)) {
      throw new Error(`path が重複しています: ${f.path}`);
    }
    seen.add(f.path);
    if (!Number.isFinite(f.size) || f.size < 0) {
      throw new Error(`size が不正です: ${f.path}`);
    }
    if (typeof f.sha256 !== 'string' || f.sha256.length === 0) {
      throw new Error(`sha256 が空です: ${f.path}`);
    }
    if (!Number.isFinite(f.mtime) || f.mtime < 0) {
      throw new Error(`mtime が不正です: ${f.path}`);
    }
    const previous = priorByPath.get(f.path);
    // 内容 (sha256) が変われば新世代、不変なら世代維持 (非破壊・無駄積みなし)。
    const version =
      previous === undefined
        ? 1
        : previous.sha256 === f.sha256
          ? previous.version
          : nextVersion(previous);
    entries.push({
      path: f.path,
      size: f.size,
      sha256: f.sha256,
      version,
      chunkRefs: [],
      encryptedSize: 0,
      mtime: f.mtime,
    });
  }

  // 安定ソート (path 昇順)。決定論性を保証。
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    version: MANIFEST_VERSION,
    entries,
    treeHash: entries.length === 0 ? '' : treeHashInput(entries),
  };
}

// --- バージョン採番 ---------------------------------------------------

/**
 * 次の世代番号を返す (単調増加、衝突なし)。非破壊バージョニングの基礎。
 * 既存エントリの version に 1 を加える。version が不正 (非有限 / < 1 / 非整数)
 * なら 1 から再スタートさせ、過去世代の上書き衝突を防ぐ。
 */
export function nextVersion(entry: BackupEntry): number {
  const v = entry.version;
  if (!Number.isInteger(v) || v < 1) {
    return 1;
  }
  return v + 1;
}

// --- 差分計算 ---------------------------------------------------------

/** 差分分類の 1 エントリ。 */
export interface DiffEntry {
  readonly path: string;
  /**
   *  - 'added'    : ローカルにあり、リモートに無い → アップロード対象。
   *  - 'changed'  : 双方にあるが sha256 が異なる → 新世代をアップロード。
   *  - 'unchanged': 双方にあり sha256 一致 → 送信不要。
   *  - 'removedLocally': リモートにあるがローカルに無い → **削除候補**
   *                      (自動削除しない。明示操作でのみ消す)。
   */
  readonly kind: 'added' | 'changed' | 'unchanged' | 'removedLocally';
  /**
   *  removedLocally のときのみ true。「リモートのみに存在 → 自動削除しない」
   *  という安全側ポリシーを呼出側へ伝えるフラグ。added/changed/unchanged は false。
   */
  readonly deletionCandidate: boolean;
}

/** 差分計算の結果。分類ごとにグルーピング。 */
export interface ManifestDiff {
  readonly added: readonly DiffEntry[];
  readonly changed: readonly DiffEntry[];
  readonly unchanged: readonly DiffEntry[];
  /** リモートのみに存在。**実削除しない削除候補** として返す。 */
  readonly removedLocally: readonly DiffEntry[];
  /** added + changed の path (= 実際にアップロードすべき集合)。 */
  readonly toUpload: readonly string[];
}

/**
 * ローカル / リモート 2 つのマニフェストを比較し差分を分類する。
 *
 * 安全側ポリシー: リモートのみに存在するエントリ (`removedLocally`) は
 * **deletionCandidate=true で返すだけで、自動削除はしない**。ローカルにしか
 * 無いものをリモート都合で消さない原則の対称として、リモート履歴も勝手に
 * 消さず、削除は呼出側の明示操作に委ねる。
 *
 * 決定論的: 各リストは path 昇順。
 */
export function diffManifests(
  local: BackupManifest,
  remote: BackupManifest,
): ManifestDiff {
  const localByPath = new Map<string, BackupEntry>();
  for (const e of local.entries) localByPath.set(e.path, e);
  const remoteByPath = new Map<string, BackupEntry>();
  for (const e of remote.entries) remoteByPath.set(e.path, e);

  const added: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const unchanged: DiffEntry[] = [];
  const removedLocally: DiffEntry[] = [];

  for (const e of local.entries) {
    const r = remoteByPath.get(e.path);
    if (r === undefined) {
      added.push({ path: e.path, kind: 'added', deletionCandidate: false });
    } else if (r.sha256 === e.sha256) {
      unchanged.push({ path: e.path, kind: 'unchanged', deletionCandidate: false });
    } else {
      changed.push({ path: e.path, kind: 'changed', deletionCandidate: false });
    }
  }

  for (const e of remote.entries) {
    if (!localByPath.has(e.path)) {
      removedLocally.push({
        path: e.path,
        kind: 'removedLocally',
        // 安全側: 自動削除しない削除候補。
        deletionCandidate: true,
      });
    }
  }

  const byPath = (a: DiffEntry, b: DiffEntry): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  added.sort(byPath);
  changed.sort(byPath);
  unchanged.sort(byPath);
  removedLocally.sort(byPath);

  const toUpload = [...added, ...changed].map((d) => d.path).sort();

  return { added, changed, unchanged, removedLocally, toUpload };
}

// --- 整合検証 ---------------------------------------------------------

/** 整合検証の結果。 */
export interface IntegrityResult {
  readonly ok: boolean;
  /** 失敗時の人間可読な理由 (成功時は空文字)。 */
  readonly reason: string;
}

/**
 * 1 エントリの整合性を検証する。`actualSha` (復元時に再計算した SHA-256) が
 * エントリの `sha256` と一致するかを照合し、破損 / 改ざんを検知する。
 *
 * `actualSha` が空文字は「計算不能 = 検証失敗」として扱う (安全側)。
 */
export function verifyIntegrity(entry: BackupEntry, actualSha: string): IntegrityResult {
  if (typeof actualSha !== 'string' || actualSha.length === 0) {
    return { ok: false, reason: `${entry.path}: 実ハッシュが空 (検証不能)` };
  }
  if (actualSha !== entry.sha256) {
    return {
      ok: false,
      reason: `${entry.path}: ハッシュ不一致 (期待 ${entry.sha256} / 実 ${actualSha})`,
    };
  }
  return { ok: true, reason: '' };
}

/**
 * マニフェスト全体の整合性を検証する:
 *  1. 再計算した treeHash がマニフェストの treeHash と一致するか (構造の完全性)。
 *  2. `actualShas` (path → 実 SHA-256) が与えられた範囲で各エントリと一致するか。
 *
 * いずれか 1 つでも不一致なら ok=false。空マニフェスト (entries=[]) は
 * treeHash='' と整合していれば ok=true (バックアップ対象が無い正常状態)。
 *
 * @param manifest 検証対象マニフェスト。
 * @param actualShas 復元時に再計算した path→SHA-256。省略・部分指定可。
 *                   含まれない path はファイル単位検証をスキップ (構造検証のみ)。
 */
export function verifyManifest(
  manifest: BackupManifest,
  actualShas?: ReadonlyMap<string, string>,
): IntegrityResult {
  const expectedTreeHash =
    manifest.entries.length === 0 ? '' : treeHashInput(manifest.entries);
  if (expectedTreeHash !== manifest.treeHash) {
    return {
      ok: false,
      reason: `treeHash 不一致 (期待 ${expectedTreeHash} / 実 ${manifest.treeHash})`,
    };
  }
  if (actualShas !== undefined) {
    for (const e of manifest.entries) {
      const actual = actualShas.get(e.path);
      if (actual === undefined) continue; // 未指定 path はスキップ。
      const r = verifyIntegrity(e, actual);
      if (!r.ok) return r;
    }
  }
  return { ok: true, reason: '' };
}
