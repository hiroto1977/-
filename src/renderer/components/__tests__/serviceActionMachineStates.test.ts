/**
 * **`actionReducer` の各イベントは、次の状態の全体を値ごとに決める。** (パス 502)
 *
 * 既存の検査は結果を**セレクタ越しに**読む (`recordError(next)` が `null` か、など)。
 * セレクタは「自分が読む種類でなければ `null`」としか言わないので、
 *
 * - `record/start` が枠を `{ kind: 'none' }` ではなく `{}` にする / `record/success` へ
 *   落ちて `{ kind: 'feedback', text: undefined }` を入れる
 * - `advise/start` が同じことをする
 *
 * 形が、どれもセレクタの目には「エラーでも提案でもない = `null`」で**見分けがつかない**。
 * 画面は「進行中の操作の枠が空」と「不正な形の枠」を見分けないので、ここで全体を値ごとに留める。
 *
 * 期待値は遷移表として手で書く (reducer の式の写しではない)。`toStrictEqual` を使うのは、
 * `undefined` の欄や余計な欄が混ざった状態を通さないため。
 */
import { describe, expect, it } from 'vitest';
import { actionReducer, INITIAL_ACTION_STATE, type ActionEvent, type ActionState } from '../serviceActionMachine';
import type { ServiceAdvisorResponse } from '../../../shared/advisorTypes';

const advice: ServiceAdvisorResponse = {
  recommendations: [{ title: 't', rationale: 'r' }],
  disclaimer: 'd',
  notForRealMoney: true,
  basis: 'b',
  phase: 'rules',
};

const none = { kind: 'none' } as const;
const recFeedback = { kind: 'feedback', text: 'saved' } as const;
const recError = { kind: 'error', text: 'boom' } as const;
const advAdvice = { kind: 'advice', advice } as const;
const advError = { kind: 'error', text: 'nope' } as const;

interface Row {
  readonly name: string;
  readonly prev: ActionState;
  readonly event: ActionEvent;
  readonly next: ActionState;
}

const ROWS: readonly Row[] = [
  // --- 開始イベントは自分の枠を空 ({ kind: 'none' }) にし、隣の枠には触れない ---
  {
    name: 'record/start — 記録の失敗を消して空にする (提案はそのまま)',
    prev: { record: recError, advice: advAdvice },
    event: { type: 'record/start' },
    next: { record: none, advice: advAdvice },
  },
  {
    name: 'record/start — 記録の確認を消して空にする',
    prev: { record: recFeedback, advice: advError },
    event: { type: 'record/start' },
    next: { record: none, advice: advError },
  },
  {
    name: 'record/start — すでに空なら空のまま',
    prev: INITIAL_ACTION_STATE,
    event: { type: 'record/start' },
    next: { record: none, advice: none },
  },
  {
    name: 'advise/start — 提案を消して空にする (記録の確認はそのまま)',
    prev: { record: recFeedback, advice: advAdvice },
    event: { type: 'advise/start' },
    next: { record: recFeedback, advice: none },
  },
  {
    name: 'advise/start — 提案の失敗を消して空にする',
    prev: { record: recError, advice: advError },
    event: { type: 'advise/start' },
    next: { record: recError, advice: none },
  },
  {
    name: 'advise/start — すでに空なら空のまま',
    prev: INITIAL_ACTION_STATE,
    event: { type: 'advise/start' },
    next: { record: none, advice: none },
  },
  // --- 結果のイベントは自分の枠へ結果を入れ、隣の枠には触れない ---
  {
    name: 'record/success — 記録の枠へ確認を入れる (提案はそのまま)',
    prev: { record: recError, advice: advAdvice },
    event: { type: 'record/success', text: 'saved' },
    next: { record: recFeedback, advice: advAdvice },
  },
  {
    name: 'record/error — 記録の枠へ失敗を入れる (提案はそのまま)',
    prev: { record: recFeedback, advice: advAdvice },
    event: { type: 'record/error', text: 'boom' },
    next: { record: recError, advice: advAdvice },
  },
  {
    name: 'advise/success — 提案の枠へ提案を入れる (記録の確認はそのまま)',
    prev: { record: recFeedback, advice: advError },
    event: { type: 'advise/success', advice },
    next: { record: recFeedback, advice: advAdvice },
  },
  {
    name: 'advise/error — 提案の枠へ失敗を入れる (記録の確認はそのまま)',
    prev: { record: recFeedback, advice: advAdvice },
    event: { type: 'advise/error', text: 'nope' },
    next: { record: recFeedback, advice: advError },
  },
];

describe('actionReducer — 遷移表 (パス 502)', () => {
  it.each(ROWS)('★ $name', ({ prev, event, next }) => {
    expect(actionReducer(prev, event)).toStrictEqual(next);
  });

  it('★ 遷移は元の状態を書き換えない (新しい状態を返す)', () => {
    const prev: ActionState = { record: recError, advice: advAdvice };
    const snapshot = JSON.parse(JSON.stringify(prev)) as ActionState;
    actionReducer(prev, { type: 'record/start' });
    actionReducer(prev, { type: 'advise/start' });
    expect(prev).toStrictEqual(snapshot);
  });

  it('★ 開始イベントが空にした枠は、種類が none で、他の欄を持たない', () => {
    const s = actionReducer({ record: recFeedback, advice: advAdvice }, { type: 'record/start' });
    expect(Object.keys(s.record)).toEqual(['kind']);
    expect(s.record.kind).toBe('none');
    const t = actionReducer({ record: recFeedback, advice: advAdvice }, { type: 'advise/start' });
    expect(Object.keys(t.advice)).toEqual(['kind']);
    expect(t.advice.kind).toBe('none');
  });
});
