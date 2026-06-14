import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_CATALOG,
  CATALOG_REGISTRY,
  planConnectorRun,
  listConnectorsFor,
  listConnectorsByCapability,
  catalogConnectorIds,
} from '../connectorCatalog';
import {
  buildConnectorRegistry,
  validateConnectors,
  CONNECTOR_CAPABILITIES,
} from '../connectorRegistry';
import { isServiceId } from '../../serviceId';

// --- カタログの起動時不変条件 --------------------------------------------

describe('CONNECTOR_CATALOG', () => {
  it('contains between 6 and 10 declared connectors', () => {
    expect(CONNECTOR_CATALOG.length).toBeGreaterThanOrEqual(6);
    expect(CONNECTOR_CATALOG.length).toBeLessThanOrEqual(10);
  });

  it('declares exactly 9 connectors in the documented input order', () => {
    expect(CONNECTOR_CATALOG.map((c) => c.id)).toEqual([
      'github-to-slack-notify',
      'stripe-to-drive-export',
      'sentry-to-linear-record',
      'shopify-to-notion-record',
      'salesforce-to-gmail-notify',
      'asana-to-calendar-sync',
      'linear-to-discord-notify',
      'kpi-to-storage-export',
      'microsoft-365-to-storage-export',
    ]);
  });

  it('passes validateConnectors with zero errors (startup invariant)', () => {
    expect(validateConnectors(CONNECTOR_CATALOG)).toEqual([]);
  });

  it('can be built into a registry without throwing (loud-fail invariant)', () => {
    expect(() => buildConnectorRegistry(CONNECTOR_CATALOG)).not.toThrow();
  });

  it('uses only real ServiceId values for every sourceService', () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(isServiceId(c.sourceService)).toBe(true);
    }
  });

  it('uses only real ServiceId values for every targetService', () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(isServiceId(c.targetService)).toBe(true);
    }
  });

  it('declares only whitelisted capabilities', () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(CONNECTOR_CAPABILITIES).toContain(c.capability);
    }
  });

  it('gives every connector a non-empty description', () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('marks the local kpi→storage export as not requiring auth and all others as requiring auth', () => {
    const noAuth = CONNECTOR_CATALOG.filter((c) => !c.requiresAuth).map((c) => c.id);
    expect(noAuth).toEqual(['kpi-to-storage-export']);
  });
});

// --- CATALOG_REGISTRY ----------------------------------------------------

describe('CATALOG_REGISTRY', () => {
  it('indexes every catalog connector by id', () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(CATALOG_REGISTRY.byId.get(c.id)).toBe(c);
    }
  });

  it('preserves the catalog input order in registry.all', () => {
    expect(CATALOG_REGISTRY.all).toEqual(CONNECTOR_CATALOG);
  });

  it('has a byId map sized exactly to the catalog (no duplicate ids collapsed)', () => {
    expect(CATALOG_REGISTRY.byId.size).toBe(CONNECTOR_CATALOG.length);
  });
});

// --- planConnectorRun: 各コネクタの実値全文照合 --------------------------

describe('planConnectorRun', () => {
  it('plans github-to-slack-notify with fallback applied for missing author and skip for missing channel', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'github-to-slack-notify', {
      title: 'Fix login bug',
      url: 'https://github.com/x/y/pull/1',
      // author missing → fallback 'github-bot'
      // channel missing → skipIfMissing → key absent
    });
    expect(plan).toEqual({
      connectorId: 'github-to-slack-notify',
      sourceService: 'github',
      targetService: 'slack',
      capability: 'notify',
      requiresAuth: true,
      payload: {
        text: 'Fix login bug',
        link: 'https://github.com/x/y/pull/1',
        username: 'github-bot',
      },
    });
  });

  it('plans github-to-slack-notify keeping a present author and a present channel', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'github-to-slack-notify', {
      title: 'Add feature',
      url: 'https://example.com',
      author: 'alice',
      channel: '#eng',
    });
    expect(plan.payload).toEqual({
      text: 'Add feature',
      link: 'https://example.com',
      username: 'alice',
      channel: '#eng',
    });
  });

  it('plans stripe-to-drive-export applying the invoice transform and folder fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'stripe-to-drive-export', {
      invoiceId: 'inv_42',
      amount: 1980,
      // folderId missing → fallback 'root'
    });
    expect(plan).toEqual({
      connectorId: 'stripe-to-drive-export',
      sourceService: 'stripe',
      targetService: 'drive',
      capability: 'export',
      requiresAuth: true,
      payload: {
        name: 'invoice-inv_42.pdf',
        sizeHint: 1980,
        parent: 'root',
      },
    });
  });

  it('plans stripe-to-drive-export using a provided folderId instead of the fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'stripe-to-drive-export', {
      invoiceId: 'inv_7',
      amount: 500,
      folderId: 'fld_main',
    });
    expect(plan.payload).toEqual({
      name: 'invoice-inv_7.pdf',
      sizeHint: 500,
      parent: 'fld_main',
    });
  });

  it('plans sentry-to-linear-record with the title prefix transform and level fallback, skipping a missing assignee', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'sentry-to-linear-record', {
      culprit: 'auth.login',
      permalink: 'https://sentry.io/issues/1',
      // level missing → fallback 'error'
      // assignee missing → skipIfMissing → absent
    });
    expect(plan).toEqual({
      connectorId: 'sentry-to-linear-record',
      sourceService: 'sentry',
      targetService: 'linear',
      capability: 'record',
      requiresAuth: true,
      payload: {
        title: '[Sentry] auth.login',
        description: 'https://sentry.io/issues/1',
        priority: 'error',
      },
    });
  });

  it('plans sentry-to-linear-record keeping a present level and assignee', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'sentry-to-linear-record', {
      culprit: 'db.query',
      permalink: 'https://sentry.io/issues/2',
      level: 'warning',
      assignee: 'bob',
    });
    expect(plan.payload).toEqual({
      title: '[Sentry] db.query',
      description: 'https://sentry.io/issues/2',
      priority: 'warning',
      assignee: 'bob',
    });
  });

  it('plans shopify-to-notion-record with the customer fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'shopify-to-notion-record', {
      orderNumber: '#1001',
      total: 4200,
      // customer missing → fallback 'ゲスト'
    });
    expect(plan).toEqual({
      connectorId: 'shopify-to-notion-record',
      sourceService: 'shopify',
      targetService: 'notion',
      capability: 'record',
      requiresAuth: true,
      payload: {
        Title: '#1001',
        Amount: 4200,
        Customer: 'ゲスト',
      },
    });
  });

  it('plans salesforce-to-gmail-notify with subject transform and stage fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'salesforce-to-gmail-notify', {
      opportunity: 'Acme Q3',
      owner: 'rep@example.com',
      // stage missing → fallback '(ステージ未設定)'
    });
    expect(plan).toEqual({
      connectorId: 'salesforce-to-gmail-notify',
      sourceService: 'salesforce',
      targetService: 'gmail',
      capability: 'notify',
      requiresAuth: true,
      payload: {
        subject: '商談更新: Acme Q3',
        to: 'rep@example.com',
        body: '(ステージ未設定)',
      },
    });
  });

  it('plans asana-to-calendar-sync mapping dueOn into both start and end (last write wins on distinct keys) and skipping missing notes', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'asana-to-calendar-sync', {
      name: 'Ship release',
      dueOn: '2026-07-01',
      // notes missing → skipIfMissing → absent
    });
    expect(plan).toEqual({
      connectorId: 'asana-to-calendar-sync',
      sourceService: 'asana',
      targetService: 'calendar',
      capability: 'sync',
      requiresAuth: true,
      payload: {
        summary: 'Ship release',
        start: '2026-07-01',
        end: '2026-07-01',
      },
    });
  });

  it('plans asana-to-calendar-sync including notes when present', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'asana-to-calendar-sync', {
      name: 'Review',
      dueOn: '2026-08-15',
      notes: 'bring laptop',
    });
    expect(plan.payload).toEqual({
      summary: 'Review',
      start: '2026-08-15',
      end: '2026-08-15',
      description: 'bring laptop',
    });
  });

  it('plans linear-to-discord-notify with the content transform and state fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'linear-to-discord-notify', {
      identifier: 'ENG-12',
      // state missing → fallback 'In Progress'
    });
    expect(plan).toEqual({
      connectorId: 'linear-to-discord-notify',
      sourceService: 'linear',
      targetService: 'discord',
      capability: 'notify',
      requiresAuth: true,
      payload: {
        content: 'Issue ENG-12 が更新されました',
        embedTitle: 'In Progress',
      },
    });
  });

  it('plans kpi-to-storage-export without requiring auth, with the period fallback', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'kpi-to-storage-export', {
      metric: 'MRR',
      value: 120000,
      // period missing → fallback 'monthly'
    });
    expect(plan).toEqual({
      connectorId: 'kpi-to-storage-export',
      sourceService: 'kpi',
      targetService: 'storage',
      capability: 'export',
      requiresAuth: false,
      payload: {
        key: 'MRR',
        value: 120000,
        label: 'monthly',
      },
    });
  });

  it('plans microsoft-365-to-storage-export with the from fallback and skips a missing received', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'microsoft-365-to-storage-export', {
      subject: '請求書の件',
      // from missing → fallback '(unknown)'
      // received missing → skipIfMissing → absent
    });
    expect(plan).toEqual({
      connectorId: 'microsoft-365-to-storage-export',
      sourceService: 'microsoft-365',
      targetService: 'storage',
      capability: 'export',
      requiresAuth: true,
      payload: { key: '請求書の件', value: '(unknown)' },
    });
  });

  it('plans microsoft-365-to-storage-export keeping a present from and received', () => {
    const plan = planConnectorRun(CATALOG_REGISTRY, 'microsoft-365-to-storage-export', {
      subject: '会議メモ',
      from: '佐藤',
      received: '2026-06-10',
    });
    expect(plan.payload).toEqual({ key: '会議メモ', value: '佐藤', label: '2026-06-10' });
  });

  it('writes undefined (not skip) when a non-skip, non-fallback field is missing', () => {
    // shopify-to-notion-record: orderNumber/total/Customer の Title 規則は
    // fallback/skip 無しなので、欠損時は undefined を書き込む (キーは存在する)。
    const plan = planConnectorRun(CATALOG_REGISTRY, 'shopify-to-notion-record', {
      total: 100,
      customer: 'Acme',
    });
    expect(plan.payload).toEqual({
      Title: undefined,
      Amount: 100,
      Customer: 'Acme',
    });
    expect(Object.prototype.hasOwnProperty.call(plan.payload, 'Title')).toBe(true);
  });

  it('throws a descriptive error for an unknown connectorId', () => {
    expect(() => planConnectorRun(CATALOG_REGISTRY, 'does-not-exist', {})).toThrow(
      'unknown connector: does-not-exist',
    );
  });

  it('echoes the unknown id verbatim in the thrown message', () => {
    expect(() => planConnectorRun(CATALOG_REGISTRY, 'github-to-slack', {})).toThrow(
      'unknown connector: github-to-slack',
    );
  });

  it('returns the connector id from the registry entry, not the lookup key', () => {
    // 計画は registry に登録された Connector.id を返す (lookup 引数と一致)。
    const plan = planConnectorRun(CATALOG_REGISTRY, 'kpi-to-storage-export', {});
    expect(plan.connectorId).toBe('kpi-to-storage-export');
  });
});

// --- listConnectorsFor ---------------------------------------------------

describe('listConnectorsFor', () => {
  it('returns exactly the connectors whose sourceService matches, in input order', () => {
    // linear is a source once (linear-to-discord-notify) and a target once
    // (sentry-to-linear-record) — only the source-side connector is returned.
    expect(listConnectorsFor(CATALOG_REGISTRY, 'linear').map((c) => c.id)).toEqual([
      'linear-to-discord-notify',
    ]);
  });

  it('returns the github-sourced connector', () => {
    expect(listConnectorsFor(CATALOG_REGISTRY, 'github').map((c) => c.id)).toEqual([
      'github-to-slack-notify',
    ]);
  });

  it('returns an empty array for a service that is never a source', () => {
    // slack appears only as a target, never as a source.
    expect(listConnectorsFor(CATALOG_REGISTRY, 'slack')).toEqual([]);
  });
});

// --- listConnectorsByCapability ------------------------------------------

describe('listConnectorsByCapability', () => {
  it('returns every notify connector in input order', () => {
    expect(listConnectorsByCapability(CATALOG_REGISTRY, 'notify').map((c) => c.id)).toEqual([
      'github-to-slack-notify',
      'salesforce-to-gmail-notify',
      'linear-to-discord-notify',
    ]);
  });

  it('returns every export connector in input order', () => {
    expect(listConnectorsByCapability(CATALOG_REGISTRY, 'export').map((c) => c.id)).toEqual([
      'stripe-to-drive-export',
      'kpi-to-storage-export',
      'microsoft-365-to-storage-export',
    ]);
  });

  it('returns every record connector in input order', () => {
    expect(listConnectorsByCapability(CATALOG_REGISTRY, 'record').map((c) => c.id)).toEqual([
      'sentry-to-linear-record',
      'shopify-to-notion-record',
    ]);
  });

  it('returns every sync connector in input order', () => {
    expect(listConnectorsByCapability(CATALOG_REGISTRY, 'sync').map((c) => c.id)).toEqual([
      'asana-to-calendar-sync',
    ]);
  });
});

// --- catalogConnectorIds -------------------------------------------------

describe('catalogConnectorIds', () => {
  it('returns all catalog ids in input order (full match)', () => {
    expect(catalogConnectorIds(CATALOG_REGISTRY)).toEqual([
      'github-to-slack-notify',
      'stripe-to-drive-export',
      'sentry-to-linear-record',
      'shopify-to-notion-record',
      'salesforce-to-gmail-notify',
      'asana-to-calendar-sync',
      'linear-to-discord-notify',
      'kpi-to-storage-export',
      'microsoft-365-to-storage-export',
    ]);
  });

  it('returns one id per catalog connector', () => {
    expect(catalogConnectorIds(CATALOG_REGISTRY)).toHaveLength(CONNECTOR_CATALOG.length);
  });
});
