import { describe, expect, it } from 'vitest';
import { summarizeConnections, type ConnService } from '../connectionStatus';
import { SERVICES } from '../../services';

const FIXTURE: readonly ConnService[] = [
  { id: 'github', label: 'GitHub', category: 'integrations' },
  { id: 'slack', label: 'Slack', category: 'integrations' },
  { id: 'tax', label: '税務試算', category: 'tools' },
  { id: 'home', label: 'ホーム', category: 'featured' },
];

describe('summarizeConnections', () => {
  it('splits connected vs not-connected in input order', () => {
    const s = summarizeConnections(FIXTURE, new Set(['github', 'tax']));
    expect(s.total).toBe(4);
    expect(s.connectedCount).toBe(2);
    expect(s.connected.map((c) => c.id)).toEqual(['github', 'tax']);
    expect(s.notConnected.map((c) => c.id)).toEqual(['slack', 'home']);
  });

  it('aggregates per category in first-seen order with correct connected counts', () => {
    const s = summarizeConnections(FIXTURE, new Set(['github']));
    expect(s.byCategory).toEqual([
      { category: 'integrations', total: 2, connected: 1 },
      { category: 'tools', total: 1, connected: 0 },
      { category: 'featured', total: 1, connected: 0 },
    ]);
  });

  it('accumulates multiple connected services within one category', () => {
    // integrations に 2 件接続 → connected=2 (二回目の加算が効くことを固定)。
    const s = summarizeConnections(FIXTURE, new Set(['github', 'slack']));
    const integrations = s.byCategory.find((c) => c.category === 'integrations');
    expect(integrations).toEqual({ category: 'integrations', total: 2, connected: 2 });
  });

  it('handles all-connected and none-connected', () => {
    const all = summarizeConnections(FIXTURE, new Set(['github', 'slack', 'tax', 'home']));
    expect(all.connectedCount).toBe(4);
    expect(all.notConnected).toEqual([]);
    const none = summarizeConnections(FIXTURE, new Set());
    expect(none.connectedCount).toBe(0);
    expect(none.connected).toEqual([]);
    expect(none.byCategory.every((c) => c.connected === 0)).toBe(true);
  });

  it('ignores configured ids that are not in the services list', () => {
    const s = summarizeConnections(FIXTURE, new Set(['nonexistent-id', 'github']));
    expect(s.connectedCount).toBe(1);
    expect(s.connected.map((c) => c.id)).toEqual(['github']);
  });

  it('empty services → zero totals and no categories', () => {
    const s = summarizeConnections([], new Set(['github']));
    expect(s).toEqual({
      total: 0,
      connectedCount: 0,
      connected: [],
      notConnected: [],
      byCategory: [],
    });
  });

  it('covers the real SERVICES list (total matches, counts are consistent)', () => {
    const svc = SERVICES.map((s) => ({ id: s.id, label: s.label, category: s.category }));
    const s = summarizeConnections(svc, new Set(['tax']));
    expect(s.total).toBe(SERVICES.length);
    expect(s.connectedCount + s.notConnected.length).toBe(SERVICES.length);
    // カテゴリ別 total の合計は全体に一致する。
    expect(s.byCategory.reduce((n, c) => n + c.total, 0)).toBe(SERVICES.length);
    expect(s.byCategory.reduce((n, c) => n + c.connected, 0)).toBe(s.connectedCount);
  });
});
