import { describe, expect, it } from 'vitest';
import {
  actionReducer,
  adviceResult,
  errorText,
  feedbackText,
  INITIAL_ACTION_STATE,
  isAdvising,
  isRecording,
  type ActionState,
} from '../serviceActionMachine';
import type { ServiceAdvisorResponse } from '../../../shared/advisorTypes';

const advice: ServiceAdvisorResponse = {
  recommendations: [{ title: 't', rationale: 'r' }],
  disclaimer: 'd',
  notForRealMoney: true,
  phase: 'stub',
};

describe('actionReducer', () => {
  it('starts idle with no result', () => {
    expect(INITIAL_ACTION_STATE).toEqual({ phase: 'idle', result: { kind: 'none' } });
  });

  it('record/start clears prior result and enters recording', () => {
    const prev: ActionState = { phase: 'idle', result: { kind: 'error', text: 'boom' } };
    const next = actionReducer(prev, { type: 'record/start' });
    expect(next).toEqual({ phase: 'recording', result: { kind: 'none' } });
    expect(isRecording(next)).toBe(true);
  });

  it('record/success returns to idle with feedback', () => {
    const next = actionReducer(
      { phase: 'recording', result: { kind: 'none' } },
      { type: 'record/success', text: 'ok' },
    );
    expect(next.phase).toBe('idle');
    expect(feedbackText(next)).toBe('ok');
    expect(errorText(next)).toBeNull();
  });

  it('advise/start clears prior advice and enters advising', () => {
    const prev: ActionState = { phase: 'idle', result: { kind: 'advice', advice } };
    const next = actionReducer(prev, { type: 'advise/start' });
    expect(next).toEqual({ phase: 'advising', result: { kind: 'none' } });
    expect(isAdvising(next)).toBe(true);
    expect(adviceResult(next)).toBeNull();
  });

  it('advise/success returns to idle carrying the advice', () => {
    const next = actionReducer(
      { phase: 'advising', result: { kind: 'none' } },
      { type: 'advise/success', advice },
    );
    expect(next.phase).toBe('idle');
    expect(adviceResult(next)).toEqual(advice);
  });

  it('error returns to idle with error text and no feedback/advice', () => {
    const next = actionReducer(
      { phase: 'recording', result: { kind: 'none' } },
      { type: 'error', text: 'failed' },
    );
    expect(next.phase).toBe('idle');
    expect(errorText(next)).toBe('failed');
    expect(feedbackText(next)).toBeNull();
    expect(adviceResult(next)).toBeNull();
  });

  it('never holds two results at once (feedback then error replaces)', () => {
    let s = INITIAL_ACTION_STATE;
    s = actionReducer(s, { type: 'record/success', text: 'saved' });
    expect(feedbackText(s)).toBe('saved');
    s = actionReducer(s, { type: 'error', text: 'later error' });
    expect(feedbackText(s)).toBeNull();
    expect(errorText(s)).toBe('later error');
  });
});
