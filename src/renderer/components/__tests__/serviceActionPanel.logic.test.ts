import { describe, it, expect } from 'vitest';
import type { ServiceAdvisorResponse } from '../../../shared/advisorTypes';
import {
  normalizeNumericInput,
  parseAmount,
  validateNote,
  NOTE_MAX_LENGTH,
  actionPanelReducer,
  initialActionPanelState,
  canSubmitRecord,
  canSubmitAdvise,
  type ActionPanelState,
} from '../serviceActionPanel.logic';

// 制御文字はソースに生で埋め込まず String.fromCharCode で構築する。
const NUL = String.fromCharCode(0x00);
const UNIT_SEP = String.fromCharCode(0x1f);
const DEL = String.fromCharCode(0x7f);
const C1 = String.fromCharCode(0x9f);
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

describe('normalizeNumericInput', () => {
  it('全角数字を半角に変換する', () => {
    expect(normalizeNumericInput('１２３４５')).toBe('12345');
  });

  it('全角ピリオド・カンマ・ハイフンを半角化する', () => {
    expect(normalizeNumericInput('－１２．５')).toBe('-12.5');
    expect(normalizeNumericInput('１，２３４')).toBe('1234');
  });

  it('半角・全角スペースと桁区切りカンマを除去する', () => {
    expect(normalizeNumericInput('1 000')).toBe('1000');
    expect(normalizeNumericInput('1　000')).toBe('1000');
    expect(normalizeNumericInput('1,000,000')).toBe('1000000');
  });

  it('マイナス記号 (U+2212) をハイフンに変換する', () => {
    expect(normalizeNumericInput('−7')).toBe('-7');
  });

  it('既に半角の数値はそのまま返す', () => {
    expect(normalizeNumericInput('42.5')).toBe('42.5');
  });
});

describe('parseAmount', () => {
  it('空文字は金額なし (value: undefined) として成功扱い', () => {
    expect(parseAmount('')).toEqual({ ok: true, value: undefined });
  });

  it('空白のみも金額なし扱い', () => {
    expect(parseAmount('   ')).toEqual({ ok: true, value: undefined });
  });

  it('半角整数をパースする', () => {
    expect(parseAmount('1000')).toEqual({ ok: true, value: 1000 });
  });

  it('小数をパースする', () => {
    expect(parseAmount('12.5')).toEqual({ ok: true, value: 12.5 });
  });

  it('カンマ区切りをパースする', () => {
    expect(parseAmount('1,000,000')).toEqual({ ok: true, value: 1_000_000 });
  });

  it('全角数字をパースする', () => {
    expect(parseAmount('１０００')).toEqual({ ok: true, value: 1000 });
  });

  it('全角カンマ区切りをパースする', () => {
    expect(parseAmount('１，０００')).toEqual({ ok: true, value: 1000 });
  });

  it('全角小数点をパースする', () => {
    expect(parseAmount('１２．５')).toEqual({ ok: true, value: 12.5 });
  });

  it('負数 (半角ハイフン) をパースする', () => {
    expect(parseAmount('-500')).toEqual({ ok: true, value: -500 });
  });

  it('負数 (全角ハイフン) をパースする', () => {
    expect(parseAmount('－500')).toEqual({ ok: true, value: -500 });
  });

  it('スペース入りをパースする', () => {
    expect(parseAmount('1 234')).toEqual({ ok: true, value: 1234 });
  });

  it('数字を含まない文字列はエラー', () => {
    expect(parseAmount('abc')).toEqual({ ok: false, error: '金額は数値で入力してください' });
  });

  it('記号のみ (カンマ) はエラー — Number("") が 0 になる罠を防ぐ', () => {
    expect(parseAmount(',')).toEqual({ ok: false, error: '金額は数値で入力してください' });
  });

  it('数値として解釈できない混在文字列はエラー', () => {
    expect(parseAmount('1-2-3')).toEqual({ ok: false, error: '金額は数値で入力してください' });
  });

  it('Infinity はエラー (有限数のみ受理)', () => {
    expect(parseAmount('Infinity')).toEqual({ ok: false, error: '金額は数値で入力してください' });
  });
});

describe('validateNote', () => {
  it('空文字はエラー', () => {
    expect(validateNote('')).toEqual({ ok: false, error: 'メモを入力してください' });
  });

  it('空白のみはエラー', () => {
    expect(validateNote('  \t  ')).toEqual({ ok: false, error: 'メモを入力してください' });
  });

  it('通常のメモは成功し前後空白が除去される', () => {
    expect(validateNote('  売上記録  ')).toEqual({ ok: true, value: '売上記録' });
  });

  it('最大長ちょうどは成功', () => {
    const s = 'あ'.repeat(NOTE_MAX_LENGTH);
    expect(validateNote(s)).toEqual({ ok: true, value: s });
  });

  it('最大長を超えるとエラー', () => {
    const s = 'あ'.repeat(NOTE_MAX_LENGTH + 1);
    expect(validateNote(s)).toEqual({
      ok: false,
      error: `メモは ${NOTE_MAX_LENGTH} 文字以内で入力してください`,
    });
  });

  it('NUL 文字を拒否する', () => {
    expect(validateNote(`a${NUL}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('C0 制御文字 (UNIT SEPARATOR) を拒否する', () => {
    expect(validateNote(`a${UNIT_SEP}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('DEL を拒否する', () => {
    expect(validateNote(`a${DEL}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('C1 制御文字を拒否する', () => {
    expect(validateNote(`a${C1}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('LINE SEPARATOR (U+2028) を拒否する', () => {
    expect(validateNote(`a${LINE_SEP}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('PARAGRAPH SEPARATOR (U+2029) を拒否する', () => {
    expect(validateNote(`a${PARA_SEP}b`)).toEqual({ ok: false, error: 'メモに制御文字は使用できません' });
  });

  it('HTML 風文字列はそのまま受理する (表示は React がエスケープ)', () => {
    const xss = '<script>alert(1)</script>';
    expect(validateNote(xss)).toEqual({ ok: true, value: xss });
  });
});

describe('actionPanelReducer', () => {
  it('setNote は note のみ更新する', () => {
    const s = actionPanelReducer(initialActionPanelState, { type: 'setNote', value: 'x' });
    expect(s.note).toBe('x');
    expect(s.amount).toBe('');
    expect(s.status).toEqual({ kind: 'idle' });
  });

  it('setAmount は amount のみ更新する', () => {
    const s = actionPanelReducer(initialActionPanelState, { type: 'setAmount', value: '99' });
    expect(s.amount).toBe('99');
    expect(s.note).toBe('');
  });

  it('recordStart で recording になる', () => {
    const s = actionPanelReducer(initialActionPanelState, { type: 'recordStart' });
    expect(s.status).toEqual({ kind: 'recording' });
  });

  it('recordSuccess で recorded になり入力欄がクリアされる', () => {
    const dirty: ActionPanelState = { note: 'memo', amount: '100', status: { kind: 'recording' } };
    const s = actionPanelReducer(dirty, { type: 'recordSuccess', message: 'done' });
    expect(s.note).toBe('');
    expect(s.amount).toBe('');
    expect(s.status).toEqual({ kind: 'recorded', message: 'done' });
  });

  it('adviseStart で advising になる', () => {
    const s = actionPanelReducer(initialActionPanelState, { type: 'adviseStart' });
    expect(s.status).toEqual({ kind: 'advising' });
  });

  it('adviseSuccess で advised になり advice を保持する', () => {
    const advice: ServiceAdvisorResponse = {
      recommendations: [{ title: 't', rationale: 'r' }],
      disclaimer: 'd',
      notForRealMoney: true,
      phase: 'stub',
    };
    const s = actionPanelReducer(initialActionPanelState, { type: 'adviseSuccess', advice });
    expect(s.status).toEqual({ kind: 'advised', advice });
  });

  it('fail で error になりメッセージを保持する', () => {
    const s = actionPanelReducer(initialActionPanelState, { type: 'fail', message: 'boom' });
    expect(s.status).toEqual({ kind: 'error', message: 'boom' });
  });

  it('recordSuccess は note/amount を保持しない (前の状態を引き継がない)', () => {
    const dirty: ActionPanelState = { note: 'a', amount: 'b', status: { kind: 'idle' } };
    const s = actionPanelReducer(dirty, { type: 'recordSuccess', message: 'm' });
    expect(s).toEqual({ note: '', amount: '', status: { kind: 'recorded', message: 'm' } });
  });

  it('未知のイベントは状態を変えない', () => {
    const s = actionPanelReducer(initialActionPanelState, {
      type: 'unknown',
    } as unknown as Parameters<typeof actionPanelReducer>[1]);
    expect(s).toBe(initialActionPanelState);
  });

  it('初期状態は idle + 空入力', () => {
    expect(initialActionPanelState).toEqual({ note: '', amount: '', status: { kind: 'idle' } });
  });
});

describe('canSubmitRecord', () => {
  it('idle かつ note 非空なら true', () => {
    expect(canSubmitRecord({ note: 'x', amount: '', status: { kind: 'idle' } })).toBe(true);
  });

  it('recording 中は false', () => {
    expect(canSubmitRecord({ note: 'x', amount: '', status: { kind: 'recording' } })).toBe(false);
  });

  it('note が空なら false', () => {
    expect(canSubmitRecord({ note: '', amount: '', status: { kind: 'idle' } })).toBe(false);
  });

  it('note が空白のみなら false', () => {
    expect(canSubmitRecord({ note: '   ', amount: '', status: { kind: 'idle' } })).toBe(false);
  });

  it('recorded 状態でも note があれば再送信可能', () => {
    expect(canSubmitRecord({ note: 'y', amount: '', status: { kind: 'recorded', message: 'm' } })).toBe(true);
  });
});

describe('canSubmitAdvise', () => {
  it('advising 中は false', () => {
    expect(canSubmitAdvise({ note: '', amount: '', status: { kind: 'advising' } })).toBe(false);
  });

  it('idle なら true', () => {
    expect(canSubmitAdvise({ note: '', amount: '', status: { kind: 'idle' } })).toBe(true);
  });

  it('error 状態でも true (再試行可能)', () => {
    expect(canSubmitAdvise({ note: '', amount: '', status: { kind: 'error', message: 'e' } })).toBe(true);
  });
});
