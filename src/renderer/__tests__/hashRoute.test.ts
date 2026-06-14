import { describe, it, expect } from 'vitest';
import { serviceIdFromHash, hashForService } from '../hashRoute';

describe('serviceIdFromHash', () => {
  it('有効な #<id> を ServiceId に解決する', () => {
    expect(serviceIdFromHash('#stocks')).toBe('stocks');
    expect(serviceIdFromHash('#github')).toBe('github');
  });

  it('先頭スラッシュ形式 (#/<id>) も解決する', () => {
    expect(serviceIdFromHash('#/stocks')).toBe('stocks');
  });

  it('ハイフン ID を解決する', () => {
    expect(serviceIdFromHash('#tax-accountant')).toBe('tax-accountant');
  });

  it('空ハッシュは null', () => {
    expect(serviceIdFromHash('')).toBeNull();
    expect(serviceIdFromHash('#')).toBeNull();
  });

  it('未知の id は null', () => {
    expect(serviceIdFromHash('#not-a-real-service')).toBeNull();
  });

  it('前後空白を無視する', () => {
    expect(serviceIdFromHash('#  stocks  ')).toBe('stocks');
  });

  it('hashForService は往復する', () => {
    expect(serviceIdFromHash(hashForService('notion'))).toBe('notion');
  });
});

describe('hashForService', () => {
  it('#<id> 形式を返す', () => {
    expect(hashForService('slack')).toBe('#slack');
  });
});
