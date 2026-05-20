import { describe, expect, it } from 'vitest';
import { normalizeAmount, sanitizeNote } from '../serviceActionPanelUtils';

describe('sanitizeNote', () => {
  it('passes plain ASCII text through unchanged', () => {
    const r = sanitizeNote('hello world');
    expect(r.error).toBe(null);
    expect(r.value).toBe('hello world');
  });

  it('passes Japanese text through unchanged', () => {
    const r = sanitizeNote('売上記録 2026 年 5 月');
    expect(r.error).toBe(null);
    expect(r.value).toBe('売上記録 2026 年 5 月');
  });

  it('preserves tab / LF / CR (common whitespace)', () => {
    const r = sanitizeNote('a\tb\nc\rd');
    expect(r.error).toBe(null);
    expect(r.value).toBe('a\tb\nc\rd');
  });

  it('rejects input containing a NULL byte', () => {
    const r = sanitizeNote(`before${String.fromCharCode(0)}after`);
    expect(r.error).toBe('note に NULL バイトを含めることはできません');
    expect(r.value).toBe('');
  });

  it('strips C0 control characters (e.g. U+0008 backspace)', () => {
    const r = sanitizeNote(`a${String.fromCharCode(0x08)}b`);
    expect(r.error).toBe(null);
    expect(r.value).toBe('ab');
  });

  it('strips DEL (U+007F) and C1 (U+0080-009F)', () => {
    const r = sanitizeNote(`a${String.fromCharCode(0x7f)}b${String.fromCharCode(0x9f)}c`);
    expect(r.error).toBe(null);
    expect(r.value).toBe('abc');
  });

  it('strips zero-width / bidi (U+200B-200F)', () => {
    const r = sanitizeNote('a​b‎c');
    expect(r.error).toBe(null);
    expect(r.value).toBe('abc');
  });

  it('strips line/paragraph separator (U+2028 / U+2029) and BOM (U+FEFF)', () => {
    const r = sanitizeNote('a b c﻿d');
    expect(r.error).toBe(null);
    expect(r.value).toBe('abcd');
  });

  it('returns empty string for empty input without error', () => {
    const r = sanitizeNote('');
    expect(r.error).toBe(null);
    expect(r.value).toBe('');
  });
});

describe('normalizeAmount', () => {
  it('returns null for empty / whitespace input', () => {
    expect(normalizeAmount('')).toBe(null);
    expect(normalizeAmount('   ')).toBe(null);
    expect(normalizeAmount('\t')).toBe(null);
  });

  it('parses plain ASCII integers', () => {
    expect(normalizeAmount('1000')).toBe(1000);
    expect(normalizeAmount('0')).toBe(0);
    expect(normalizeAmount('42')).toBe(42);
  });

  it('parses ASCII decimals', () => {
    expect(normalizeAmount('1.5')).toBe(1.5);
    expect(normalizeAmount('0.001')).toBe(0.001);
  });

  it('strips ASCII thousands separator commas', () => {
    expect(normalizeAmount('1,000')).toBe(1000);
    expect(normalizeAmount('1,234,567')).toBe(1234567);
  });

  it('normalizes full-width digits to half-width', () => {
    expect(normalizeAmount('１０００')).toBe(1000);
    expect(normalizeAmount('４２')).toBe(42);
  });

  it('normalizes full-width comma + decimal point', () => {
    expect(normalizeAmount('１，０００')).toBe(1000);
    expect(normalizeAmount('１．５')).toBe(1.5);
  });

  it('handles mixed full-width / half-width', () => {
    expect(normalizeAmount('1，000')).toBe(1000);
    expect(normalizeAmount('１,500')).toBe(1500);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAmount('  1000  ')).toBe(1000);
    expect(normalizeAmount('\t42\n')).toBe(42);
  });

  it('returns null for non-numeric input', () => {
    expect(normalizeAmount('abc')).toBe(null);
    expect(normalizeAmount('1abc')).toBe(null);
    expect(normalizeAmount('--1')).toBe(null);
  });

  it('returns null for Infinity / NaN literals', () => {
    expect(normalizeAmount('Infinity')).toBe(null);
    expect(normalizeAmount('NaN')).toBe(null);
    expect(normalizeAmount('-Infinity')).toBe(null);
  });

  it('parses negative numbers with ASCII minus', () => {
    expect(normalizeAmount('-100')).toBe(-100);
    expect(normalizeAmount('-1,000')).toBe(-1000);
  });
});
