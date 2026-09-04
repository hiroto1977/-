import { describe, expect, it } from 'vitest';
import { jpy } from '../formatters';

describe('jpy', () => {
  it('prefixes ¥ and groups thousands (ja-JP)', () => {
    expect(jpy(0)).toBe('¥0');
    expect(jpy(1200)).toBe('¥1,200');
    expect(jpy(1_234_567)).toBe('¥1,234,567');
  });

  it('handles negative amounts', () => {
    expect(jpy(-5000)).toBe('¥-5,000');
  });
});
