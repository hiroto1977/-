import { describe, expect, it } from 'vitest';
import {
  actionReducer,
  adviceError,
  adviceResult,
  INITIAL_ACTION_STATE,
  recordError,
  recordFeedback,
  type ActionState,
} from '../serviceActionMachine';
import type { ServiceAdvisorResponse } from '../../../shared/advisorTypes';

/*
 * **2 つの操作は、互いの結果を消さない** (2026-09-13 · パス 192)。
 *
 * 2026-09-13 までこの reducer は `phase` と `result` を 1 つずつ持ち、記録と提案が
 * 同じ枠を取り合っていた。この検査ファイルはその形を**正しい振る舞いとして留めて
 * いた** —— 「never holds two results at once」「advise/start clears prior feedback」
 * 「advice replaces a prior feedback result」「record/start while advising … clears
 * advice」の 4 本である。jsdom で実際に押して測ると、それは利用者から見て
 * 「記録の確認が黙って消える」「読んでいる提案が消える」だった (パネルの注記に実測)。
 *
 * 主張を直した: **枠は操作ごとに 1 つ。自分の枠だけを書き換える。**
 * 1 つの操作の中では今も不整合が起きない (提案の error と古い提案は同じ枠)。
 */

const advice: ServiceAdvisorResponse = {
  recommendations: [{ title: 't', rationale: 'r' }],
  disclaimer: 'd',
  notForRealMoney: true,
  basis: 'b',
  phase: 'rules',
};

describe('actionReducer', () => {
  it('starts with both slots empty', () => {
    expect(INITIAL_ACTION_STATE).toEqual({ record: { kind: 'none' }, advice: { kind: 'none' } });
    expect(recordFeedback(INITIAL_ACTION_STATE)).toBeNull();
    expect(recordError(INITIAL_ACTION_STATE)).toBeNull();
    expect(adviceResult(INITIAL_ACTION_STATE)).toBeNull();
    expect(adviceError(INITIAL_ACTION_STATE)).toBeNull();
  });

  it('record/start clears only the record slot', () => {
    const prev: ActionState = { record: { kind: 'error', text: 'boom' }, advice: { kind: 'advice', advice } };
    const next = actionReducer(prev, { type: 'record/start' });
    expect(recordError(next)).toBeNull();
    expect(adviceResult(next)).toEqual(advice);
  });

  it('record/success puts feedback in the record slot', () => {
    const next = actionReducer(INITIAL_ACTION_STATE, { type: 'record/success', text: 'ok' });
    expect(recordFeedback(next)).toBe('ok');
    expect(recordError(next)).toBeNull();
  });

  it('record/error puts the text in the record slot', () => {
    const next = actionReducer(INITIAL_ACTION_STATE, { type: 'record/error', text: 'failed' });
    expect(recordError(next)).toBe('failed');
    expect(recordFeedback(next)).toBeNull();
  });

  it('advise/start clears only the advice slot', () => {
    const prev: ActionState = { record: { kind: 'feedback', text: 'saved' }, advice: { kind: 'advice', advice } };
    const next = actionReducer(prev, { type: 'advise/start' });
    expect(adviceResult(next)).toBeNull();
    expect(recordFeedback(next)).toBe('saved');
  });

  it('advise/success carries the advice', () => {
    const next = actionReducer(INITIAL_ACTION_STATE, { type: 'advise/success', advice });
    expect(adviceResult(next)).toEqual(advice);
    expect(adviceError(next)).toBeNull();
  });

  it('advise/error puts the text in the advice slot', () => {
    const next = actionReducer(INITIAL_ACTION_STATE, { type: 'advise/error', text: 'nope' });
    expect(adviceError(next)).toBe('nope');
    expect(adviceResult(next)).toBeNull();
  });

  /*
   * ★ ここが 2026-09-13 に主張を反転させた 4 本。**以前はこの逆を求めていた。**
   */
  it('★ 提案が成功しても、記録の確認は残る (後の操作が前の結果を消さない)', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'record/success', text: 'saved' });
    s = actionReducer(s, { type: 'advise/success', advice });
    expect(recordFeedback(s), '記録の確認が消えました').toBe('saved');
    expect(adviceResult(s)).toEqual(advice);
  });

  it('★ 記録が成功しても、読んでいる提案は残る', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'advise/success', advice });
    s = actionReducer(s, { type: 'record/success', text: 'saved' });
    expect(adviceResult(s), '提案が消えました').toEqual(advice);
    expect(recordFeedback(s)).toBe('saved');
  });

  it('★ 記録が失敗しても、読んでいる提案は残る', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'advise/success', advice });
    s = actionReducer(s, { type: 'record/error', text: '保存に失敗' });
    expect(adviceResult(s), '提案が消えました').toEqual(advice);
    expect(recordError(s)).toBe('保存に失敗');
  });

  it('★ 提案が失敗しても、記録の確認は残る', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'record/success', text: 'saved' });
    s = actionReducer(s, { type: 'advise/error', text: '取得に失敗' });
    expect(recordFeedback(s), '記録の確認が消えました').toBe('saved');
    expect(adviceError(s)).toBe('取得に失敗');
  });

  /*
   * **1 つの枠の中では、今も不整合が起きない。** これは PR #4 が入れた性質で、
   * 枠を 2 つに割っても保たれていること (提案の失敗が古い提案を残さない)。
   */
  it('同じ枠の中では 2 つの結果が両立しない (提案の失敗は古い提案を消す)', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'advise/success', advice });
    s = actionReducer(s, { type: 'advise/error', text: 'err' });
    expect(adviceResult(s)).toBeNull();
    expect(adviceError(s)).toBe('err');
  });

  it('同じ枠の中では 2 つの結果が両立しない (記録の失敗は確認を消す)', () => {
    let s = actionReducer(INITIAL_ACTION_STATE, { type: 'record/success', text: 'saved' });
    s = actionReducer(s, { type: 'record/error', text: 'err' });
    expect(recordFeedback(s)).toBeNull();
    expect(recordError(s)).toBe('err');
  });

  it('a later error replaces an earlier error text', () => {
    let s: ActionState = { record: { kind: 'error', text: 'err1' }, advice: { kind: 'none' } };
    s = actionReducer(s, { type: 'record/error', text: 'err2' });
    expect(recordError(s)).toBe('err2');
  });
});
