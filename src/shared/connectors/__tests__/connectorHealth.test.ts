import { describe, expect, it } from 'vitest';
import {
  capabilityCoverage,
  connectorHealthReport,
  findUnreachableServices,
  pluginPermissionGaps,
  serviceConnectivity,
} from '../connectorHealth';
import { buildConnectorRegistry, type Connector } from '../connectorRegistry';
import { buildPluginRuntime, type PluginRuntime } from '../pluginRuntime';
import { CATALOG_REGISTRY } from '../connectorCatalog';
import type { PluginManifest } from '../connectorRegistry';
import type { ConnectorRegistry } from '../connectorRegistry';

// --- フィクスチャ・ファクトリ --------------------------------------------
//
// describe-scope に静的な registry/runtime を置くと Stryker が describe ブロック
// 単位で誤分類しうるため、コネクタ宣言だけを定義し、registry/runtime は各テスト
// 内で組み立てる。

/** notify コネクタ (要権限: network:proxy)。 */
const notifyConnector: Connector = {
  id: 'gh-slack-notify',
  sourceService: 'github',
  targetService: 'slack',
  capability: 'notify',
  fieldMap: [{ from: 'title', to: 'text' }],
  requiresAuth: true,
  description: 'GitHub の通知を Slack へ',
};

/** export コネクタ (要権限: storage:library)。 */
const exportConnector: Connector = {
  id: 'kpi-storage-export',
  sourceService: 'kpi',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [{ from: 'metric', to: 'key' }],
  requiresAuth: false,
  description: 'KPI をストレージへ',
};

/** record コネクタ (要権限: write:action)。 */
const recordConnector: Connector = {
  id: 'shopify-notion-record',
  sourceService: 'shopify',
  targetService: 'notion',
  capability: 'record',
  fieldMap: [{ from: 'orderNumber', to: 'Title' }],
  requiresAuth: true,
  description: 'Shopify の注文を Notion へ',
};

/** sync コネクタ (要権限: write:action)。 */
const syncConnector: Connector = {
  id: 'asana-calendar-sync',
  sourceService: 'asana',
  targetService: 'calendar',
  capability: 'sync',
  fieldMap: [{ from: 'name', to: 'summary' }],
  requiresAuth: true,
  description: 'Asana のタスクを Calendar へ',
};

// --- capabilityCoverage: 実カタログ全文照合 ------------------------------

describe('capabilityCoverage (CATALOG_REGISTRY)', () => {
  it('groups every catalog connector id by capability in input order', () => {
    expect(capabilityCoverage(CATALOG_REGISTRY)).toEqual({
      export: ['stripe-to-drive-export', 'kpi-to-storage-export'],
      sync: ['asana-to-calendar-sync'],
      notify: ['github-to-slack-notify', 'salesforce-to-gmail-notify', 'linear-to-discord-notify'],
      record: ['sentry-to-linear-record', 'shopify-to-notion-record'],
    });
  });

  it('always includes all four capability keys', () => {
    expect(Object.keys(capabilityCoverage(CATALOG_REGISTRY)).sort()).toEqual([
      'export',
      'notify',
      'record',
      'sync',
    ]);
  });
});

// --- capabilityCoverage: fixture ------------------------------------------

describe('capabilityCoverage (fixture)', () => {
  it('groups connector ids by capability preserving registry input order', () => {
    const registry = buildConnectorRegistry([
      notifyConnector,
      exportConnector,
      recordConnector,
      syncConnector,
    ]);
    expect(capabilityCoverage(registry)).toEqual({
      export: ['kpi-storage-export'],
      sync: ['asana-calendar-sync'],
      notify: ['gh-slack-notify'],
      record: ['shopify-notion-record'],
    });
  });

  it('lists multiple connectors of the same capability in input order', () => {
    const secondNotify: Connector = {
      id: 'sf-gmail-notify',
      sourceService: 'salesforce',
      targetService: 'gmail',
      capability: 'notify',
      fieldMap: [{ from: 'a', to: 'b' }],
      requiresAuth: true,
      description: 'x',
    };
    const registry = buildConnectorRegistry([notifyConnector, secondNotify]);
    expect(capabilityCoverage(registry)).toEqual({
      export: [],
      sync: [],
      notify: ['gh-slack-notify', 'sf-gmail-notify'],
      record: [],
    });
  });

  it('returns all four keys as empty arrays for an empty registry', () => {
    const registry = buildConnectorRegistry([]);
    expect(capabilityCoverage(registry)).toEqual({
      export: [],
      sync: [],
      notify: [],
      record: [],
    });
  });

  it('puts an export connector only under the export key', () => {
    const registry = buildConnectorRegistry([exportConnector]);
    expect(capabilityCoverage(registry)).toEqual({
      export: ['kpi-storage-export'],
      sync: [],
      notify: [],
      record: [],
    });
  });

  it('puts a sync connector only under the sync key', () => {
    const registry = buildConnectorRegistry([syncConnector]);
    expect(capabilityCoverage(registry)).toEqual({
      export: [],
      sync: ['asana-calendar-sync'],
      notify: [],
      record: [],
    });
  });

  it('puts a notify connector only under the notify key', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(capabilityCoverage(registry)).toEqual({
      export: [],
      sync: [],
      notify: ['gh-slack-notify'],
      record: [],
    });
  });

  it('puts a record connector only under the record key', () => {
    const registry = buildConnectorRegistry([recordConnector]);
    expect(capabilityCoverage(registry)).toEqual({
      export: [],
      sync: [],
      notify: [],
      record: ['shopify-notion-record'],
    });
  });
});

// --- serviceConnectivity: source/target 判定 ------------------------------

describe('serviceConnectivity', () => {
  it('marks a pure source service asSource true and asTarget false', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(serviceConnectivity(registry, ['github'])).toEqual([
      { service: 'github', asSource: true, asTarget: false },
    ]);
  });

  it('marks a pure target service asTarget true and asSource false', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(serviceConnectivity(registry, ['slack'])).toEqual([
      { service: 'slack', asSource: false, asTarget: true },
    ]);
  });

  it('marks an isolated service false for both source and target', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(serviceConnectivity(registry, ['stripe'])).toEqual([
      { service: 'stripe', asSource: false, asTarget: false },
    ]);
  });

  it('marks a service that is both source and target true for both', () => {
    // linear is target of recordConnector and source of a linear→discord notify.
    const linearToDiscord: Connector = {
      id: 'linear-discord-notify',
      sourceService: 'linear',
      targetService: 'discord',
      capability: 'notify',
      fieldMap: [{ from: 'id', to: 'content' }],
      requiresAuth: true,
      description: 'x',
    };
    const sentryToLinear: Connector = {
      id: 'sentry-linear-record',
      sourceService: 'sentry',
      targetService: 'linear',
      capability: 'record',
      fieldMap: [{ from: 'culprit', to: 'title' }],
      requiresAuth: true,
      description: 'x',
    };
    const registry = buildConnectorRegistry([sentryToLinear, linearToDiscord]);
    expect(serviceConnectivity(registry, ['linear'])).toEqual([
      { service: 'linear', asSource: true, asTarget: true },
    ]);
  });

  it('returns entries in the input serviceIds order', () => {
    const registry = buildConnectorRegistry([notifyConnector, exportConnector]);
    expect(serviceConnectivity(registry, ['storage', 'github', 'kpi', 'slack'])).toEqual([
      { service: 'storage', asSource: false, asTarget: true },
      { service: 'github', asSource: true, asTarget: false },
      { service: 'kpi', asSource: true, asTarget: false },
      { service: 'slack', asSource: false, asTarget: true },
    ]);
  });

  it('returns an empty array for an empty serviceIds list', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(serviceConnectivity(registry, [])).toEqual([]);
  });

  it('marks every service isolated for an empty registry', () => {
    const registry = buildConnectorRegistry([]);
    expect(serviceConnectivity(registry, ['github', 'slack'])).toEqual([
      { service: 'github', asSource: false, asTarget: false },
      { service: 'slack', asSource: false, asTarget: false },
    ]);
  });
});

// --- findUnreachableServices: 入力順抽出 ----------------------------------

describe('findUnreachableServices', () => {
  it('returns services that are neither source nor target, in input order', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(findUnreachableServices(registry, ['stripe', 'github', 'drive', 'slack'])).toEqual([
      'stripe',
      'drive',
    ]);
  });

  it('excludes a service that is only a source', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(findUnreachableServices(registry, ['github'])).toEqual([]);
  });

  it('excludes a service that is only a target', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(findUnreachableServices(registry, ['slack'])).toEqual([]);
  });

  it('returns all services for an empty registry', () => {
    const registry = buildConnectorRegistry([]);
    expect(findUnreachableServices(registry, ['github', 'slack', 'stripe'])).toEqual([
      'github',
      'slack',
      'stripe',
    ]);
  });

  it('returns an empty array for an empty serviceIds list', () => {
    const registry = buildConnectorRegistry([notifyConnector]);
    expect(findUnreachableServices(registry, [])).toEqual([]);
  });

  it('finds catalog services unreachable from the catalog registry', () => {
    // home / settings never appear in any catalog connector.
    expect(findUnreachableServices(CATALOG_REGISTRY, ['github', 'home', 'slack', 'settings'])).toEqual([
      'home',
      'settings',
    ]);
  });
});

// --- pluginPermissionGaps: 権限あり/なし両方 ------------------------------

describe('pluginPermissionGaps', () => {
  it('returns no gaps when a plugin holds the required permission', () => {
    const plugin: PluginManifest = {
      id: 'notify-ok',
      version: '1.0.0',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector],
    };
    const runtime = buildPluginRuntime([plugin]);
    expect(pluginPermissionGaps(runtime)).toEqual([]);
  });

  it('reports a gap when the plugin lacks the capability permission', () => {
    const plugin: PluginManifest = {
      id: 'notify-missing',
      version: '1.0.0',
      permissions: ['storage:library'],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector],
    };
    const runtime = buildPluginRuntime([plugin]);
    expect(pluginPermissionGaps(runtime)).toEqual([
      {
        pluginId: 'notify-missing',
        connectorId: 'gh-slack-notify',
        requiredPermission: 'network:proxy',
      },
    ]);
  });

  it('reports per-connector gaps using the connector capability permission', () => {
    // write:action だけ: record(write:action)=OK, export(storage:library)=gap, sync(write:action)=OK。
    const plugin: PluginManifest = {
      id: 'mixed',
      version: '1.0.0',
      permissions: ['write:action'],
      hooks: ['onActionInvoke'],
      connectors: [recordConnector, exportConnector, syncConnector],
    };
    const runtime = buildPluginRuntime([plugin]);
    expect(pluginPermissionGaps(runtime)).toEqual([
      {
        pluginId: 'mixed',
        connectorId: 'kpi-storage-export',
        requiredPermission: 'storage:library',
      },
    ]);
  });

  it('preserves plugin order then connector order across plugins', () => {
    const first: PluginManifest = {
      id: 'first',
      version: '1.0.0',
      permissions: [],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector, exportConnector],
    };
    const second: PluginManifest = {
      id: 'second',
      version: '1.0.0',
      permissions: [],
      hooks: ['onActionInvoke'],
      connectors: [recordConnector],
    };
    const runtime = buildPluginRuntime([first, second]);
    expect(pluginPermissionGaps(runtime)).toEqual([
      {
        pluginId: 'first',
        connectorId: 'gh-slack-notify',
        requiredPermission: 'network:proxy',
      },
      {
        pluginId: 'first',
        connectorId: 'kpi-storage-export',
        requiredPermission: 'storage:library',
      },
      {
        pluginId: 'second',
        connectorId: 'shopify-notion-record',
        requiredPermission: 'write:action',
      },
    ]);
  });

  it('returns an empty array for an empty runtime', () => {
    const runtime = buildPluginRuntime([]);
    expect(pluginPermissionGaps(runtime)).toEqual([]);
  });

  it('returns an empty array for a plugin with no connectors', () => {
    const plugin: PluginManifest = {
      id: 'no-connectors',
      version: '1.0.0',
      permissions: [],
      hooks: ['onActionInvoke'],
      connectors: [],
    };
    const runtime = buildPluginRuntime([plugin]);
    expect(pluginPermissionGaps(runtime)).toEqual([]);
  });
});

// --- connectorHealthReport: 集約全文照合 ----------------------------------

describe('connectorHealthReport (fixture)', () => {
  it('aggregates counts, coverage, unreachable services and permission gaps', () => {
    const registry = buildConnectorRegistry([notifyConnector, exportConnector]);
    const okPlugin: PluginManifest = {
      id: 'ok',
      version: '1.0.0',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector],
    };
    const gapPlugin: PluginManifest = {
      id: 'gap',
      version: '1.0.0',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [exportConnector],
    };
    const runtime = buildPluginRuntime([okPlugin, gapPlugin]);
    expect(
      connectorHealthReport(registry, runtime, ['github', 'slack', 'kpi', 'storage', 'stripe']),
    ).toEqual({
      totalConnectors: 2,
      totalPlugins: 2,
      capabilityCoverage: {
        export: ['kpi-storage-export'],
        sync: [],
        notify: ['gh-slack-notify'],
        record: [],
      },
      unreachableServices: ['stripe'],
      permissionGaps: [
        {
          pluginId: 'gap',
          connectorId: 'kpi-storage-export',
          requiredPermission: 'storage:library',
        },
      ],
    });
  });

  it('returns a valid empty report for empty registry, runtime and serviceIds', () => {
    const registry = buildConnectorRegistry([]);
    const runtime = buildPluginRuntime([]);
    expect(connectorHealthReport(registry, runtime, [])).toEqual({
      totalConnectors: 0,
      totalPlugins: 0,
      capabilityCoverage: {
        export: [],
        sync: [],
        notify: [],
        record: [],
      },
      unreachableServices: [],
      permissionGaps: [],
    });
  });

  it('counts connectors and plugins independently', () => {
    const registry: ConnectorRegistry = buildConnectorRegistry([
      notifyConnector,
      exportConnector,
      recordConnector,
    ]);
    const runtime: PluginRuntime = buildPluginRuntime([
      {
        id: 'p',
        version: '1.0.0',
        permissions: ['network:proxy'],
        hooks: ['onActionInvoke'],
        connectors: [notifyConnector],
      },
    ]);
    const report = connectorHealthReport(registry, runtime, []);
    expect(report.totalConnectors).toBe(3);
    expect(report.totalPlugins).toBe(1);
  });
});

describe('connectorHealthReport (CATALOG_REGISTRY)', () => {
  it('aggregates the real catalog with an empty runtime', () => {
    const runtime = buildPluginRuntime([]);
    expect(
      connectorHealthReport(CATALOG_REGISTRY, runtime, ['github', 'slack', 'home']),
    ).toEqual({
      totalConnectors: 8,
      totalPlugins: 0,
      capabilityCoverage: {
        export: ['stripe-to-drive-export', 'kpi-to-storage-export'],
        sync: ['asana-to-calendar-sync'],
        notify: ['github-to-slack-notify', 'salesforce-to-gmail-notify', 'linear-to-discord-notify'],
        record: ['sentry-to-linear-record', 'shopify-to-notion-record'],
      },
      unreachableServices: ['home'],
      permissionGaps: [],
    });
  });
});
