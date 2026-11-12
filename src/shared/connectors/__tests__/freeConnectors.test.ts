import { describe, expect, it } from 'vitest';
import {
  FREE_CONNECTORS,
  FREE_EXPORT_CONNECTORS,
  FREE_RECORD_CONNECTORS,
  FREE_CONNECTOR_REGISTRY,
} from '../freeConnectors';
import {
  buildConnectorRegistry,
  validateConnectors,
  CONNECTOR_CAPABILITIES,
} from '../connectorRegistry';
import { planConnectorRun } from '../connectorCatalog';
import { isServiceId, type ServiceId } from '../../serviceId';

// 無料コネクタが触れてよいローカル (認証不要) サービス。main/clients の
// LOCAL_SERVICES を import するとレンダラ/共有→main の境界違反になるため、本テストでは
// 期待集合をインラインで宣言する (main 側の真実とは lint:imports 境界で分離)。
const LOCAL_SERVICE_IDS = new Set<ServiceId>([
  'stocks',
  'storage',
  'emotions',
  'library',
  'security',
  'sales',
  'business',
  'teamradar',
  'overview',
  'kpi',
  'quality',
  'tax',
]);

// --- 無料カタログの起動時不変条件 ----------------------------------------

describe('FREE_CONNECTORS', () => {
  it('declares exactly 10 free connectors in the documented input order', () => {
    expect(FREE_CONNECTORS.map((c) => c.id)).toEqual([
      'stocks-to-storage-export',
      'emotions-to-library-export',
      'security-to-storage-export',
      'sales-to-storage-export',
      'business-to-library-export',
      'teamradar-to-storage-export',
      'overview-to-storage-export',
      'kpi-to-library-record',
      'quality-to-library-record',
      'tax-to-library-record',
    ]);
  });

  it('is the export group followed by the record group (input order preserved)', () => {
    expect(FREE_CONNECTORS).toEqual([...FREE_EXPORT_CONNECTORS, ...FREE_RECORD_CONNECTORS]);
    expect(FREE_EXPORT_CONNECTORS).toHaveLength(7);
    expect(FREE_RECORD_CONNECTORS).toHaveLength(3);
  });

  it('marks every free connector as not requiring auth', () => {
    expect(FREE_CONNECTORS.every((c) => c.requiresAuth === false)).toBe(true);
    expect(FREE_CONNECTORS.filter((c) => c.requiresAuth).map((c) => c.id)).toEqual([]);
  });

  it('uses only local (no-auth) services for every source and target', () => {
    for (const c of FREE_CONNECTORS) {
      expect(LOCAL_SERVICE_IDS.has(c.sourceService)).toBe(true);
      expect(LOCAL_SERVICE_IDS.has(c.targetService)).toBe(true);
    }
  });

  it('uses only real ServiceId values for every source and target', () => {
    for (const c of FREE_CONNECTORS) {
      expect(isServiceId(c.sourceService)).toBe(true);
      expect(isServiceId(c.targetService)).toBe(true);
    }
  });

  it('uses only the local capabilities export and record (no external notify/sync)', () => {
    for (const c of FREE_CONNECTORS) {
      expect(CONNECTOR_CAPABILITIES).toContain(c.capability);
      expect(['export', 'record']).toContain(c.capability);
    }
  });

  it('gives every free connector a non-empty description ending with the 認証不要 note', () => {
    for (const c of FREE_CONNECTORS) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.description).toContain('認証不要');
    }
  });

  it('passes validateConnectors with zero errors (startup invariant)', () => {
    expect(validateConnectors(FREE_CONNECTORS)).toEqual([]);
  });

  it('can be built into a registry without throwing (loud-fail invariant)', () => {
    expect(() => buildConnectorRegistry(FREE_CONNECTORS)).not.toThrow();
  });
});

// --- FREE_CONNECTOR_REGISTRY ---------------------------------------------

describe('FREE_CONNECTOR_REGISTRY', () => {
  it('indexes every free connector by id', () => {
    for (const c of FREE_CONNECTORS) {
      expect(FREE_CONNECTOR_REGISTRY.byId.get(c.id)).toBe(c);
    }
  });

  it('preserves input order in registry.all and sizes byId to the catalog', () => {
    expect(FREE_CONNECTOR_REGISTRY.all).toEqual(FREE_CONNECTORS);
    expect(FREE_CONNECTOR_REGISTRY.byId.size).toBe(FREE_CONNECTORS.length);
  });
});

// --- planConnectorRun: 各無料コネクタの実値全文照合 ----------------------

describe('planConnectorRun over free connectors', () => {
  it('plans stocks-to-storage-export with the name fallback when missing', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'stocks-to-storage-export', {
        symbol: '7203',
        price: 2800,
        // name missing → fallback '—'
      }),
    ).toEqual({
      connectorId: 'stocks-to-storage-export',
      sourceService: 'stocks',
      targetService: 'storage',
      capability: 'export',
      requiresAuth: false,
      payload: { key: '7203', value: 2800, label: '—' },
    });
  });

  it('plans stocks-to-storage-export keeping a present name', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'stocks-to-storage-export', {
        symbol: '6758',
        price: 13000,
        name: 'ソニー',
      }).payload,
    ).toEqual({ key: '6758', value: 13000, label: 'ソニー' });
  });

  it('plans emotions-to-library-export applying the filename transform and skipping a missing note', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'emotions-to-library-export', {
        date: '2026-06-10',
        score: 72,
        // note missing → skipIfMissing → absent
      }),
    ).toEqual({
      connectorId: 'emotions-to-library-export',
      sourceService: 'emotions',
      targetService: 'library',
      capability: 'export',
      requiresAuth: false,
      payload: { name: 'emotion-2026-06-10.json', sizeHint: 72 },
    });
  });

  it('plans emotions-to-library-export including a present note', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'emotions-to-library-export', {
        date: '2026-06-11',
        score: 40,
        note: 'tired',
      }).payload,
    ).toEqual({ name: 'emotion-2026-06-11.json', sizeHint: 40, meta: 'tired' });
  });

  it('plans security-to-storage-export with the severity fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'security-to-storage-export', {
        check: 'tls-cert',
        status: 'ok',
        // severity missing → fallback 'info'
      }).payload,
    ).toEqual({ key: 'tls-cert', value: 'ok', label: 'info' });
  });

  it('plans sales-to-storage-export with the channel fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'sales-to-storage-export', {
        month: '2026-05',
        revenue: 1500000,
      }).payload,
    ).toEqual({ key: '2026-05', value: 1500000, label: 'all' });
  });

  it('plans business-to-library-export with the period fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'business-to-library-export', {
        kpiName: 'NRR',
        score: 118,
      }).payload,
    ).toEqual({ name: 'NRR', sizeHint: 118, meta: 'monthly' });
  });

  it('plans teamradar-to-storage-export with the status fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'teamradar-to-storage-export', {
        member: 'alice',
        load: 0.8,
      }).payload,
    ).toEqual({ key: 'alice', value: 0.8, label: 'ok' });
  });

  it('plans overview-to-storage-export skipping a missing unit', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'overview-to-storage-export', {
        metric: 'cash',
        value: 8200000,
        // unit missing → skipIfMissing → absent
      }).payload,
    ).toEqual({ key: 'cash', value: 8200000 });
  });

  it('plans kpi-to-library-record with the period fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'kpi-to-library-record', {
        metric: 'MRR',
        value: 120000,
      }),
    ).toEqual({
      connectorId: 'kpi-to-library-record',
      sourceService: 'kpi',
      targetService: 'library',
      capability: 'record',
      requiresAuth: false,
      payload: { Title: 'MRR', Amount: 120000, Label: 'monthly' },
    });
  });

  it('plans quality-to-library-record skipping a missing note', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'quality-to-library-record', {
        suite: 'unit',
        passRate: 100,
      }).payload,
    ).toEqual({ Title: 'unit', Amount: 100 });
  });

  it('plans tax-to-library-record applying the title transform and year fallback', () => {
    expect(
      planConnectorRun(FREE_CONNECTOR_REGISTRY, 'tax-to-library-record', {
        taxType: '所得税',
        amount: 320000,
      }).payload,
    ).toEqual({ Title: '税務試算: 所得税', Amount: 320000, Label: '当年' });
  });
});
