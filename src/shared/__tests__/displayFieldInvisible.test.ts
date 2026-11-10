/**
 * 乗っ取り防止 (ai-phishing の穴): 第三者の題名・名前に混ざる見えない字を、汎用の表示口 `displayField` が
 * 見える綴り (`\uXXXX`) へ逃がす。文そのものは消さず、普通の日本語・絵文字の連結は 1 字も変えない。
 *
 * 肯定形で留める (逃がした結果の綴りを主張する) —— 「素の制御字が無い」だけを主張する形は、綴りが外れると
 * どの入力でも通る空の検査になる。
 */
import { describe, expect, it } from 'vitest';
import { displayField, MAX_DISPLAY_FIELD_CHARS } from '../apiResponse';

describe('displayField は見えない字を見える綴りへ逃がす', () => {
  it('★ 双方向制御 (右から左へ) は \\u202e として見える (それ以後の字を逆順に見せられない)', () => {
    expect(displayField('請求書‮fdp.exe')).toBe('請求書\\u202efdp.exe');
  });

  it('★ ゼロ幅スペースと BOM と行区切りも逃がす (見た目が同じ別の題名を作れない)', () => {
    expect(displayField('#general​')).toBe('#general\\u200b');
    expect(displayField('﻿name')).toBe('\\ufeffname');
    expect(displayField('a b')).toBe('a\\u2028b');
  });

  it('★ 「見える字なのに何も描かれない」字 (Hangul フィラー) も逃がす', () => {
    expect(displayField('#generalㅤ')).toBe('#general\\u3164');
  });

  it('★ 絵文字の連結 (ZWJ) は絵文字の間なら 1 字も変えない', () => {
    const family = '👨‍👩‍👧';
    expect(displayField(family)).toBe(family);
  });

  it('★ 絵文字の間でない ZWJ は逃がす', () => {
    expect(displayField('a‍b')).toBe('a\\u200db');
    expect(displayField('‍👨')).toBe('\\u200d👨');
    expect(displayField('👨‍x')).toBe('👨\\u200dx');
  });

  it('★ 普通の日本語・英数・記号・絵文字は 1 字も変わらない', () => {
    for (const s of ['請求書 2026年11月分', 'Pull request #12: fix (v1.2)', '葛飾区 ❤️ 東京', '😀 hello', '']) {
      expect(displayField(s)).toBe(s);
    }
  });

  it('★ 非文字列は空 (今までどおり)', () => {
    expect(displayField(undefined)).toBe('');
    expect(displayField({ a: 1 })).toBe('');
  });

  it('★ 天井で切ってから逃がす (増えるのは最大でも天井の 6 倍・切ったことは … で述べる)', () => {
    const out = displayField('‮'.repeat(10_000));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS * 6 + 1);
    expect(out.startsWith('\\u202e')).toBe(true);
  });

  it('対照: 逃がしを外した形 (素の返し) は双方向制御をそのまま通す (標本が的に当たる)', () => {
    const raw = '請求書‮fdp.exe';
    expect(/‮/.test(raw)).toBe(true);
    expect(/‮/.test(displayField(raw))).toBe(false);
  });
});
