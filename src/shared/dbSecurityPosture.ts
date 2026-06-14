/**
 * ローカルDB (IndexedDB レコードストア) のセキュリティ姿勢診断 — 純ロジック・IO なし。
 *
 * 保存時暗号化・マスターパスワード・改ざん検知・自動ロック・クラウドバックアップ構成/鮮度/
 * 暗号化の各観点を**採点**し、未達の項目を改善候補 (findings) として可視化する
 * (securityRange / compliance の findings と同じ思想)。再実行のたびに姿勢を測り、
 * 設定を強化するほどスコアが上がる観測可能な仕組み。
 *
 * 実際の状態収集 (recordCipher の有効/無効、バックアップ日時 等) は呼び出し側が行い、
 * 本モジュールは受け取った {@link DbSecurityInputs} から決定論的にレポートを組み立てる。
 *
 * 注: 本診断はアプリ層の設定姿勢の評価であり、OS/物理層を含む完全な安全を保証するものでは
 * ない (docs/DATA_PROTECTION.md 参照)。
 */

/** 診断の入力 (現在のDB/バックアップ状態)。 */
export interface DbSecurityInputs {
  /** 業務レコードの保存時 AES-GCM 暗号化が有効か。 */
  readonly encryptionEnabled: boolean;
  /** マスターパスワードが設定済みか。 */
  readonly masterPasswordSet: boolean;
  /** 改ざん検知 (整合性チェックサム) が有効か。 */
  readonly integrityVerified: boolean;
  /** 自動ロック (アイドル/タブ非表示) が有効か。 */
  readonly autoLockEnabled: boolean;
  readonly cloudBackup: {
    /** 構成済みのクラウドストレージ (例: ['drive','dropbox','onedrive'])。 */
    readonly configuredSinks: readonly string[];
    /** 直近バックアップからの経過日数 (null = 未実施)。 */
    readonly lastBackupAgeDays: number | null;
    /** バックアップが暗号化されているか。 */
    readonly encryptedBackup: boolean;
  };
}

export type Severity = 'critical' | 'high' | 'medium';

/** 1 観点の診断結果。 */
export interface SecurityCheck {
  readonly id: string;
  readonly label: string;
  readonly severity: Severity;
  readonly weight: number;
  readonly ok: boolean;
  /** 未達のとき行うべき改善 (固定文)。 */
  readonly recommendation: string;
}

/** 診断レポート。 */
export interface DbSecurityReport {
  readonly checks: readonly SecurityCheck[];
  /** 0..100 (達成項目の重み合計)。 */
  readonly score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D';
  /** 未達の観点 (改善候補・重み降順)。 */
  readonly findings: readonly SecurityCheck[];
}

/** バックアップが「新しい」とみなす最大経過日数。 */
export const MAX_BACKUP_AGE_DAYS = 7;
/** グレード境界。 */
export const GRADE_A_MIN = 90;
export const GRADE_B_MIN = 70;
export const GRADE_C_MIN = 50;

// 観点のメタ情報 (表示文言・重み)。文字列・重みは表現として Stryker から除外し、
// ロジック (ok 判定・採点・グレード・findings) を実テストで撃墜する。
// Stryker disable all
interface CheckSpec {
  readonly id: string;
  readonly label: string;
  readonly severity: Severity;
  readonly weight: number;
  readonly recommendation: string;
}
const CHECK_SPECS: Readonly<Record<string, CheckSpec>> = {
  encryption: {
    id: 'encryption',
    label: '保存時暗号化 (AES-GCM)',
    severity: 'critical',
    weight: 30,
    recommendation: '設定でレコード暗号化を有効化し、マスターパスワードで封緘してください。',
  },
  'master-password': {
    id: 'master-password',
    label: 'マスターパスワード設定',
    severity: 'high',
    weight: 15,
    recommendation: '十分に長いマスターパスワードを設定してください (暗号鍵の導出元)。',
  },
  integrity: {
    id: 'integrity',
    label: '改ざん検知 (整合性チェック)',
    severity: 'high',
    weight: 15,
    recommendation: 'バックアップ/レコードの整合性チェック (SHA-256) を有効化してください。',
  },
  'auto-lock': {
    id: 'auto-lock',
    label: '自動ロック',
    severity: 'medium',
    weight: 10,
    recommendation: 'アイドル/タブ非表示での自動ロックを有効化してください。',
  },
  'backup-configured': {
    id: 'backup-configured',
    label: 'クラウドバックアップ構成',
    severity: 'medium',
    weight: 10,
    recommendation: 'Drive / Dropbox / OneDrive 等のバックアップ先を構成してください (消失対策)。',
  },
  'backup-fresh': {
    id: 'backup-fresh',
    label: `バックアップ鮮度 (${MAX_BACKUP_AGE_DAYS}日以内)`,
    severity: 'medium',
    weight: 10,
    recommendation: '定期的にバックアップを取得してください (直近が古い/未実施)。',
  },
  'backup-encrypted': {
    id: 'backup-encrypted',
    label: 'バックアップの暗号化',
    severity: 'high',
    weight: 10,
    recommendation: 'クラウドへ送るバックアップを暗号化してください (送信先での閲覧を防止)。',
  },
};
// Stryker restore all

function check(id: string, ok: boolean): SecurityCheck {
  const spec = CHECK_SPECS[id]!;
  return {
    id: spec.id,
    label: spec.label,
    severity: spec.severity,
    weight: spec.weight,
    ok,
    recommendation: spec.recommendation,
  };
}

/** スコアからグレードを決める (純粋)。 */
export function gradeForScore(score: number): DbSecurityReport['grade'] {
  if (score >= GRADE_A_MIN) return 'A';
  if (score >= GRADE_B_MIN) return 'B';
  if (score >= GRADE_C_MIN) return 'C';
  return 'D';
}

/** 入力からDBセキュリティ姿勢レポートを組み立てる (純粋・決定論的)。 */
export function buildDbSecurityReport(input: DbSecurityInputs): DbSecurityReport {
  const b = input.cloudBackup;
  const backupFresh = b.lastBackupAgeDays !== null && b.lastBackupAgeDays <= MAX_BACKUP_AGE_DAYS;
  // 表示は観点のグループ順 (暗号化系→ロック→整合性→バックアップ系) で重み降順ではない。
  // findings は別途 weight 降順にソートするため、この順序に依存しない。
  const checks: SecurityCheck[] = [
    check('encryption', input.encryptionEnabled),
    check('auto-lock', input.autoLockEnabled),
    check('integrity', input.integrityVerified),
    check('backup-encrypted', b.encryptedBackup),
    check('master-password', input.masterPasswordSet),
    check('backup-configured', b.configuredSinks.length > 0),
    check('backup-fresh', backupFresh),
  ];
  let score = 0;
  for (const c of checks) {
    if (c.ok) score += c.weight;
  }
  const findings = checks.filter((c) => !c.ok).sort((a, b2) => b2.weight - a.weight);
  return { checks, score, grade: gradeForScore(score), findings };
}
