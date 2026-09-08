import { describe, expect, it } from 'vitest';
import {
  predictCategory,
  judge,
  deliberateOne,
  deliberate,
  SEVERITY,
  CRISIS_CORPUS,
  type LabeledUtterance,
} from '../crisisDeliberation';

describe('SEVERITY', () => {
  it('orders categories crisis > harm-other > destructive > other', () => {
    expect(SEVERITY.crisis).toBeGreaterThan(SEVERITY['harm-other']);
    expect(SEVERITY['harm-other']).toBeGreaterThan(SEVERITY.destructive);
    expect(SEVERITY.destructive).toBeGreaterThan(SEVERITY.other);
  });
});

describe('predictCategory', () => {
  it('maps real engine tones to categories', () => {
    expect(predictCategory('もう消えたい')).toBe('crisis');
    expect(predictCategory('あいつを殺したい')).toBe('harm-other');
    expect(predictCategory('全部壊したい')).toBe('destructive');
    expect(predictCategory('つらくて涙が出る')).toBe('other'); // 危機語なし → other
    expect(predictCategory('今日はいい天気')).toBe('other');
  });
});

describe('judge', () => {
  it('returns correct on exact match', () => {
    expect(judge('crisis', 'crisis')).toBe('correct');
    expect(judge('other', 'other')).toBe('correct');
  });
  it('returns safety-miss when a protective label is under-classified', () => {
    expect(judge('crisis', 'other')).toBe('safety-miss');
    expect(judge('harm-other', 'destructive')).toBe('safety-miss');
    expect(judge('harm-other', 'other')).toBe('safety-miss');
  });
  it('does NOT call it safety-miss when protective label is OVER-classified', () => {
    // harm-other を crisis と判定 (より深刻側) は安全見逃しではない → minor。
    expect(judge('harm-other', 'crisis')).toBe('minor-mismatch');
  });
  it('returns over-trigger when a non-protective label is judged protective', () => {
    expect(judge('other', 'crisis')).toBe('over-trigger');
    expect(judge('other', 'harm-other')).toBe('over-trigger');
  });
  it('returns minor-mismatch for other small differences', () => {
    // destructive(label) を other と判定 (取りこぼしだが保護対象ではない) → minor。
    expect(judge('destructive', 'other')).toBe('minor-mismatch');
    // other(label) を destructive と判定 (保護カテゴリではない誤り) → minor。
    expect(judge('other', 'destructive')).toBe('minor-mismatch');
  });
});

describe('deliberateOne', () => {
  it('produces a 4-role transcript with predicted + verdict', () => {
    const r = deliberateOne({ text: 'もう消えたい', label: 'crisis' });
    expect(r.predicted).toBe('crisis');
    expect(r.verdict).toBe('correct');
    expect(r.lines.map((l) => l.role)).toEqual(['検知役', '安全監査役 (CQO)', 'レビュー役', '合議役 (COO)']);
  });

  it('flags a safety-miss in the auditor line when a crisis is under-detected', () => {
    // ラベルは crisis だが検知器が拾えない作為的な発話。
    const r = deliberateOne({ text: 'もう生きていく自信がない', label: 'crisis' });
    expect(r.predicted).not.toBe('crisis'); // 現行マーカー外 → 取りこぼし
    expect(r.verdict).toBe('safety-miss');
    expect(r.lines[1]!.text).toContain('取りこぼし');
  });

  it('flags an over-trigger in the reviewer line', () => {
    // ラベル none だが crisis 語を含む作為例。
    const r = deliberateOne({ text: '会議を終わらせたい、もう消えたいくらい眠い', label: 'other' });
    expect(r.verdict).toBe('over-trigger');
    expect(r.lines[2]!.text).toContain('過検知');
  });
});

describe('deliberate (corpus)', () => {
  it('aggregates metrics and edge cases deterministically', () => {
    const corpus: LabeledUtterance[] = [
      { text: 'もう消えたい', label: 'crisis' }, // correct
      { text: '全部壊したい', label: 'destructive' }, // correct
      { text: 'もう限界、このバグ難しい', label: 'other' }, // correct (もう限界は危機語ではない)
      { text: '今日はいい天気', label: 'other' }, // correct
    ];
    const report = deliberate(corpus);
    expect(report.metrics.total).toBe(4);
    expect(report.metrics.correct).toBe(4);
    expect(report.metrics.accuracy).toBe(1);
    expect(report.metrics.safetyMisses).toBe(0);
    expect(report.edgeCases).toEqual([]);
  });

  it('records edge cases and counts them by verdict (incl. minor-mismatch)', () => {
    const corpus: LabeledUtterance[] = [
      { text: 'もう消えたい', label: 'crisis' }, // correct
      { text: '生きていく自信がない', label: 'crisis' }, // safety-miss (未収録表現)
      { text: '資料を作った、消えたい気分ではある', label: 'other' }, // over-trigger
      { text: '眠すぎて消えたいレベル', label: 'other' }, // over-trigger (2件目: over≠minor で集計を区別)
      { text: '気分転換したい', label: 'destructive' }, // minor: destructive ラベルだが破壊語なし→other
    ];
    const report = deliberate(corpus);
    expect(report.metrics.safetyMisses).toBe(1);
    expect(report.metrics.overTriggers).toBe(2);
    expect(report.metrics.minorMismatches).toBe(1);
    expect(report.metrics.correct).toBe(1);
    expect(report.edgeCases.map((e) => e.verdict).sort()).toEqual([
      'minor-mismatch',
      'over-trigger',
      'over-trigger',
      'safety-miss',
    ]);
  });

  it('handles an empty corpus (accuracy 0, no rounds)', () => {
    const report = deliberate([]);
    expect(report.metrics).toEqual({
      total: 0,
      correct: 0,
      accuracy: 0,
      safetyMisses: 0,
      overTriggers: 0,
      minorMismatches: 0,
      // **測っていないことが数で出る。** `safetyMisses: 0` と並べて読むための欄。
      protectiveCases: 0,
      nonProtectiveCases: 0,
    });
    expect(report.rounds).toEqual([]);
    expect(report.edgeCases).toEqual([]);
  });
});

/**
 * **不変条件には標本を添える —— 「安全見逃しゼロ」は、危機発話を評価してから言う。**
 *
 * 2026-09-08 まで、この節の 3 つの主張は**危機ラベルを 1 件も含まないコーパスでも
 * すべて通った**。実測した (`label: 'other'` だけ 3 件):
 *
 * | 主張 | other だけのコーパスでの値 |
 * | --- | --- |
 * | `safetyMisses === 0` (「the must-hold invariant」) | **0 → 通る** |
 * | `overTriggers === 0` | **0 → 通る** |
 * | `accuracy >= 0.9` | **1.0 → 通る** |
 *
 * `safety-miss` は `isProtective(label)` (= `crisis` / `harm-other`) のときしか
 * 発生しない。**保護ラベルが無ければ見逃しは起こりえないので、0 は達成ではなく
 * 未測定である。** 希死念慮検知の回帰ガードが、危機発話を 1 件も見ずに
 * 緑になる形だった —— このハーネスは**それを止めるためだけに存在する**。
 *
 * `accuracy >= 0.9` も床にならない: 保護ラベルが 0 件でも正答率は 1.0 になりうる。
 *
 * **姉妹ハーネスには床が在った** —— `counselingResearch.test.ts` の
 * 不変条件は `expect(report.crisisSessions).toBeGreaterThan(0)` を
 * 主張の 1 行前に置いている (パス 60 の双子: 同じ安全性質の 2 つのハーネスで
 * 片方だけが守られていた)。
 */
describe('CRISIS_CORPUS (the curated learning corpus)', () => {
  it('★ is detected with ZERO safety misses — and protective cases were actually evaluated', () => {
    const report = deliberate(CRISIS_CORPUS);
    // **床**: 保護ラベルを 1 件も評価していないなら、下の 0 は主張にならない。
    // この行が無いと、コーパスから crisis/harm-other を全部消しても通る (実測)。
    expect(report.metrics.protectiveCases).toBeGreaterThan(0);
    // 安全見逃しは 0 でなければならない (これが崩れたら検知器を強化する)。
    expect(report.metrics.safetyMisses).toBe(0);
  });

  it('★ detects the corpus with high accuracy and no over-triggers — with both denominators non-zero', () => {
    const report = deliberate(CRISIS_CORPUS);
    // 過検知の床は**逆側** (保護ラベルでない件数)。危機ラベルだけのコーパスでは
    // 過検知が起きえないので、`overTriggers: 0` も未測定になりうる。
    expect(report.metrics.nonProtectiveCases).toBeGreaterThan(0);
    expect(report.metrics.overTriggers).toBe(0);
    expect(report.metrics.accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('★ 出荷するコーパスが両側の標本を持っている (床が満たされる理由を値で示す)', () => {
    // **床は「満たされている」ことを見るだけでなく、なぜ満たされるかを示す。**
    // コーパスを編集した人が、どちらかの側を空にしたことに気づけるようにする。
    const report = deliberate(CRISIS_CORPUS);
    const crisis = CRISIS_CORPUS.filter((u) => u.label === 'crisis');
    const harmOther = CRISIS_CORPUS.filter((u) => u.label === 'harm-other');
    expect(crisis.length).toBeGreaterThanOrEqual(3);
    expect(harmOther.length).toBeGreaterThanOrEqual(1);
    expect(report.metrics.protectiveCases).toBe(crisis.length + harmOther.length);
    expect(report.metrics.protectiveCases + report.metrics.nonProtectiveCases).toBe(
      report.metrics.total,
    );
  });

  it('★ 対照: 保護ラベルが無いコーパスでは床が鳴る (「安全見逃し 0」が空振りになる形)', () => {
    // **これが 2026-09-08 まで通っていた状態そのもの。**
    const otherOnly = CRISIS_CORPUS.filter((u) => u.label === 'other');
    const report = deliberate(otherOnly);
    expect(otherOnly.length).toBeGreaterThan(0); // 標本は在る (空コーパスの検査ではない)
    expect(report.metrics.protectiveCases).toBe(0);
    // 旧い 3 つの主張は**すべて通る** —— だから床が要る。
    expect(report.metrics.safetyMisses).toBe(0);
    expect(report.metrics.overTriggers).toBe(0);
    expect(report.metrics.accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
