import { describe, expect, it } from 'vitest';
import {
  detectThreat,
  normalizeForDetection,
  applyEvasion,
  runSecurityRange,
  categoryLabel,
  evasionLabel,
  DEFAULT_RANGE_CORPUS,
  DEFAULT_EVASIONS,
  type RangeCase,
} from '../securityRange';

describe('normalizeForDetection', () => {
  it('lowercases the input', () => {
    expect(normalizeForDetection('<SCRIPT>')).toBe('<script>');
  });
  it('replaces /* */ comments with a space', () => {
    expect(normalizeForDetection('union/**/select')).toBe('union select');
  });
  it('strips comments that contain whitespace and non-whitespace content', () => {
    // 中身ありコメント (空白と非空白の両方) を確実に除去する。
    expect(normalizeForDetection('a/* x */b')).toBe('a b');
  });
  it('collapses whitespace runs and trims', () => {
    expect(normalizeForDetection('  a   b  ')).toBe('a b');
  });
  it('decodes &lt; entity to <', () => {
    expect(normalizeForDetection('&lt;script')).toBe('<script');
  });
  it('decodes &#60; decimal entity to <', () => {
    expect(normalizeForDetection('&#60;script')).toBe('<script');
  });
  it('decodes &#x3c; hex entity to <', () => {
    expect(normalizeForDetection('&#x3c;script')).toBe('<script');
  });
});

describe('detectThreat', () => {
  it('flags classic XSS', () => {
    expect(detectThreat('<script>alert(1)</script>')).toBe('xss');
    expect(detectThreat('javascript:alert(1)')).toBe('xss');
  });
  it('flags SQL injection', () => {
    expect(detectThreat("' or 1=1 --")).toBe('sql-injection');
    expect(detectThreat('UNION SELECT x')).toBe('sql-injection');
  });
  it('flags command injection', () => {
    expect(detectThreat('ls; rm -rf /')).toBe('command-injection');
    expect(detectThreat('$(whoami)')).toBe('command-injection');
  });
  it('flags path traversal', () => {
    expect(detectThreat('../../etc/passwd')).toBe('path-traversal');
  });
  it('returns benign for safe-but-suspicious text', () => {
    expect(detectThreat('Please select your plan')).toBe('benign');
    expect(detectThreat('I love JavaScript')).toBe('benign');
    expect(detectThreat('Our union meets Friday')).toBe('benign');
  });
  it('applies priority order xss > sqli > cmdi > path', () => {
    // 複数カテゴリに該当しても優先順位の高い方を返す。
    expect(detectThreat('<script> union select')).toBe('xss');
    expect(detectThreat("' or 1=1 ; rm -rf /")).toBe('sql-injection');
    expect(detectThreat('; cat /etc/passwd')).toBe('command-injection');
  });
});

describe('applyEvasion', () => {
  it('none returns the payload unchanged', () => {
    expect(applyEvasion('<script>', 'none')).toBe('<script>');
  });
  it('case uppercases', () => {
    expect(applyEvasion('<script>', 'case')).toBe('<SCRIPT>');
  });
  it('whitespace expands spaces', () => {
    expect(applyEvasion('a b', 'whitespace')).toBe('a   b');
  });
  it('comment replaces spaces with /**/', () => {
    expect(applyEvasion('a b', 'comment')).toBe('a/**/b');
  });
  it('entity encodes < as &lt;', () => {
    expect(applyEvasion('<x', 'entity')).toBe('&lt;x');
  });
  it('split inserts a space after <', () => {
    expect(applyEvasion('<x', 'split')).toBe('< x');
  });
});

describe('detector defeats case / whitespace / comment / entity evasions', () => {
  for (const evasion of ['case', 'whitespace', 'comment', 'entity'] as const) {
    it(`still detects "union select" under ${evasion}`, () => {
      const evaded = applyEvasion('union select password', evasion);
      expect(detectThreat(evaded)).toBe('sql-injection');
    });
  }
  it('catches an entity-encoded <script> (entity evasion defeated)', () => {
    expect(detectThreat(applyEvasion('<script>x</script>', 'entity'))).toBe('xss');
  });
  it('the split evasion slips past a marker-only XSS payload (known gap)', () => {
    expect(detectThreat(applyEvasion('<iframe src=x>', 'split'))).toBe('benign');
  });
});

describe('runSecurityRange (red vs blue)', () => {
  it('catches every raw attack with zero false positives (safety invariant)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    const none = report.rounds.find((r) => r.evasion === 'none')!;
    expect(none.detectionRate).toBe(1);
    expect(none.falsePositives).toBe(0);
    expect(report.falsePositives).toBe(0);
  });

  it('records split-evasion misses as findings (improvement candidates)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    // < script / < iframe を分断する split で 2 件が取りこぼされる。
    expect(report.findings).toHaveLength(2);
    expect(report.findings.every((f) => f.evasion === 'split')).toBe(true);
    expect(report.findings.map((f) => f.id).sort()).toEqual(['xss-1', 'xss-4']);
  });

  it('computes overall detection rate and precision', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    // 15 攻撃 × 6 ラウンド = 90、取りこぼし 2 → 88/90。
    expect(report.overallDetectionRate).toBe(0.978);
    expect(report.precision).toBe(1); // 誤検知 0 のため
    expect(report.rounds).toHaveLength(DEFAULT_EVASIONS.length);
  });

  it('counts false positives when a benign case trips the detector', () => {
    const corpus: RangeCase[] = [
      { id: 'b', payload: '<script>', category: 'benign', note: 'mislabelled malicious' },
    ];
    const report = runSecurityRange(corpus, ['none']);
    expect(report.rounds[0]!.falsePositives).toBe(1);
    expect(report.falsePositives).toBe(1);
    expect(report.precision).toBe(0); // TP 0 / (0 + 1)
  });

  it('computes fractional precision when both true and false positives occur', () => {
    const corpus: RangeCase[] = [
      { id: 'tp', payload: '<script>', category: 'xss', note: 'detected' },
      { id: 'fp', payload: 'union select', category: 'benign', note: 'mislabelled — trips detector' },
    ];
    const report = runSecurityRange(corpus, ['none']);
    // TP=1, FP=1 → precision = 1/(1+1) = 0.5 (分母が和であることの担保)。
    expect(report.precision).toBe(0.5);
  });

  it('handles an attack-only corpus and a single round deterministically', () => {
    const corpus: RangeCase[] = [
      { id: 'a1', payload: '<script>', category: 'xss', note: '' },
      { id: 'a2', payload: 'union select x', category: 'sql-injection', note: '' },
    ];
    const report = runSecurityRange(corpus, ['none']);
    expect(report.rounds[0]!.attacks).toBe(2);
    expect(report.rounds[0]!.detected).toBe(2);
    expect(report.overallDetectionRate).toBe(1);
    expect(report.findings).toEqual([]);
  });

  it('handles an empty corpus safely', () => {
    const report = runSecurityRange([], DEFAULT_EVASIONS);
    expect(report.overallDetectionRate).toBe(0);
    expect(report.precision).toBe(0);
    expect(report.rounds.every((r) => r.detectionRate === 0)).toBe(true);
  });

  it('is reproducible (same input → same report)', () => {
    expect(runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS)).toEqual(
      runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS),
    );
  });
});

describe('labels', () => {
  it('maps category and evasion to Japanese', () => {
    expect(categoryLabel('xss')).toContain('XSS');
    expect(evasionLabel('split')).toContain('分断');
  });
});
