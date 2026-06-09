/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMOTIONS_STORE_KEY,
  EMOTION_KEYS,
  ANALYZE_SYSTEM,
  loadStore,
  logMood,
  clearHistory,
  extractJson,
  normalizeAnalysis,
  recordAnalysis,
  buildEmotionsSnapshot,
} from '../emotionsWeb';

beforeEach(() => localStorage.clear());

const NOW = Date.UTC(2026, 0, 31, 9, 0, 0);

describe('constants', () => {
  it('uses the stable localStorage key', () => {
    expect(EMOTIONS_STORE_KEY).toBe('emotions.store');
  });
  it('the analyze system prompt asks for valid JSON', () => {
    // プロンプト全体を空文字にする StringLiteral mutant を、契約上の語で kill。
    expect(ANALYZE_SYSTEM).toContain('valid JSON');
  });
});

describe('loadStore', () => {
  it('falls back to empty arrays when stored fields are not arrays', () => {
    // moods/analyses が配列でないとき `[]` フォールバックを使う。`[]` を
    // ["Stryker was here"] にする ArrayDeclaration mutant を kill。
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: 'nope', analyses: 42 }));
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
  });
});

describe('logMood', () => {
  it('records a mood and persists it', () => {
    const r = logMood({ score: 4, note: 'good', date: '2026-01-31' });
    expect(r).toEqual({ date: '2026-01-31', score: 4 });
    expect(loadStore().moods).toEqual([{ date: '2026-01-31', score: 4, note: 'good' }]);
  });
  it('replaces the same-day entry', () => {
    logMood({ score: 2, date: '2026-01-31' });
    logMood({ score: 5, date: '2026-01-31' });
    const moods = loadStore().moods;
    expect(moods).toHaveLength(1);
    expect(moods[0]!.score).toBe(5);
  });
  it('rounds and validates the score range', () => {
    expect(logMood({ score: 3.4, date: '2026-01-31' }).score).toBe(3);
    expect(() => logMood({ score: 0 })).toThrow(/between 1 and 5/);
    expect(() => logMood({ score: 6 })).toThrow(/between 1 and 5/);
    expect(() => logMood({ score: 'x' })).toThrow(/between 1 and 5/);
  });
  it('accepts the lower boundary score 1 (< strict, not <=)', () => {
    // finalScore<1 を <=1 にする mutant は score===1 を弾くため、許容で kill。
    expect(logMood({ score: 1, date: '2026-01-31' }).score).toBe(1);
  });
  it('defaults an omitted note to an empty string', () => {
    // String(note ?? '') の '' を別文字列にする mutant を、note 既定 '' の確認で kill。
    logMood({ score: 3, date: '2026-01-31' });
    expect(loadStore().moods[0]!.note).toBe('');
  });
  it('defaults the date to today when omitted/invalid', () => {
    const r = logMood({ score: 3 }, NOW);
    expect(r.date).toBe('2026-01-31');
  });
  it('zero-pads a single-digit month/day in today\'s date', () => {
    // padStart(2,'0') の '0' を '' にする mutant は 1 桁日を詰めず '2026-01-5' になるため、
    // 1 桁の日を持つ now で kill。
    expect(logMood({ score: 3 }, Date.UTC(2026, 0, 5, 9, 0, 0)).date).toBe('2026-01-05');
  });
  it('a malformed string date falls back to today (ternary condition load-bearing)', () => {
    // 日付三項の条件を true 固定する mutant は不正文字列をそのまま採用するため kill。
    expect(logMood({ score: 3, date: 'zzzz-zz-zz' }, NOW).date).toBe('2026-01-31');
  });
  it('rejects a non-string date that stringifies to a date pattern (typeof guard)', () => {
    // `typeof date === 'string'` を外すと regex.test が引数を String 強制するため、
    // 配列 ['2026-01-31'] が "2026-01-31" として通ってしまう。型ガードが弾くことを確認。
    expect(logMood({ score: 3, date: ['2026-01-31'] }, NOW).date).toBe('2026-01-31');
  });
  it('falls back to today for a malformed date string', () => {
    expect(logMood({ score: 3, date: '2026-1-1' }, NOW).date).toBe('2026-01-31');
    expect(logMood({ score: 3, date: 'not-a-date' }, NOW).date).toBe('2026-01-31');
    expect(logMood({ score: 3, date: 12345 }, NOW).date).toBe('2026-01-31');
  });
  it('rejects a date with leading/trailing junk (regex ^ and $ anchors)', () => {
    // アンカーを外す Regex mutant は部分一致を許し前後ゴミ付きを保持してしまうため、
    // どちらも今日にフォールバックすることを確認して kill。
    expect(logMood({ score: 3, date: 'x2026-01-31' }, NOW).date).toBe('2026-01-31'); // ^ アンカー
    expect(logMood({ score: 3, date: '2026-01-31x' }, NOW).date).toBe('2026-01-31'); // $ アンカー
  });
  it('keeps a well-formed explicit date verbatim', () => {
    expect(logMood({ score: 3, date: '2025-12-25' }, NOW).date).toBe('2025-12-25');
  });
  it('keeps moods sorted by date', () => {
    logMood({ score: 3, date: '2026-02-02' });
    logMood({ score: 3, date: '2026-01-01' });
    expect(loadStore().moods.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-02']);
  });
  it('caps stored moods at the maximum, dropping the oldest', () => {
    // 370 distinct days → 上限 365 に切り詰められ、最古が落ちる。
    for (let i = 0; i < 370; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      logMood({ score: 3, date: d });
    }
    const moods = loadStore().moods;
    expect(moods).toHaveLength(365);
    expect(moods[0]!.date).toBe('2025-01-06'); // 最初の5日が落ちる
  });
});

describe('clearHistory', () => {
  it('clears moods by default and reports prior counts', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    const before = clearHistory(undefined);
    expect(before.moods).toBe(1);
    expect(loadStore().moods).toEqual([]);
    // default kind clears moods only, analyses remain
    expect(loadStore().analyses).toHaveLength(1);
  });
  it('clears all when kind=all', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    clearHistory('all');
    const s = loadStore();
    expect(s.moods).toEqual([]);
    expect(s.analyses).toEqual([]);
  });
  it('clears only moods when kind=moods (analyses kept)', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    clearHistory('moods');
    const s = loadStore();
    expect(s.moods).toEqual([]);
    expect(s.analyses).toHaveLength(1);
  });
  it('clears only analyses when kind=analyses (moods kept)', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    clearHistory('analyses');
    const s = loadStore();
    expect(s.moods).toHaveLength(1);
    expect(s.analyses).toEqual([]);
  });
});

describe('extractJson', () => {
  it('strips json code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it('strips a fence with no language tag (json is optional)', () => {
    // `(?:json)?` の `?` を外す mutant は json 無しフェンスを認識できず未加工で返すため kill。
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('tolerates whitespace between the fence tag and the newline', () => {
    // `\s*` を `\S*` にする mutant は tag 後の空白に一致できず未加工で返すため kill。
    expect(extractJson('```json   \n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('captures multi-line content inside the fence', () => {
    // `[\s\S]` を `[\S\S]` にする mutant は内部の改行を跨げず未加工で返すため kill。
    expect(extractJson('```json\n{\n"a":1\n}\n```')).toBe('{\n"a":1\n}');
  });
  it('trims whitespace around the captured fence body', () => {
    // 取り出した本文の .trim() を外す mutant を、前後空白付き本文で kill。
    expect(extractJson('```json\n   {"a":1}   \n```')).toBe('{"a":1}');
  });
  it('trims a non-fenced string too', () => {
    // フェンス無し経路の text.trim() を外す mutant を、前後空白付き入力で kill。
    expect(extractJson('   {"a":1}   ')).toBe('{"a":1}');
  });
  it('returns plain text unchanged when there is no fence (guard load-bearing)', () => {
    // `if (fence && fence[1] != null)` を true 固定する mutant は fence=null で
    // null[1] を参照して例外になるため、非フェンス入力で kill。
    expect(extractJson('hello world')).toBe('hello world');
  });
});

describe('normalizeAnalysis', () => {
  it('clamps scores to [0,1] and fills missing keys with 0', () => {
    const n = normalizeAnalysis({ scores: { joy: 2, sadness: -1 }, sentiment: 'positive', dominant: 'joy' });
    expect(n.scores.joy).toBe(1);
    expect(n.scores.sadness).toBe(0);
    for (const k of EMOTION_KEYS) expect(typeof n.scores[k]).toBe('number');
    expect(n.sentiment).toBe('positive');
    expect(n.dominant).toBe('joy');
  });
  it('defaults sentiment to neutral and derives dominant when absent', () => {
    const n = normalizeAnalysis({ scores: { anger: 0.9 } });
    expect(n.sentiment).toBe('neutral');
    expect(n.dominant).toBe('anger');
  });
  it('returns dominant=mixed when all scores are zero', () => {
    expect(normalizeAnalysis({}).dominant).toBe('mixed');
  });
  it('keeps an explicit negative sentiment', () => {
    expect(normalizeAnalysis({ sentiment: 'negative' }).sentiment).toBe('negative');
  });
  it('coerces an unknown sentiment to neutral', () => {
    expect(normalizeAnalysis({ sentiment: 'angry' }).sentiment).toBe('neutral');
  });
  it('honors an explicit valid dominant (incl. mixed) over derivation', () => {
    // scores だけなら joy が選ばれるが、明示の有効値が優先される。
    expect(normalizeAnalysis({ scores: { joy: 0.9 }, dominant: 'sadness' }).dominant).toBe('sadness');
    expect(normalizeAnalysis({ scores: { joy: 0.9 }, dominant: 'mixed' }).dominant).toBe('mixed');
  });
  it('ignores an invalid dominant and derives from scores', () => {
    expect(normalizeAnalysis({ scores: { fear: 0.7 }, dominant: 'love' }).dominant).toBe('fear');
  });
  it('derives dominant from scores when dominant is absent (condition load-bearing)', () => {
    // dominant 三項の条件を true 固定する mutant は欠落時に undefined を採用するため、
    // scores 由来の導出を確認して kill。
    expect(normalizeAnalysis({ scores: { fear: 0.7 } }).dominant).toBe('fear');
  });
  it('breaks dominant ties by emotion order (strict >)', () => {
    expect(normalizeAnalysis({ scores: { joy: 0.5, sadness: 0.5 } }).dominant).toBe('joy');
  });
});

describe('recordAnalysis + buildEmotionsSnapshot', () => {
  it('prepends the newest analysis and reflects in the snapshot', () => {
    recordAnalysis('first text', 'Slack', normalizeAnalysis({ scores: { joy: 0.8 }, sentiment: 'positive' }), NOW);
    const snap = buildEmotionsSnapshot(true);
    expect(snap.keyConfigured).toBe(true);
    expect(snap.analyses).toHaveLength(1);
    expect(snap.analyses[0]!.excerpt).toContain('[Slack]');
    expect(snap.analyses[0]!.sentiment).toBe('positive');
  });
  it('empty snapshot when nothing stored', () => {
    const snap = buildEmotionsSnapshot(false);
    expect(snap.moods).toEqual([]);
    expect(snap.analyses).toEqual([]);
    expect(snap.keyConfigured).toBe(false);
  });
  it('ignores corrupt storage', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, '{bad');
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
  });
  it('caps stored analyses at the maximum, keeping the newest', () => {
    for (let i = 0; i < 55; i++) recordAnalysis(`t${i}`, undefined, normalizeAnalysis({}), NOW + i);
    const analyses = loadStore().analyses;
    expect(analyses).toHaveLength(50);
    expect(analyses[0]!.excerpt).toBe('t54'); // 最新が先頭
  });
  it('truncates a long excerpt to 80 characters (+ optional source prefix)', () => {
    // text.slice(0,80) を外す mutant は全文を保持するため、長文で切り詰めを kill。
    const entry = recordAnalysis('x'.repeat(100), undefined, normalizeAnalysis({}), NOW);
    expect(entry.excerpt).toBe('x'.repeat(80));
  });
  it('snapshot keeps only the last 30 moods and first 10 analyses', () => {
    // buildEmotionsSnapshot の slice(-30) / slice(0,10) を外す・符号反転する mutant を、
    // 上限超えの件数で kill。
    for (let i = 0; i < 35; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      logMood({ score: 3, date: d });
    }
    for (let i = 0; i < 12; i++) recordAnalysis(`a${i}`, undefined, normalizeAnalysis({}), NOW + i);
    const snap = buildEmotionsSnapshot(true);
    expect(snap.moods).toHaveLength(30);
    expect(snap.analyses).toHaveLength(10);
    // last-30: 最古5日 (01-01..01-05) が落ち 01-06 始まり。
    expect(snap.moods[0]!.date).toBe('2025-01-06');
  });
});
