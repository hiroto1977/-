import { describe, expect, it } from 'vitest';
import {
  sumShigyoMonthlyFees,
  sumShigyoOutstanding,
  type ShigyoSnapshot,
} from '../shigyoTypes';

const make = (monthlyFee: number, outstandingInvoice: number): ShigyoSnapshot => ({
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee,
  outstandingInvoice,
});

describe('sumShigyoMonthlyFees', () => {
  it('returns 0 for an empty list', () => {
    expect(sumShigyoMonthlyFees([])).toBe(0);
  });

  it('sums the monthly fees across snapshots', () => {
    expect(sumShigyoMonthlyFees([make(33_000, 0), make(22_000, 5), make(0, 9)])).toBe(55_000);
  });
});

describe('sumShigyoOutstanding', () => {
  it('returns 0 for an empty list', () => {
    expect(sumShigyoOutstanding([])).toBe(0);
  });

  it('sums the outstanding invoices across snapshots', () => {
    expect(sumShigyoOutstanding([make(0, 88_000), make(1, 165_000), make(2, 0)])).toBe(253_000);
  });
});
