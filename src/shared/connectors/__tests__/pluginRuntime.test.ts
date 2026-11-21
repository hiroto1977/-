import { describe, expect, it } from 'vitest';
import {
  buildPluginRuntime,
  listPluginsForEvent,
  planPermittedSteps,
  pluginIds,
  requiredPermissionFor,
  resolveHookPlan,
  type HookDispatchStep,
  type PluginRuntime,
} from '../pluginRuntime';
import type { Connector, PluginManifest } from '../connectorRegistry';

// --- テスト用フィクスチャ ------------------------------------------------

/** notify コネクタ (要権限: network:proxy)。 */
const notifyConnector: Connector = {
  id: 'github-to-slack-notify',
  sourceService: 'github',
  targetService: 'slack',
  capability: 'notify',
  fieldMap: [{ from: 'title', to: 'text' }],
  requiresAuth: true,
  description: 'GitHub の通知を Slack へ',
};

/** export コネクタ (要権限: storage:library, 認証不要)。 */
const exportConnector: Connector = {
  id: 'kpi-to-storage-export',
  sourceService: 'kpi',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [{ from: 'metric', to: 'key' }],
  requiresAuth: false,
  description: 'KPI をストレージへ',
};

/** record コネクタ (要権限: write:action)。 */
const recordConnector: Connector = {
  id: 'shopify-to-notion-record',
  sourceService: 'shopify',
  targetService: 'notion',
  capability: 'record',
  fieldMap: [{ from: 'orderNumber', to: 'Title' }],
  requiresAuth: true,
  description: 'Shopify の注文を Notion へ',
};

/** sync コネクタ (要権限: write:action)。 */
const syncConnector: Connector = {
  id: 'asana-to-calendar-sync',
  sourceService: 'asana',
  targetService: 'calendar',
  capability: 'sync',
  fieldMap: [{ from: 'name', to: 'summary' }],
  requiresAuth: true,
  description: 'Asana のタスクを Calendar へ',
};

/** notify 権限あり・onActionInvoke で発火する妥当な manifest。 */
const notifyPlugin: PluginManifest = {
  id: 'notify-plugin',
  version: '1.0.0',
  permissions: ['network:proxy'],
  hooks: ['onActionInvoke'],
  connectors: [notifyConnector],
};

/** notify 権限なし (storage:library のみ)・同じく onActionInvoke で発火。 */
const unprivilegedNotifyPlugin: PluginManifest = {
  id: 'unprivileged-notify-plugin',
  version: '2.1.3',
  permissions: ['storage:library'],
  hooks: ['onActionInvoke'],
  connectors: [notifyConnector],
};

/** storage 権限あり・onSnapshotLoad で発火・export コネクタ同梱。 */
const exportPlugin: PluginManifest = {
  id: 'export-plugin',
  version: '0.3.0',
  permissions: ['storage:library'],
  hooks: ['onSnapshotLoad'],
  connectors: [exportConnector],
};

// --- buildPluginRuntime: 妥当系 ------------------------------------------

describe('buildPluginRuntime', () => {
  it('returns a runtime preserving input order in `all`', () => {
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin]);
    expect(runtime.all).toEqual([notifyPlugin, exportPlugin]);
  });

  it('indexes plugins by id in `byId`', () => {
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin]);
    expect(runtime.byId.get('notify-plugin')).toBe(notifyPlugin);
    expect(runtime.byId.get('export-plugin')).toBe(exportPlugin);
  });

  it('byId has exactly one entry per input plugin', () => {
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin]);
    expect(runtime.byId.size).toBe(2);
  });

  it('byId lookup of an unregistered id is undefined', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(runtime.byId.get('export-plugin')).toBeUndefined();
  });

  it('accepts an empty manifest list and returns empty runtime', () => {
    const runtime = buildPluginRuntime([]);
    expect(runtime.all).toEqual([]);
    expect(runtime.byId.size).toBe(0);
  });

  it('does not throw for a list of valid manifests', () => {
    expect(() => buildPluginRuntime([notifyPlugin, exportPlugin])).not.toThrow();
  });
});

// --- buildPluginRuntime: 検証エラー集約 throw ----------------------------

describe('buildPluginRuntime validation', () => {
  it('throws with aggregated message for an invalid semver version', () => {
    const bad: PluginManifest = {
      id: 'bad-version',
      version: '1.0',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    expect(() => buildPluginRuntime([bad])).toThrow(
      '[plugin-runtime] 1 validation error(s): plugin "bad-version": invalid semver version "1.0"',
    );
  });

  it('throws for an empty plugin id with #index label', () => {
    const bad: PluginManifest = {
      id: '',
      version: '1.0.0',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    expect(() => buildPluginRuntime([bad])).toThrow(
      '[plugin-runtime] 1 validation error(s): plugin "#0": plugin has an empty id',
    );
  });

  it('does not double-count an empty id as a duplicate', () => {
    const a: PluginManifest = {
      id: '',
      version: '1.0.0',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    const b: PluginManifest = {
      id: '',
      version: '2.0.0',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    expect(() => buildPluginRuntime([a, b])).toThrow(
      '[plugin-runtime] 2 validation error(s): plugin "#0": plugin has an empty id; plugin "#1": plugin has an empty id',
    );
  });

  it('throws for a duplicate plugin id', () => {
    const dup: PluginManifest = {
      id: 'notify-plugin',
      version: '9.9.9',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector],
    };
    expect(() => buildPluginRuntime([notifyPlugin, dup])).toThrow(
      '[plugin-runtime] 1 validation error(s): duplicate plugin id "notify-plugin"',
    );
  });

  it('does not flag the first occurrence of an id as duplicate', () => {
    expect(() => buildPluginRuntime([notifyPlugin, exportPlugin])).not.toThrow();
  });

  it('aggregates multiple errors across multiple manifests in order', () => {
    const badVersion: PluginManifest = {
      id: 'p1',
      version: 'x.y.z',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    const badPermission: PluginManifest = {
      id: 'p2',
      version: '1.0.0',
      permissions: ['network:proxy', 'bogus:perm'],
      hooks: [],
      connectors: [],
    };
    expect(() => buildPluginRuntime([badVersion, badPermission])).toThrow(
      '[plugin-runtime] 2 validation error(s): plugin "p1": invalid semver version "x.y.z"; plugin "p2": unknown permission "bogus:perm"',
    );
  });

  it('attaches the aggregated messages array to error.errors', () => {
    const badVersion: PluginManifest = {
      id: 'p1',
      version: 'x.y.z',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    const dup: PluginManifest = {
      id: 'p1',
      version: '1.0.0',
      permissions: [],
      hooks: [],
      connectors: [],
    };
    let caught: (Error & { errors?: string[] }) | undefined;
    try {
      buildPluginRuntime([badVersion, dup]);
    } catch (e) {
      caught = e as Error & { errors?: string[] };
    }
    expect(caught?.errors).toEqual([
      'plugin "p1": invalid semver version "x.y.z"',
      'duplicate plugin id "p1"',
    ]);
  });

  it('prefixes connector errors with the plugin label', () => {
    const badConnector: Connector = {
      id: '',
      sourceService: 'github',
      targetService: 'slack',
      capability: 'notify',
      fieldMap: [],
      requiresAuth: true,
      description: 'x',
    };
    const plugin: PluginManifest = {
      id: 'with-bad-connector',
      version: '1.0.0',
      permissions: [],
      hooks: [],
      connectors: [badConnector],
    };
    expect(() => buildPluginRuntime([plugin])).toThrow(
      '[plugin-runtime] 1 validation error(s): plugin "with-bad-connector": connector "#0": connector #0 has an empty id',
    );
  });
});

// --- requiredPermissionFor: 全 capability ホワイトリスト -----------------

describe('requiredPermissionFor', () => {
  it('maps export to storage:library', () => {
    expect(requiredPermissionFor('export')).toBe('storage:library');
  });

  it('maps sync to write:action', () => {
    expect(requiredPermissionFor('sync')).toBe('write:action');
  });

  it('maps notify to network:proxy', () => {
    expect(requiredPermissionFor('notify')).toBe('network:proxy');
  });

  it('maps record to write:action', () => {
    expect(requiredPermissionFor('record')).toBe('write:action');
  });
});

// --- resolveHookPlan: 入力順・permitted 判定 ------------------------------

describe('resolveHookPlan', () => {
  it('returns a single fully-populated step for a permitted plugin', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(resolveHookPlan(runtime, 'onActionInvoke')).toEqual([
      {
        pluginId: 'notify-plugin',
        hook: 'onActionInvoke',
        connectorId: 'github-to-slack-notify',
        sourceService: 'github',
        targetService: 'slack',
        capability: 'notify',
        requiresAuth: true,
        permitted: true,
      },
    ]);
  });

  it('marks a step permitted:false when the plugin lacks the required permission', () => {
    const runtime = buildPluginRuntime([unprivilegedNotifyPlugin]);
    expect(resolveHookPlan(runtime, 'onActionInvoke')).toEqual([
      {
        pluginId: 'unprivileged-notify-plugin',
        hook: 'onActionInvoke',
        connectorId: 'github-to-slack-notify',
        sourceService: 'github',
        targetService: 'slack',
        capability: 'notify',
        requiresAuth: true,
        permitted: false,
      },
    ]);
  });

  it('does not drop the unprivileged step (it is observable, not excluded)', () => {
    const runtime = buildPluginRuntime([unprivilegedNotifyPlugin]);
    expect(resolveHookPlan(runtime, 'onActionInvoke')).toHaveLength(1);
  });

  it('returns an empty array when no plugin reacts to the event', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(resolveHookPlan(runtime, 'onSnapshotLoad')).toEqual([]);
  });

  it('returns an empty array for an unknown event name (no throw)', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(resolveHookPlan(runtime, 'totally-unknown-event')).toEqual([]);
  });

  it('preserves plugin input order across multiple reacting plugins', () => {
    const second: PluginManifest = {
      id: 'second-notify',
      version: '1.2.0',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [recordConnector],
    };
    const runtime = buildPluginRuntime([notifyPlugin, second]);
    expect(resolveHookPlan(runtime, 'onActionInvoke').map((s) => s.pluginId)).toEqual([
      'notify-plugin',
      'second-notify',
    ]);
  });

  it('preserves connector input order within a single plugin', () => {
    const multi: PluginManifest = {
      id: 'multi-connector',
      version: '1.0.0',
      permissions: ['network:proxy', 'write:action'],
      hooks: ['onActionInvoke'],
      connectors: [notifyConnector, recordConnector],
    };
    const runtime = buildPluginRuntime([multi]);
    expect(resolveHookPlan(runtime, 'onActionInvoke').map((s) => s.connectorId)).toEqual([
      'github-to-slack-notify',
      'shopify-to-notion-record',
    ]);
  });

  it('skips plugins whose hooks do not include the event', () => {
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin]);
    expect(resolveHookPlan(runtime, 'onSnapshotLoad').map((s) => s.pluginId)).toEqual([
      'export-plugin',
    ]);
  });

  it('evaluates permitted per-connector using the connector capability', () => {
    // write:action だけ持つプラグイン: record(write:action)=true, export(storage:library)=false。
    const mixed: PluginManifest = {
      id: 'mixed-caps',
      version: '1.0.0',
      permissions: ['write:action'],
      hooks: ['onActionInvoke'],
      connectors: [recordConnector, exportConnector, syncConnector],
    };
    const runtime = buildPluginRuntime([mixed]);
    expect(
      resolveHookPlan(runtime, 'onActionInvoke').map((s) => ({
        connectorId: s.connectorId,
        capability: s.capability,
        permitted: s.permitted,
      })),
    ).toEqual([
      { connectorId: 'shopify-to-notion-record', capability: 'record', permitted: true },
      { connectorId: 'kpi-to-storage-export', capability: 'export', permitted: false },
      { connectorId: 'asana-to-calendar-sync', capability: 'sync', permitted: true },
    ]);
  });

  it('returns no steps for a reacting plugin that bundles no connectors', () => {
    const noConnectors: PluginManifest = {
      id: 'no-connectors',
      version: '1.0.0',
      permissions: ['network:proxy'],
      hooks: ['onActionInvoke'],
      connectors: [],
    };
    const runtime = buildPluginRuntime([noConnectors]);
    expect(resolveHookPlan(runtime, 'onActionInvoke')).toEqual([]);
  });
});

// --- planPermittedSteps: 抽出 --------------------------------------------

describe('planPermittedSteps', () => {
  it('keeps only steps with permitted true and preserves order', () => {
    const runtime = buildPluginRuntime([notifyPlugin, unprivilegedNotifyPlugin]);
    const plan = resolveHookPlan(runtime, 'onActionInvoke');
    expect(planPermittedSteps(plan)).toEqual([
      {
        pluginId: 'notify-plugin',
        hook: 'onActionInvoke',
        connectorId: 'github-to-slack-notify',
        sourceService: 'github',
        targetService: 'slack',
        capability: 'notify',
        requiresAuth: true,
        permitted: true,
      },
    ]);
  });

  it('returns an empty array when no step is permitted', () => {
    const runtime = buildPluginRuntime([unprivilegedNotifyPlugin]);
    const plan = resolveHookPlan(runtime, 'onActionInvoke');
    expect(planPermittedSteps(plan)).toEqual([]);
  });

  it('returns all steps when every step is permitted', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    const plan = resolveHookPlan(runtime, 'onActionInvoke');
    expect(planPermittedSteps(plan)).toEqual(plan);
  });

  it('preserves order across a mix of permitted and denied steps', () => {
    const permittedStep: HookDispatchStep = {
      pluginId: 'a',
      hook: 'onActionInvoke',
      connectorId: 'c1',
      sourceService: 'github',
      targetService: 'slack',
      capability: 'notify',
      requiresAuth: true,
      permitted: true,
    };
    const deniedStep: HookDispatchStep = {
      pluginId: 'b',
      hook: 'onActionInvoke',
      connectorId: 'c2',
      sourceService: 'github',
      targetService: 'slack',
      capability: 'notify',
      requiresAuth: true,
      permitted: false,
    };
    const permittedStep2: HookDispatchStep = {
      pluginId: 'c',
      hook: 'onActionInvoke',
      connectorId: 'c3',
      sourceService: 'kpi',
      targetService: 'storage',
      capability: 'export',
      requiresAuth: false,
      permitted: true,
    };
    expect(planPermittedSteps([permittedStep, deniedStep, permittedStep2])).toEqual([
      permittedStep,
      permittedStep2,
    ]);
  });
});

// --- listPluginsForEvent / pluginIds: 入力順保持 -------------------------

describe('listPluginsForEvent', () => {
  it('returns reacting plugins in input order', () => {
    const second: PluginManifest = {
      id: 'second-action',
      version: '1.0.0',
      permissions: [],
      hooks: ['onActionInvoke'],
      connectors: [],
    };
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin, second]);
    expect(listPluginsForEvent(runtime, 'onActionInvoke')).toEqual([notifyPlugin, second]);
  });

  it('returns an empty array for an unknown event name (no throw)', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(listPluginsForEvent(runtime, 'nope')).toEqual([]);
  });

  it('returns an empty array when no plugin reacts to the event', () => {
    const runtime = buildPluginRuntime([notifyPlugin]);
    expect(listPluginsForEvent(runtime, 'onSnapshotLoad')).toEqual([]);
  });
});

describe('pluginIds', () => {
  it('returns all plugin ids in input order', () => {
    const runtime = buildPluginRuntime([notifyPlugin, exportPlugin]);
    expect(pluginIds(runtime)).toEqual(['notify-plugin', 'export-plugin']);
  });

  it('returns an empty array for an empty runtime', () => {
    const runtime: PluginRuntime = buildPluginRuntime([]);
    expect(pluginIds(runtime)).toEqual([]);
  });
});
