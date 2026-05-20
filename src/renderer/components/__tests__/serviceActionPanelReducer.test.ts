import { describe, expect, it } from 'vitest';
import type { ServiceAdvisorResponse } from '../../../shared/advisorTypes';
import {
  INITIAL_PANEL_STATE,
  isBusy,
  panelReducer,
  type PanelAction,
  type PanelState,
} from '../serviceActionPanelReducer';

const SAMPLE_ADVICE: ServiceAdvisorResponse = {
  recommendations: [{ title: 'test', rationale: 'because' }],
  disclaimer: 'not investment advice',
  notForRealMoney: true,
  phase: 'stub',
};

function applyAll(initial: PanelState, actions: PanelAction[]): PanelState {
  return actions.reduce(panelReducer, initial);
}

describe('panelReducer — initial state', () => {
  it('starts idle with empty note + amount', () => {
    expect(INITIAL_PANEL_STATE).toEqual({
      note: '',
      amount: '',
      status: { kind: 'idle' },
    });
  });
});

describe('panelReducer — input changes', () => {
  it('updates note while preserving amount + status', () => {
    const s = panelReducer(INITIAL_PANEL_STATE, { type: 'NOTE_CHANGED', value: 'hello' });
    expect(s.note).toBe('hello');
    expect(s.amount).toBe('');
    expect(s.status.kind).toBe('idle');
  });

  it('updates amount while preserving note + status', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'NOTE_CHANGED', value: 'memo' },
      { type: 'AMOUNT_CHANGED', value: '1000' },
    ]);
    expect(s.note).toBe('memo');
    expect(s.amount).toBe('1000');
    expect(s.status.kind).toBe('idle');
  });
});

describe('panelReducer — record flow', () => {
  it('RECORD_START transitions status to recording', () => {
    const s = panelReducer({ ...INITIAL_PANEL_STATE, note: 'x' }, { type: 'RECORD_START' });
    expect(s.status).toEqual({ kind: 'recording' });
    expect(s.note).toBe('x');
  });

  it('RECORD_SUCCESS clears note + amount and shows recorded status', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'NOTE_CHANGED', value: 'memo' },
      { type: 'AMOUNT_CHANGED', value: '1000' },
      { type: 'RECORD_START' },
      { type: 'RECORD_SUCCESS', message: '✅ ok' },
    ]);
    expect(s.note).toBe('');
    expect(s.amount).toBe('');
    expect(s.status).toEqual({ kind: 'recorded', message: '✅ ok' });
  });
});

describe('panelReducer — advise flow', () => {
  it('ADVISE_START transitions status to advising', () => {
    const s = panelReducer(INITIAL_PANEL_STATE, { type: 'ADVISE_START' });
    expect(s.status).toEqual({ kind: 'advising' });
  });

  it('ADVISE_SUCCESS records the advice payload', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'ADVISE_START' },
      { type: 'ADVISE_SUCCESS', advice: SAMPLE_ADVICE },
    ]);
    expect(s.status).toEqual({ kind: 'advised', advice: SAMPLE_ADVICE });
  });

  it('does NOT clear note/amount when advising (independent of record flow)', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'NOTE_CHANGED', value: 'preserved' },
      { type: 'AMOUNT_CHANGED', value: '500' },
      { type: 'ADVISE_START' },
      { type: 'ADVISE_SUCCESS', advice: SAMPLE_ADVICE },
    ]);
    expect(s.note).toBe('preserved');
    expect(s.amount).toBe('500');
  });
});

describe('panelReducer — error flow', () => {
  it('ERROR overrides prior status while preserving inputs', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'NOTE_CHANGED', value: 'unsent' },
      { type: 'RECORD_START' },
      { type: 'ERROR', message: 'network failure' },
    ]);
    expect(s.status).toEqual({ kind: 'error', message: 'network failure' });
    expect(s.note).toBe('unsent');
  });

  it('ERROR from recorded state replaces success message', () => {
    const s = applyAll(INITIAL_PANEL_STATE, [
      { type: 'RECORD_SUCCESS', message: 'old success' },
      { type: 'ERROR', message: 'new error' },
    ]);
    expect(s.status).toEqual({ kind: 'error', message: 'new error' });
  });
});

describe('panelReducer — exclusivity invariants', () => {
  it('only one of (recorded / advised / error) can be active at a time', () => {
    const s1 = applyAll(INITIAL_PANEL_STATE, [
      { type: 'RECORD_SUCCESS', message: 'r' },
      { type: 'ADVISE_SUCCESS', advice: SAMPLE_ADVICE },
    ]);
    expect(s1.status.kind).toBe('advised');

    const s2 = applyAll(INITIAL_PANEL_STATE, [
      { type: 'ADVISE_SUCCESS', advice: SAMPLE_ADVICE },
      { type: 'RECORD_SUCCESS', message: 'r' },
    ]);
    expect(s2.status.kind).toBe('recorded');
  });
});

describe('isBusy', () => {
  it('is true for recording / advising', () => {
    expect(isBusy({ kind: 'recording' })).toBe(true);
    expect(isBusy({ kind: 'advising' })).toBe(true);
  });

  it('is false for idle / recorded / advised / error', () => {
    expect(isBusy({ kind: 'idle' })).toBe(false);
    expect(isBusy({ kind: 'recorded', message: 'x' })).toBe(false);
    expect(isBusy({ kind: 'advised', advice: SAMPLE_ADVICE })).toBe(false);
    expect(isBusy({ kind: 'error', message: 'y' })).toBe(false);
  });
});
