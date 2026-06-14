import { describe, expect, it } from 'vitest';
import { parseAmount, orderToSalesEntry } from '../shopifyImport';

describe('parseAmount', () => {
  it('strips currency formatting', () => {
    expect(parseAmount('¥12,000')).toBe(12000);
    expect(parseAmount('1,234円')).toBe(1234);
    expect(parseAmount('$1,000.50')).toBe(1000.5);
  });
  it('passes through positive numbers and floors invalid to 0', () => {
    expect(parseAmount(5000)).toBe(5000);
    expect(parseAmount(-3)).toBe(0);
    expect(parseAmount(Infinity)).toBe(0);
    expect(parseAmount('無料')).toBe(0);
  });
  it('floors a malformed numeric string (non-finite) to 0', () => {
    // '1.2.3' → Number('1.2.3')=NaN → isFinite ガードで 0。isFinite を true 固定する
    // mutant は Math.max(0, NaN)=NaN を返すため kill。
    expect(parseAmount('1.2.3')).toBe(0);
  });
});

describe('orderToSalesEntry', () => {
  it('maps a Shopify order to a shopify-channel sales entry', () => {
    const entry = orderToSalesEntry({ name: '#1001', total: '¥12,000' }, { date: '2026-05-29' });
    expect(entry).toEqual({
      date: '2026-05-29',
      channel: 'shopify',
      amount: 12000,
      orders: 1,
      note: 'Shopify #1001',
    });
  });

  it('honors an explicit order count', () => {
    const entry = orderToSalesEntry({ name: 'batch', total: 5000, orders: 3 }, { date: '2026-05-01' });
    expect(entry?.orders).toBe(3);
    expect(entry?.amount).toBe(5000);
  });

  it('returns null when no positive amount can be derived', () => {
    expect(orderToSalesEntry({ total: '¥0' }, { date: '2026-05-01' })).toBeNull();
    expect(orderToSalesEntry({ total: '無料' })).toBeNull();
  });

  it('defaults the date to today (YYYY-MM-DD)', () => {
    const entry = orderToSalesEntry({ total: 100 });
    expect(entry?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses a bare "Shopify" note when the order has no name', () => {
    // name 無しの else 枝 'Shopify' を '' にする StringLiteral mutant を kill。
    const entry = orderToSalesEntry({ total: 100 }, { date: '2026-05-01' });
    expect(entry?.note).toBe('Shopify');
  });
});
