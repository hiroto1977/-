/**
 * **Ollama の脆弱性の台帳 —— 日付・修正版・床の一致。** (2026-09-09 · パス 139)
 *
 * 2026-05-12 から 2026-09-09 まで、画面は「未パッチの out-of-bounds read が公表されています」
 * という日付の無い固定文を毎スナップショットに刷り、安全の床は 2024 年の CVE の 0.1.46 だった。
 * その OOB read は CVE-2026-7482 で、修正 (0.17.1) は固定文を書く前に出ていた。
 * ここで留めるのは: 台帳の各行の事実 (id / 修正版)、床が台帳から導かれること、
 * 版ごとの当てはまり、注意の文面が**いつの事実か**を持つこと、再照合期限の判定の境界。
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_SAFE_VERSION,
  OLLAMA_ADVISORIES,
  OLLAMA_ADVISORIES_REVIEW_BY,
  OLLAMA_ADVISORIES_VERIFIED_ON,
  advisoriesOverdue,
  advisoryLedgerNotice,
  applicableAdvisories,
  buildWarnings,
  compareVersions,
  isVersionSafe,
  unfixedAdvisories,
  type OllamaAdvisory,
} from '../ollama';

const NOW = new Date('2026-09-09T12:00:00Z');
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const byId = (id: string): OllamaAdvisory | undefined => OLLAMA_ADVISORIES.find((a) => a.id === id);
const ids = (rows: readonly OllamaAdvisory[]): string[] => rows.map((a) => a.id);

describe('OLLAMA_ADVISORIES (台帳そのもの)', () => {
  it('★ 2026-09-09 まで「未パッチ」と刷っていた GGUF の範囲外読み取りは CVE-2026-7482 で、0.17.1 で修正済み', () => {
    expect(byId('CVE-2026-7482')).toMatchObject({ fixedIn: '0.17.1', severity: 'high' });
  });

  it('修正版を持つ行の id と修正版 (2024 年の 5 件 + 2026 年の 2 件)', () => {
    const fixed = Object.fromEntries(
      OLLAMA_ADVISORIES.filter((a) => a.fixedIn !== null).map((a) => [a.id, a.fixedIn]),
    );
    expect(fixed).toEqual({
      'CVE-2024-37032': '0.1.34',
      'CVE-2024-39719': '0.1.46',
      'CVE-2024-39720': '0.1.46',
      'CVE-2024-39721': '0.1.46',
      'CVE-2024-39722': '0.1.46',
      'CVE-2026-7482': '0.17.1',
      'CVE-2026-86289': '0.31.2',
    });
  });

  it('修正版が未公表の項目は CVE-2025-66960 の 1 件', () => {
    expect(ids(unfixedAdvisories())).toEqual(['CVE-2025-66960']);
    expect(byId('CVE-2025-66960')?.severity).toBe('high');
  });

  it('各行は形が揃っている (id は CVE の形で重複せず・要約あり・severity は 4 値・出典は https)', () => {
    expect(OLLAMA_ADVISORIES).toHaveLength(8);
    expect(new Set(ids(OLLAMA_ADVISORIES)).size).toBe(OLLAMA_ADVISORIES.length);
    for (const a of OLLAMA_ADVISORIES) {
      expect(a.id).toMatch(/^CVE-\d{4}-\d{4,}$/);
      expect(a.summary.length).toBeGreaterThan(10);
      expect(a.fixedIn === null || SEMVER.test(a.fixedIn)).toBe(true);
      expect(['critical', 'high', 'medium', 'low']).toContain(a.severity);
      expect(a.source.startsWith('https://')).toBe(true);
    }
  });

  it('★ MIN_SAFE_VERSION は台帳の修正版の最大 (手で写していない)', () => {
    const fixed = OLLAMA_ADVISORIES.flatMap((a) => (a.fixedIn === null ? [] : [a.fixedIn]));
    const max = fixed.reduce((m, v) => (compareVersions(v, m) > 0 ? v : m));
    expect(MIN_SAFE_VERSION).toBe(max);
    expect(MIN_SAFE_VERSION).toMatch(SEMVER);
  });

  it('照合日と再照合期限は YYYY-MM-DD で、照合日が先', () => {
    expect(OLLAMA_ADVISORIES_VERIFIED_ON).toMatch(ISO_DAY);
    expect(OLLAMA_ADVISORIES_REVIEW_BY).toMatch(ISO_DAY);
    expect(OLLAMA_ADVISORIES_VERIFIED_ON < OLLAMA_ADVISORIES_REVIEW_BY).toBe(true);
  });
});

describe('applicableAdvisories', () => {
  it('★ 0.16.9 には CVE-2026-7482 が当てはまり、0.17.1 には当てはまらない', () => {
    expect(ids(applicableAdvisories('0.16.9'))).toEqual(['CVE-2026-7482', 'CVE-2026-86289']);
    expect(ids(applicableAdvisories('0.17.1'))).toEqual(['CVE-2026-86289']);
  });

  it('★ 0.31.1 には CVE-2026-86289 だけが当てはまり、0.31.2 には何も当てはまらない', () => {
    expect(ids(applicableAdvisories('0.31.1'))).toEqual(['CVE-2026-86289']);
    expect(applicableAdvisories('0.31.2')).toEqual([]);
    expect(applicableAdvisories('0.33.3')).toEqual([]);
  });

  it('0.1.45 には 2024 年の 4 件 (Probllama は 0.1.34 で修正済み) + 2026 年の 2 件 = 6 件。修正版未公表の 1 件は数えない', () => {
    const got = ids(applicableAdvisories('0.1.45'));
    expect(got).toHaveLength(6);
    expect(got).not.toContain('CVE-2024-37032');
    expect(got).not.toContain('CVE-2025-66960');
    expect(ids(applicableAdvisories('0.1.30'))).toHaveLength(7);
  });

  it('修正版と同じ版は当てはまらない (境界)、修正版未公表の項目は当てはまる側に入れない', () => {
    const ledger: OllamaAdvisory[] = [
      { id: 'CVE-2099-0001', summary: 'x', fixedIn: '1.2.3', severity: 'low', source: 'https://x.example/' },
      { id: 'CVE-2099-0002', summary: 'y', fixedIn: null, severity: 'high', source: 'https://x.example/' },
    ];
    expect(ids(applicableAdvisories('1.2.3', ledger))).toEqual([]);
    expect(ids(applicableAdvisories('1.2.2', ledger))).toEqual(['CVE-2099-0001']);
    expect(ids(unfixedAdvisories(ledger))).toEqual(['CVE-2099-0002']);
  });

  it('版が不明・文字列でなければ空 (誤警告を避ける)', () => {
    expect(applicableAdvisories('')).toEqual([]);
    expect(applicableAdvisories(undefined as unknown as string)).toEqual([]);
    expect(applicableAdvisories(42 as unknown as string)).toEqual([]);
  });

  it('★ isVersionSafe と一致する: 当てはまる項目が無い ⇔ 安全', () => {
    for (const v of ['0.1.30', '0.1.46', '0.5.4', '0.16.9', '0.17.1', '0.31.1', '0.31.2', '0.33.3', '1.0.0']) {
      expect(isVersionSafe(v)).toBe(applicableAdvisories(v).length === 0);
    }
  });
});

describe('advisoryLedgerNotice / advisoriesOverdue', () => {
  it('★ 注意は照合日・再照合期限・件数を刷る', () => {
    const text = advisoryLedgerNotice(NOW);
    expect(text).toContain(`${OLLAMA_ADVISORIES_VERIFIED_ON} 時点`);
    expect(text).toContain(`再照合期限 ${OLLAMA_ADVISORIES_REVIEW_BY}`);
    expect(text).toContain(`${OLLAMA_ADVISORIES.length} 件の台帳`);
    expect(text).toContain('修正版が未公表の項目 1 件 (CVE-2025-66960)');
    expect(text).toContain('/api/pull・/api/create・/api/push を呼ばず');
    expect(text).toContain('docs/OLLAMA_SECURITY.md');
    expect(text).not.toContain('未パッチ');
    expect(text).not.toContain('再照合期限を過ぎて');
  });

  it('期限当日はまだ過ぎていない (12:00Z / 23:59:59Z)、翌日 00:00:00Z は過ぎている', () => {
    expect(advisoriesOverdue(new Date(`${OLLAMA_ADVISORIES_REVIEW_BY}T12:00:00Z`))).toBe(false);
    expect(advisoriesOverdue(new Date(`${OLLAMA_ADVISORIES_REVIEW_BY}T23:59:59Z`))).toBe(false);
    expect(advisoriesOverdue(new Date(Date.parse(`${OLLAMA_ADVISORIES_REVIEW_BY}T23:59:59Z`) + 1000))).toBe(true);
    expect(advisoriesOverdue(NOW)).toBe(false);
    expect(advisoriesOverdue(new Date('2027-03-10T00:00:00Z'), '2027-03-09')).toBe(true);
  });

  it('★ 期限を過ぎると注意がそう言う', () => {
    const late = advisoryLedgerNotice(new Date('2027-06-01T00:00:00Z'));
    expect(late).toContain('再照合期限を過ぎており');
    expect(late).toContain(`${OLLAMA_ADVISORIES_VERIFIED_ON} 時点`);
  });

  it('修正版未公表の項目が無ければ言わない (合成の台帳)', () => {
    const ledger: OllamaAdvisory[] = [
      { id: 'CVE-2099-0001', summary: 'x', fixedIn: '1.2.3', severity: 'low', source: 'https://x.example/' },
    ];
    const text = advisoryLedgerNotice(NOW, ledger);
    expect(text).toContain('1 件の台帳');
    expect(text).not.toContain('修正版が未公表');
  });
});

describe('buildWarnings (名指し)', () => {
  it('当てはまる項目が無ければ台帳の注意 1 本だけ', () => {
    expect(buildWarnings('0.33.3', NOW)).toEqual([advisoryLedgerNotice(NOW)]);
  });

  it('★ 当てはまれば先頭で名指しし、修正版と床を言う', () => {
    const w = buildWarnings('0.16.0', NOW);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('検出された Ollama 0.16.0 には既知の脆弱性 2 件が当てはまります');
    expect(w[0]).toContain('CVE-2026-7482 (');
    expect(w[0]).toContain('0.17.1 で修正');
    expect(w[0]).toContain(' / CVE-2026-86289 (');
    expect(w[0]).toContain(`${MIN_SAFE_VERSION} 以上へ更新してください`);
    expect(w[1]).toBe(advisoryLedgerNotice(NOW));
  });

  it('合成の台帳でも同じ規則', () => {
    const ledger: OllamaAdvisory[] = [
      { id: 'CVE-2099-0001', summary: 'x', fixedIn: '1.2.3', severity: 'low', source: 'https://x.example/' },
    ];
    expect(buildWarnings('1.2.3', NOW, ledger)).toHaveLength(1);
    expect(buildWarnings('1.0.0', NOW, ledger)[0]).toContain('CVE-2099-0001 (x・1.2.3 で修正)');
  });
});
