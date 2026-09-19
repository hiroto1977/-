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
  it('rejoins a tag name split from its < (defeats split evasion)', () => {
    expect(normalizeForDetection('< script')).toBe('<script');
    expect(normalizeForDetection('<   script')).toBe('<script');
  });
  it('decodes JS \\u003c escape to < (defeats unicode evasion)', () => {
    expect(normalizeForDetection('\\u003cscript')).toBe('<script');
  });
  it('decodes JS \\x3c escape to <', () => {
    expect(normalizeForDetection('\\x3cscript')).toBe('<script');
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
  it('unicode escapes < as \\u003c', () => {
    expect(applyEvasion('<x', 'unicode')).toBe('\\u003cx');
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
  it('now catches the split evasion too (< script rejoined)', () => {
    expect(detectThreat(applyEvasion('<iframe src=x>', 'split'))).toBe('xss');
    expect(detectThreat(applyEvasion('<script>x</script>', 'split'))).toBe('xss');
  });
  it('now catches the unicode-escape evasion too (\\u003c decoded)', () => {
    expect(detectThreat(applyEvasion('<iframe src=x>', 'unicode'))).toBe('xss');
    expect(detectThreat(applyEvasion('<script>x</script>', 'unicode'))).toBe('xss');
  });
});

describe('runSecurityRange (red vs blue)', () => {
  it('catches every raw attack with zero false positives (safety invariant)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    const none = report.rounds.find((r) => r.evasion === 'none')!;
    expect(none.detectionRate).toBe(1);
    expect(none.falsePositives).toBe(0);
    expect(report.falsePositives).toBe(0);
    // **「誤検知 0」は、無害ケースを実際に評価していて初めて主張になる。**
    // この行が無いと、既定コーパスから無害ケースを全部消してもこの
    // 「安全不変条件」は通る (空振り合格)。**不在を主張する検査には標本を添える。**
    expect(report.benignChecked).toBeGreaterThan(0);
  });

  it('defeats every modeled evasion in the default corpus (no findings)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    // 第3周: split・unicode を防御済み。現行コーパスの全回避を打ち消す回帰ガード。
    expect(report.findings).toEqual([]);
    expect(report.rounds.every((r) => r.detectionRate === 1)).toBe(true);
  });

  it('computes overall detection rate and precision', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    // 15 攻撃 × 7 ラウンド = 105、全件検知 → 105/105。
    expect(report.overallDetectionRate).toBe(1);
    expect(report.precision).toBe(1); // 誤検知 0 のため
    expect(report.rounds).toHaveLength(DEFAULT_EVASIONS.length);
  });

  it('records a finding when an attack case evades detection', () => {
    const corpus: RangeCase[] = [
      { id: 'miss', payload: 'just plain words', category: 'xss', note: '検知不能なダミー攻撃' },
    ];
    const report = runSecurityRange(corpus, ['none']);
    expect(report.rounds[0]!.detected).toBe(0);
    expect(report.rounds[0]!.detectionRate).toBe(0);
    expect(report.findings).toEqual([
      { id: 'miss', evasion: 'none', category: 'xss', payload: 'just plain words' },
    ]);
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
    // 検知率・適合率が 0 に倒れるのは**安全な向き**である (何も測っていない
    // コーパスは「危ない報告」として出る)。危ないのは `falsePositives` で、
    // そちらは 0 が**目標達成**として緑に出る —— 下の describe を見よ。
    expect(report.benignChecked).toBe(0);
    expect(report.attacksChecked).toBe(0);
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

/**
 * **「誤検知 0 件」は、無害ケースを 1 件でも評価してから言うこと。**
 *
 * `RangeReport` の 3 つの集計値は、コーパスが空のとき**どちらの向きに倒れるかが
 * それぞれ違う**:
 *
 * | 欄 | 空のとき | 画面での意味 | 危ないか |
 * | --- | --- | --- | --- |
 * | `overallDetectionRate` | `0` | 「検知率 0.0%」(琥珀) | **安全** —— 何も測っていないコーパスは危なく出る |
 * | `precision` | `0` | 「適合率 0.0%」 | **安全** —— 同じ向き |
 * | `falsePositives` | `0` | **「誤検知 0 件」(緑)** | **危険** —— 0 が**目標達成**として出る |
 *
 * 型の doc 自身が 誤検知 を「0 が必須目標」と書いており、`SecurityPage` は
 * `falsePositives === 0` を緑で塗る。**無害ケースを 1 件も評価していなければ、
 * それは達成ではなく未測定**である —— パス 68 が `chartSelfCheck` の
 * `allPassed` に置いた床と同じ「空振り合格」の形が、1 ファイル隣に在った。
 *
 * ## 到達可能性 (正直に)
 *
 * 画面は `runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS)` を
 * **非空のモジュール定数**で呼ぶので、**今日この経路では 0 件にならない。**
 * ここで置くのは **export された契約側の床**である (呼ぶ側は任意のコーパスを
 * 渡せる)。画面の分岐そのものは
 * `pages/__tests__/falsePositiveScopeOnScreen.test.ts` が
 * `DEFAULT_RANGE_CORPUS` を差し替えて留める。
 *
 * ## 上の検査自身が空振りしていた
 *
 * `catches every raw attack with zero false positives (safety invariant)` は
 * `expect(report.falsePositives).toBe(0)` を「安全不変条件」と名乗っていたが、
 * **既定コーパスから無害ケースを全部消しても通る**検査だった。
 * `benignChecked > 0` を同じ検査に足して標本の存在を確かめる。
 */
describe('演習場 — 何件評価したかを公開する (0 件を「達成」と言わない)', () => {
  it('★ 無害ケースが無いコーパスでは benignChecked が 0 (「誤検知 0」は未測定)', () => {
    const attacksOnly: RangeCase[] = [
      { id: 'a1', payload: '<script>alert(1)</script>', category: 'xss', note: '' },
      { id: 'a2', payload: 'union select x', category: 'sql-injection', note: '' },
    ];
    const report = runSecurityRange(attacksOnly, ['none']);
    // 誤検知は 0 —— **測っていないので 0 なのであって、達成ではない。**
    expect(report.falsePositives).toBe(0);
    expect(report.benignChecked).toBe(0);
    // 攻撃側は測れている (片方だけが未測定という状態が数で出る)。
    expect(report.attacksChecked).toBe(2);
  });

  it('★ 対照: 既定コーパスは無害ケースを実際に評価している (床が邪魔をしない)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    const benign = DEFAULT_RANGE_CORPUS.filter((c) => c.category === 'benign');
    expect(benign.length).toBeGreaterThan(0);
    expect(report.benignChecked).toBe(benign.length * DEFAULT_EVASIONS.length);
    // ここが緑の根拠 —— **評価したうえで** 0 件。
    expect(report.falsePositives).toBe(0);
  });

  it('★ 評価数は集計の分母と一致する (別々に数えていない)', () => {
    const report = runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS);
    // 攻撃側: ラウンドごとの attacks の合計 = overallDetectionRate の分母。
    const summed = report.rounds.reduce((acc, r) => acc + r.attacks, 0);
    expect(report.attacksChecked).toBe(summed);
    // 無害側: ラウンド数 × 無害件数 = falsePositives の分母
    // (無害ケースは回避を適用せず毎ラウンド同じ判定を繰り返すため、
    //  誤検知の累計と同じ数え方でなければ率が合わない)。
    expect(report.benignChecked % report.rounds.length).toBe(0);
    expect(report.benignChecked / report.rounds.length).toBe(
      DEFAULT_RANGE_CORPUS.filter((c) => c.category === 'benign').length,
    );
  });

  it('★ 回避ラウンドを増やせば無害の評価数も増える (ラウンド合計であること)', () => {
    const corpus: RangeCase[] = [{ id: 'b', payload: 'hello world', category: 'benign', note: '' }];
    expect(runSecurityRange(corpus, ['none']).benignChecked).toBe(1);
    expect(runSecurityRange(corpus, ['none', 'case', 'whitespace']).benignChecked).toBe(3);
    // 回避ラウンドが 0 本なら何も測っていない。
    expect(runSecurityRange(corpus, []).benignChecked).toBe(0);
  });
});
