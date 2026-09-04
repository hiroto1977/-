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

/**
 * その観点を、**利用者が今どうにかできるか**。
 *
 * ## なぜ要るのか (2026-08-25)
 *
 * 7 観点のうち **5 つは、この版に仕組みが無い** ものだった ——
 * レコード暗号化 (エンジンはあるが有効化する画面が無い) と、
 * クラウドバックアップ 3 種 (送信路の実装が 1 つも無い)、
 * レコードの改ざん検知 (未実装)。重みにして **75 / 100**。
 *
 * つまり**この版で到達しうる最大点は 25 点**で、すべて正しく設定した
 * 利用者にも「25 / 100・グレード D」が出る。しかも改善候補は重み降順に
 * 並ぶので、**直せない 5 件が上に来て、今できる事が下に埋まる**。
 *
 * 診断は「あなたの設定が悪い」と読まれるが、実際に足りていないのは
 * **アプリの機能**である。**直せないものを混ぜて並べると、利用者は一覧
 * ごと信じなくなる。** 分けて出せるように、観点ごとに持たせる。
 */
export type Availability =
  /** 利用者が設定で変えられる。 */
  | 'available'
  /** この版に仕組みが無い。利用者には直せない。 */
  | 'not-built';

/** 1 観点の診断結果。 */
export interface SecurityCheck {
  readonly id: string;
  readonly label: string;
  readonly severity: Severity;
  readonly weight: number;
  readonly ok: boolean;
  /** 未達のとき行うべき改善 (固定文)。 */
  readonly recommendation: string;
  /** 利用者が今どうにかできるか。 */
  readonly availability: Availability;
}

/** 診断レポート。 */
export interface DbSecurityReport {
  readonly checks: readonly SecurityCheck[];
  /** 0..100 (達成項目の重み合計)。 */
  readonly score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D';
  /** 未達の観点すべて (改善候補・重み降順)。 */
  readonly findings: readonly SecurityCheck[];
  /** 未達のうち、**利用者が今できる**もの (重み降順)。 */
  readonly actionable: readonly SecurityCheck[];
  /** 未達のうち、**この版に仕組みが無い**もの (重み降順)。利用者には直せない。 */
  readonly unavailable: readonly SecurityCheck[];
  /**
   * この版で到達しうる最大点 (`available` な観点の重み合計)。
   *
   * これが 100 未満なら、**満点を取れない理由は利用者の側に無い**。
   * グレードだけを見せると「D」しか出ないので、この数と併せて示す。
   */
  readonly maxAchievableScore: number;
}

/** バックアップが「新しい」とみなす最大経過日数。 */
export const MAX_BACKUP_AGE_DAYS = 7;
/** グレード境界。 */
export const GRADE_A_MIN = 90;
export const GRADE_B_MIN = 70;
export const GRADE_C_MIN = 50;

// 観点のメタ情報 (表示文言・重み)。文字列・重みは表現として Stryker から除外し、
// ロジック (ok 判定・採点・グレード・findings) を実テストで撃墜する。
interface CheckSpec {
  readonly id: string;
  readonly label: string;
  readonly severity: Severity;
  readonly weight: number;
  readonly recommendation: string;
  readonly availability: Availability;
}
const CHECK_SPECS: Readonly<Record<string, CheckSpec>> = {
  encryption: {
    id: 'encryption',
    // **範囲を名乗る。** この検査が見ているのは業務レコード
    // (`data/store.ts`) だけで、書き出した書類 (`library/library.ts`) と
    // localStorage の各ストア (会話履歴・気分のメモ・下書き) は**常に平文**。
    // 範囲を書かない「保存時暗号化 ✓」は、利用者に「全部暗号化されている」と
    // 読ませる —— 診断が実態より安全に見えるのは、診断が無いより悪い。
    // (`recommendation` は元から「レコード暗号化」と正しく書いており、
    //  `docs/DATA_PROTECTION.md` も一貫して「業務レコード」と範囲を書いている。
    //  **札だけが範囲を落としていた**。)
    label: '業務レコードの保存時暗号化 (AES-GCM)',
    severity: 'critical',
    weight: 30,
    /*
     * **勧める先が存在しないなら、そう書く。**
     *
     * 2026-08-25 まで、ここは「設定でレコード暗号化を有効化し」と書いて
     * いた。**その設定は無い** —— `enableEncryption` の呼び出し元は
     * テストを除いて 0 で、`isEncryptionEnabled()` は常に false である
     * (エンジン・KCV・再暗号化まで実装済みで、画面だけが未配線)。
     *
     * この項目は critical・重み 30 で**改善候補の先頭に出る**。
     * つまり利用者は「いちばん重要」と示された対処を探しに行き、
     * **見つけられない**。同日に直した「バックアップを書き出してください
     * (そのバックアップにトークンは入らない)」と同じ形で、
     * **従えない助言は、助言が無いより悪い** —— 探す時間を奪ったうえ、
     * 他の助言まで当てにならないものに見せる。
     *
     * 配線は機能追加であり、持ち主が決めることなので勝手に作らない。
     * 代わりに**現状と、今できること**を書く。
     */
    recommendation:
      '業務レコードは平文で保存されています。有効化する画面はまだありません (暗号化エンジンは実装済み・配線待ち)。' +
      '当面は、機微なレコードをこの端末に置かないか、バックアップをパスワード付きで書き出してください。',
    availability: 'not-built',
  },
  'master-password': {
    id: 'master-password',
    label: 'マスターパスワード設定',
    severity: 'high',
    weight: 15,
    recommendation: '十分に長いマスターパスワードを設定してください (暗号鍵の導出元)。',
    availability: 'available',
  },
  integrity: {
    id: 'integrity',
    // **2 つの別の話を 1 つの札にしていた。** バックアップの整合性
    // (SHA-256) は `backup.ts` で**必須**であり、既に常時効いている
    // (checksum の無いバックアップをこのアプリが作ったことは一度も無い)。
    // 未実装なのは**レコード単位の改ざん検知**のほうである。
    // 「有効化してください」は、片方は既に有効・片方は存在しない、という
    // どちらの意味でも従えない助言だった。
    label: 'レコードの改ざん検知',
    severity: 'high',
    weight: 15,
    recommendation:
      'レコード単位の改ざん検知はこの版にはありません。' +
      'なお書き出したバックアップは SHA-256 で必ず破損検知されます (鍵の無いハッシュなので改ざん検知ではありません —— ' +
      '改ざんに備えるならパスワードを付けて暗号化してください)。',
    availability: 'not-built',
  },
  'auto-lock': {
    id: 'auto-lock',
    label: '自動ロック',
    severity: 'medium',
    weight: 10,
    recommendation: 'アイドル/タブ非表示での自動ロックを有効化してください。',
    availability: 'available',
  },
  'backup-configured': {
    id: 'backup-configured',
    // **クラウド同期はこの版に存在しない。** 送信路の実装が 1 つも無い
    // ことは 2026-08-22 に実測済みで、`CloudSyncPanel` は偽の成功を出さない
    // よう直してある。診断の側だけが「構成してください」と言い続けていた。
    label: 'クラウドバックアップ構成',
    severity: 'medium',
    weight: 10,
    recommendation:
      'クラウド同期はこの版では未接続です (送信路が未実装)。消失対策としては、' +
      '設定の「バックアップ / 復元」からファイルを書き出して端末の外へ保管してください。',
    availability: 'not-built',
  },
  'backup-fresh': {
    id: 'backup-fresh',
    // **札が範囲を落としていた。** ここが見ているのは `cloudBackup` の
    // 経過日数だけで、`BackupPanel` の手動書き出しは数えていない。
    // 「バックアップ鮮度」「直近が古い/未実施」と書くと、**毎日きちんと
    // 書き出している利用者にも「未実施」と告げる**ことになる。
    label: `クラウドバックアップ鮮度 (${MAX_BACKUP_AGE_DAYS}日以内)`,
    severity: 'medium',
    weight: 10,
    recommendation:
      'クラウド同期はこの版では未接続のため、常に未実施として表示されます。' +
      '手動で書き出したバックアップはこの項目には数えられません。',
    availability: 'not-built',
  },
  'backup-encrypted': {
    id: 'backup-encrypted',
    label: 'クラウドバックアップの暗号化',
    severity: 'high',
    weight: 10,
    recommendation:
      'クラウド同期はこの版では未接続です。手元で書き出すバックアップは、' +
      '設定の「バックアップ / 復元」でパスワードを入れれば AES-GCM で暗号化されます。',
    availability: 'not-built',
  },
};

function check(id: string, ok: boolean): SecurityCheck {
  const spec = CHECK_SPECS[id]!;
  return {
    id: spec.id,
    label: spec.label,
    severity: spec.severity,
    weight: spec.weight,
    ok,
    recommendation: spec.recommendation,
    availability: spec.availability,
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
  // **直せるものと、直せないものを分ける。** 混ぜて重み順に並べると、
  // この版に無い保護 (重み 75) が上を占め、今できる事が下に埋まる。
  const actionable = findings.filter((c) => c.availability === 'available');
  const unavailable = findings.filter((c) => c.availability === 'not-built');
  const maxAchievableScore = checks
    .filter((c) => c.availability === 'available')
    .reduce((acc, c) => acc + c.weight, 0);
  return { checks, score, grade: gradeForScore(score), findings, actionable, unavailable, maxAchievableScore };
}
