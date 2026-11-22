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
  /**
   * 端末の外への控え。名前は歴史的 (クラウド同期を想定していた頃の物) で、2026-11-21 から
   * 中身は暗号化した控え (`data/encryptedCopy.ts`) の目印から組む (`renderer/data/dbPosture.ts`)。
   */
  readonly cloudBackup: {
    /** 控えを書いた道 (例: ['encrypted-copy'])。1 度も書いていなければ空。 */
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
 *
 * 2026-11-21 に 5 つとも作った (記録の暗号化の画面・記録に結び付けた封緘・暗号化した控えの観測)。
 * 今は 7 観点すべてが `available` で、到達しうる最大は 100 点。区分は次に足す観点のために残す。
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
     * 2026-11-21 に有効化の画面を配線した (設定の「業務記録の暗号化」・`RecordEncryptionPanel`)。
     * それまでは「有効化する画面はまだありません」と書いていた (エンジンは在り、画面だけが未配線だった)。
     */
    recommendation:
      '設定の「業務記録の暗号化」でパスフレーズ (12 文字以上) を決めて有効にしてください。' +
      'パスフレーズは保存しません —— 忘れると記録は開けないので、暗号化した控えと併せて使ってください。',
    availability: 'available',
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
    label: 'レコードの改ざん検知 (書き換え・写し替え)',
    severity: 'high',
    weight: 15,
    /*
     * 2026-11-21: 暗号化した記録は、封緘の中に記録の collection と id を入れて封じる
     * (`data/recordCipher.ts`)。GCM が書き換えを、結び付けが別の記録からの写し替えを止める。
     * だからこの観点は暗号化が有効なら満たされる。**検知しない形を札で名乗る** ——
     * 記録を丸ごと消す・同じ記録の古い封緘へ戻す形は見えない (記録の外の台帳が要る)。
     */
    recommendation:
      '業務記録の暗号化を有効にすると、記録ごとの封緘で書き換えと別の記録からの写し替えを検知します。' +
      '記録を丸ごと消す・同じ記録の古い中身へ戻す形は検知しません。',
    availability: 'available',
  },
  'auto-lock': {
    id: 'auto-lock',
    label: '自動ロック',
    severity: 'medium',
    weight: 10,
    recommendation: 'アイドル/タブ非表示での自動ロックを有効化してください。',
    availability: 'available',
  },
  /*
   * **控えの 3 観点は、暗号化した控え (`data/encryptedCopy.ts`) を見る** (2026-11-21)。
   *
   * 2026-11-11 に「暗号化した控え」(書いて読み戻して確かめる・端末が目印を覚える) が入ったのに、
   * この診断は「クラウド同期はこの版に無い」と言い続け、3 観点を常に未達・直せない物として出していた。
   * 控えを保存先フォルダ (クラウドと同期しているフォルダにすれば提供者が持つのは暗号文だけ) か
   * ダウンロードで書いた目印から測る。**端末の外へ移したかはアプリには見えない** ので札にそう書く。
   */
  'backup-configured': {
    id: 'backup-configured',
    label: '暗号化した控え (保存先フォルダ / ダウンロード)',
    severity: 'medium',
    weight: 10,
    recommendation:
      '設定の「暗号化した控え」で控えを書いてください。保存先をクラウドと同期しているフォルダにするか、' +
      'ダウンロードしたファイルを端末の外 (クラウドのドライブなど) へ移すと、端末が壊れても戻せます。',
    availability: 'available',
  },
  'backup-fresh': {
    id: 'backup-fresh',
    label: `暗号化した控えの鮮度 (${MAX_BACKUP_AGE_DAYS}日以内)`,
    severity: 'medium',
    weight: 10,
    recommendation: `最後の控えから ${MAX_BACKUP_AGE_DAYS} 日を過ぎたか、まだ控えていません。設定の「暗号化した控え」で書き直してください。`,
    availability: 'available',
  },
  'backup-encrypted': {
    id: 'backup-encrypted',
    label: '控えの暗号化',
    severity: 'high',
    weight: 10,
    recommendation:
      '控えはパスフレーズで AES-GCM 暗号化して書き、そのパスフレーズで開けることを確かめてから「書けた」と言います。' +
      'まだ 1 度も控えていないので満たしていません。',
    availability: 'available',
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
  return { checks, score, grade: gradeForScore(score), ...partitionChecks(checks) };
}

/**
 * 項目を「直せる物」と「この版に無い物」に分ける。
 *
 * 2026-11-22 に 7 項目すべてが作られたので、今の `CHECK_SPECS` では
 * `unavailable` は常に空で `maxAchievableScore` は 100 になる。それでも
 * 分ける規則は残す —— 将来まだ作っていない保護を項目として足したとき、
 * 画面は「この版に無い保護」として別に並べ、到達しうる最大点を正直に
 * 言う必要がある。規則が今のデータで観測できないので、関数として出して
 * 合成した項目で検査する。
 */
export function partitionChecks(checks: readonly SecurityCheck[]): Pick<DbSecurityReport, 'findings' | 'actionable' | 'unavailable' | 'maxAchievableScore'> {
  const findings = checks.filter((c) => !c.ok).sort((a, b2) => b2.weight - a.weight);
  // **直せるものと、直せないものを分ける。** 混ぜて重み順に並べると、
  // この版に無い保護が上を占め、今できる事が下に埋まる。
  const actionable = findings.filter((c) => c.availability === 'available');
  const unavailable = findings.filter((c) => c.availability === 'not-built');
  const maxAchievableScore = checks
    .filter((c) => c.availability === 'available')
    .reduce((acc, c) => acc + c.weight, 0);
  return { findings, actionable, unavailable, maxAchievableScore };
}
