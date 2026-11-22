import { describe, expect, it } from 'vitest';
import {
  buildDbSecurityReport,
  gradeForScore,
  MAX_BACKUP_AGE_DAYS,
  GRADE_A_MIN,
  GRADE_B_MIN,
  GRADE_C_MIN,
  partitionChecks,
  type DbSecurityInputs,
  type SecurityCheck,
} from '../dbSecurityPosture';

const allOn: DbSecurityInputs = {
  encryptionEnabled: true,
  masterPasswordSet: true,
  integrityVerified: true,
  autoLockEnabled: true,
  cloudBackup: {
    configuredSinks: ['drive', 'dropbox'],
    lastBackupAgeDays: 1,
    encryptedBackup: true,
  },
};

const allOff: DbSecurityInputs = {
  encryptionEnabled: false,
  masterPasswordSet: false,
  integrityVerified: false,
  autoLockEnabled: false,
  cloudBackup: { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false },
};

describe('gradeForScore', () => {
  it('maps score to grade at the boundaries', () => {
    expect(gradeForScore(100)).toBe('A');
    expect(gradeForScore(GRADE_A_MIN)).toBe('A'); // 90
    expect(gradeForScore(GRADE_A_MIN - 1)).toBe('B'); // 89
    expect(gradeForScore(GRADE_B_MIN)).toBe('B'); // 70
    expect(gradeForScore(GRADE_B_MIN - 1)).toBe('C'); // 69
    expect(gradeForScore(GRADE_C_MIN)).toBe('C'); // 50
    expect(gradeForScore(GRADE_C_MIN - 1)).toBe('D'); // 49
    expect(gradeForScore(0)).toBe('D');
  });
});

describe('buildDbSecurityReport', () => {
  it('scores a fully hardened DB at 100 / grade A with no findings', () => {
    const r = buildDbSecurityReport(allOn);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('A');
    expect(r.findings).toEqual([]);
    expect(r.checks).toHaveLength(7);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it('scores a fully unprotected DB at 0 / grade D with all checks as findings', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.score).toBe(0);
    expect(r.grade).toBe('D');
    expect(r.findings).toHaveLength(7);
  });

  it('sums only the weights of passing checks', () => {
    // 暗号化(30) + マスターPW(15) のみ ON → 45。
    const r = buildDbSecurityReport({
      ...allOff,
      encryptionEnabled: true,
      masterPasswordSet: true,
    });
    expect(r.score).toBe(45);
    expect(r.grade).toBe('D'); // 45 < 50
  });

  it('reorders findings to weight-descending when checks are not pre-sorted (ascending input)', () => {
    // checks 配列順では auto-lock(10) が integrity(15) より前。findings は重み降順へ並べ替える。
    const r = buildDbSecurityReport({ ...allOn, autoLockEnabled: false, integrityVerified: false });
    expect(r.findings.map((f) => f.id)).toEqual(['integrity', 'auto-lock']);
    expect(r.findings[0]!.weight).toBeGreaterThan(r.findings[1]!.weight);
  });

  it('keeps weight-descending order when checks order already is descending', () => {
    // encryption(30) が auto-lock(10) より前 = 既に降順。並べ替えても順序は不変。
    const r = buildDbSecurityReport({ ...allOn, encryptionEnabled: false, autoLockEnabled: false });
    expect(r.findings.map((f) => f.id)).toEqual(['encryption', 'auto-lock']);
    expect(r.score).toBe(60);
  });

  it('treats a never-backed-up DB (null age) as stale', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: null },
    });
    expect(r.findings.map((f) => f.id)).toContain('backup-fresh');
  });

  it('treats a backup exactly at the freshness threshold as fresh (<= boundary)', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: MAX_BACKUP_AGE_DAYS },
    });
    expect(r.findings.map((f) => f.id)).not.toContain('backup-fresh');
  });

  it('treats a backup older than the threshold as stale', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: MAX_BACKUP_AGE_DAYS + 1 },
    });
    expect(r.findings.map((f) => f.id)).toContain('backup-fresh');
  });

  it('flags backup-configured only when no sink is configured', () => {
    expect(
      buildDbSecurityReport({ ...allOn, cloudBackup: { ...allOn.cloudBackup, configuredSinks: [] } })
        .findings.map((f) => f.id),
    ).toContain('backup-configured');
    expect(
      buildDbSecurityReport({ ...allOn, cloudBackup: { ...allOn.cloudBackup, configuredSinks: ['drive'] } })
        .findings.map((f) => f.id),
    ).not.toContain('backup-configured');
  });

  it('is deterministic', () => {
    expect(buildDbSecurityReport(allOn)).toEqual(buildDbSecurityReport(allOn));
  });

  /**
   * 札が**範囲を名乗る**ことを留める。
   *
   * この検査が見ているのは業務レコード (`data/store.ts`) だけで、書き出した
   * 書類 (`library/library.ts`) と localStorage の各ストア (会話履歴・
   * 気分のメモ・下書き) は常に平文。範囲を書かない「保存時暗号化 ✓」は
   * 「全部暗号化されている」と読ませるため、**診断が実態より安全に見える**。
   *
   * 中身ではなく主張を留める検査なので字面を見るしかない。見るのは
   * 「範囲が書いてあるか」の 1 点だけにして、文言の言い回しには縛りを掛けない。
   */
  it('保存時暗号化の札は、対象が業務レコードであることを名乗る', () => {
    const check = buildDbSecurityReport(allOn).checks.find((c) => c.id === 'encryption');
    expect(check).toBeDefined();
    expect(check!.label).toContain('レコード');
  });
});

/*
 * 2026-08-25 —— **直せるものと、直せないものを分ける。**
 *
 * 7 観点のうち 5 つは、この版に仕組みが無いものだった (重み 75/100): 到達しうる最大点は 25 で、
 * すべて正しく設定した利用者にも「25 / 100 · D」が出ていた。
 *
 * 2026-11-21 に 5 つとも作った (記録の暗号化の画面・記録に結び付けた封緘・暗号化した控えの観測)。
 * いまは 7 観点すべてが利用者に直せる。区分 (`not-built`) の仕組みは残し、ここでは
 * 「今は直せない物が 1 つも無い」ことと「どの助言も実在する画面を指す」ことを留める。
 */
describe('直せるものと、直せないものを分ける', () => {
  const allOff = {
    encryptionEnabled: false,
    masterPasswordSet: false,
    integrityVerified: false,
    autoLockEnabled: false,
    cloudBackup: { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false },
  };

  it('未達は actionable と unavailable に漏れなく分かれる', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.actionable.length + r.unavailable.length).toBe(r.findings.length);
    for (const c of r.actionable) expect(c.availability).toBe('available');
    for (const c of r.unavailable) expect(c.availability).toBe('not-built');
  });

  it('★ 今の版に、利用者に直せない観点は無い (7 つとも直せる)', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.unavailable).toEqual([]);
    expect(r.actionable.map((c) => c.id).sort()).toEqual([
      'auto-lock',
      'backup-configured',
      'backup-encrypted',
      'backup-fresh',
      'encryption',
      'integrity',
      'master-password',
    ]);
  });

  it('到達しうる最大点は available な観点の重み合計 (今は 100)', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.maxAchievableScore).toBe(100);
    const avail = r.checks.filter((c) => c.availability === 'available');
    expect(avail.reduce((a, c) => a + c.weight, 0)).toBe(r.maxAchievableScore);
  });

  it('できることを全部やると、到達しうる最大点 (A) になる', () => {
    const r = buildDbSecurityReport({
      encryptionEnabled: true,
      masterPasswordSet: true,
      integrityVerified: true,
      autoLockEnabled: true,
      cloudBackup: { configuredSinks: ['encrypted-copy'], lastBackupAgeDays: 0, encryptedBackup: true },
    });
    expect(r.score).toBe(r.maxAchievableScore);
    expect(r.grade).toBe('A');
    expect(r.actionable).toEqual([]);
  });

  /*
   * **従えない助言を出さない。** 「設定で〜」は、その画面が実在するときだけ言ってよい。
   * 実在は `securityDiagnosisFixes.test.ts` が設定画面を描いて確かめる (ここは名指しの形だけ)。
   */
  it('★ 直す画面を持つ観点の助言は、その画面を「」で名指しする', () => {
    const r = buildDbSecurityReport(allOff);
    const named = (id: string) => r.checks.find((c) => c.id === id)!.recommendation;
    expect(named('encryption')).toContain('設定の「業務記録の暗号化」');
    expect(named('integrity')).toContain('業務記録の暗号化');
    expect(named('backup-configured')).toContain('設定の「暗号化した控え」');
    expect(named('backup-fresh')).toContain('設定の「暗号化した控え」');
  });

  /*
   * **不在の検査には、標本を添える。** 以前の誘導文 (存在しない設定へ誘導した物) と、
   * 2026-08-25〜2026-11-21 の「この版には無い」の文が、今の助言に戻っていないこと。
   */
  const OLD_WORDINGS = [
    '設定でレコード暗号化を有効化し、マスターパスワードで封緘してください。',
    'Drive / Dropbox / OneDrive 等のバックアップ先を構成してください (消失対策)。',
    '業務レコードは平文で保存されています。有効化する画面はまだありません (暗号化エンジンは実装済み・配線待ち)。',
    'クラウド同期はこの版では未接続です (送信路が未実装)。',
    'レコード単位の改ざん検知はこの版にはありません。',
  ];
  const STALE = /設定でレコード暗号化を有効化|バックアップ先を構成してください|画面はまだありません|この版では未接続|この版にはありません/;

  it('★ この検査自体が空でない (実際に使っていた文面に当たる)', () => {
    for (const w of OLD_WORDINGS) {
      expect(w, '規則が実物の文面に当たらない — 綴りを実物から取り直すこと').toMatch(STALE);
    }
  });

  it('古い文面 (存在しない設定への誘導・「この版に無い」) が戻っていない', () => {
    const r = buildDbSecurityReport(allOff);
    for (const c of r.checks) {
      expect(c.recommendation, `${c.id} が古い文面を出している`).not.toMatch(STALE);
    }
  });

  it('重み降順の並びは分けたあとも保たれる', () => {
    const r = buildDbSecurityReport(allOff);
    const weights = r.actionable.map((c) => c.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});

describe('★ 分ける規則は、この版に無い観点を足した日にも働く (partitionChecks)', () => {
  // 今の CHECK_SPECS は 7 つとも available なので、規則は実物では観測できない。
  // 合成した項目で当てる。
  const mk = (id: string, ok: boolean, weight: number, availability: SecurityCheck['availability']): SecurityCheck => ({
    id, label: id, severity: 'high', weight, ok, recommendation: id, availability,
  });
  const checks = [
    mk('a-ok', true, 30, 'available'),
    mk('a-ng', false, 20, 'available'),
    mk('n-ng', false, 40, 'not-built'),
    mk('n-ok', true, 10, 'not-built'),
  ];

  it('未達だけが findings に入り、重み降順に並ぶ', () => {
    expect(partitionChecks(checks).findings.map((c) => c.id)).toEqual(['n-ng', 'a-ng']);
  });

  it('直せる未達だけが actionable、無い未達だけが unavailable', () => {
    const p = partitionChecks(checks);
    expect(p.actionable.map((c) => c.id)).toEqual(['a-ng']);
    expect(p.unavailable.map((c) => c.id)).toEqual(['n-ng']);
  });

  it('到達しうる最大点は available な観点だけの重み合計 (達成の有無に依らない)', () => {
    expect(partitionChecks(checks).maxAchievableScore).toBe(50);
  });

  it('対照: 全部が available なら最大点は全重み・unavailable は空', () => {
    const all = checks.map((c) => ({ ...c, availability: 'available' as const }));
    const p = partitionChecks(all);
    expect(p.maxAchievableScore).toBe(100);
    expect(p.unavailable).toEqual([]);
  });
});
