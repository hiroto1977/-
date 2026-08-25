import { describe, expect, it } from 'vitest';
import {
  buildDbSecurityReport,
  gradeForScore,
  MAX_BACKUP_AGE_DAYS,
  GRADE_A_MIN,
  GRADE_B_MIN,
  GRADE_C_MIN,
  type DbSecurityInputs,
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
 * 7 観点のうち 5 つは、この版に仕組みが無いものだった (重み 75/100):
 * レコード暗号化 (エンジンはあるが有効化画面が無い)、レコードの改ざん検知
 * (未実装)、クラウドバックアップ 3 種 (送信路が 1 つも無い)。
 *
 * つまり**到達しうる最大点は 25** で、すべて正しく設定した利用者にも
 * 「25 / 100 · D」が出る。しかも改善候補は重み降順なので、**直せない 5 件が
 * 上を占め、今できる 2 件が下に埋まっていた**。
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

  it('この版で直せるのは自動ロックとマスターパスワードだけ', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.actionable.map((c) => c.id).sort()).toEqual(['auto-lock', 'master-password']);
  });

  /*
   * **到達しうる最大点を報告する。** これを出さずに「25 / 100 · D」とだけ
   * 見せると、すべて設定した利用者が「自分の設定が悪い」と読む。
   */
  it('到達しうる最大点は available な観点の重み合計', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.maxAchievableScore).toBe(25);
    const avail = r.checks.filter((c) => c.availability === 'available');
    expect(avail.reduce((a, c) => a + c.weight, 0)).toBe(r.maxAchievableScore);
  });

  it('できることを全部やると、到達しうる最大点になる', () => {
    const r = buildDbSecurityReport({ ...allOff, autoLockEnabled: true, masterPasswordSet: true });
    expect(r.score).toBe(r.maxAchievableScore);
    expect(r.actionable).toEqual([]);
    expect(r.unavailable.length).toBe(5);
  });

  /*
   * **従えない助言を出さない。** 「設定で〜を有効化してください」は、
   * その設定が存在するときだけ言ってよい。
   */
  /*
   * **「悪い文面が無いこと」ではなく「良い文面が有ること」を見る。**
   *
   * 最初はこう書いていた:
   *
   *   expect(rec).not.toMatch(/設定で.*を有効化してください|構成してください/)
   *
   * 対照 (直す前の文面へ戻す) を回したら**鳴らなかった**。実物は
   * 「設定でレコード暗号化を有効化**し**、…封緘してください」であって
   * 「有効化**してください**」ではない —— **文面ではなく、自分の記憶の
   * 言い換えに対して正規表現を書いていた**。どの文面でも通る空の検査だった。
   *
   * 不在の検査は、綴りを 1 つ外すだけで黙る。**在ることの検査は、
   * 無ければ必ず鳴る。** 主張は肯定形で書く。
   */
  it('★ この版に無い保護の助言は、「無い」ことを明言している', () => {
    const r = buildDbSecurityReport(allOff);
    for (const c of r.unavailable) {
      expect(c.recommendation, `${c.id} が「この版には無い」と言っていない`).toMatch(
        /ありません|未接続/,
      );
      expect(c.recommendation.length).toBeGreaterThan(20);
    }
  });

  /*
   * **不在の検査には、標本を添える。**
   *
   * 下の `not.toMatch` は、綴りが 1 つ違えば黙る。実際 2026-08-25 に、
   * 記憶の言い換え (「有効化**してください**」) で書いたせいで**どの文面でも
   * 通る空の検査**になっていた —— 実物は「有効化**し**、」である。
   *
   * 手で対照を回せば分かるが、**回さなければ分からない**。標本をここに
   * 置いて、CI が毎回「この規則は当たるのか」を確かめる。
   */
  const OLD_WORDINGS = [
    '設定でレコード暗号化を有効化し、マスターパスワードで封緘してください。',
    'Drive / Dropbox / OneDrive 等のバックアップ先を構成してください (消失対策)。',
  ];
  const MISLEADING = /設定でレコード暗号化を有効化|バックアップ先を構成してください/;

  it('★ この検査自体が空でない (実際に使っていた文面に当たる)', () => {
    for (const w of OLD_WORDINGS) {
      expect(w, '規則が実物の文面に当たらない — 綴りを実物から取り直すこと').toMatch(MISLEADING);
    }
  });

  /* 併せて、実際に使っていた誘導文が戻ってきたら鳴らす (綴りは実物から取る)。 */
  it('存在しない設定へ誘導する古い文面が戻っていない', () => {
    const r = buildDbSecurityReport(allOff);
    for (const c of r.unavailable) {
      expect(c.recommendation, `${c.id} が存在しない設定へ誘導している`).not.toMatch(MISLEADING);
    }
  });

  it('重み降順の並びは分けたあとも保たれる', () => {
    const r = buildDbSecurityReport(allOff);
    const weights = r.unavailable.map((c) => c.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});
