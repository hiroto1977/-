import { describe, expect, it } from 'vitest';
import {
  PLUGIN_CATALOG,
  PLUGIN_RUNTIME,
  LOCAL_STORAGE_ARCHIVER,
  LOCAL_LIBRARY_RECORDER,
} from '../pluginCatalog';
import {
  FREE_EXPORT_CONNECTORS,
  FREE_RECORD_CONNECTORS,
} from '../freeConnectors';
import {
  buildPluginRuntime,
  resolveHookPlan,
  planPermittedSteps,
  pluginIds,
  requiredPermissionFor,
} from '../pluginRuntime';
import { isPluginValid, validatePlugin } from '../connectorRegistry';

// --- カタログの起動時不変条件 --------------------------------------------

describe('PLUGIN_CATALOG', () => {
  it('declares exactly 2 plugins in the documented input order', () => {
    expect(PLUGIN_CATALOG.map((p) => p.id)).toEqual([
      'local-storage-archiver',
      'local-library-recorder',
    ]);
  });

  it('bundles the export connectors into the archiver and the record connectors into the recorder', () => {
    expect(LOCAL_STORAGE_ARCHIVER.connectors).toBe(FREE_EXPORT_CONNECTORS);
    expect(LOCAL_LIBRARY_RECORDER.connectors).toBe(FREE_RECORD_CONNECTORS);
  });

  it('every plugin passes validatePlugin with zero errors (startup invariant)', () => {
    for (const p of PLUGIN_CATALOG) {
      expect(validatePlugin(p)).toEqual([]);
      expect(isPluginValid(p)).toBe(true);
    }
  });

  it('can be built into a runtime without throwing (loud-fail invariant)', () => {
    expect(() => buildPluginRuntime(PLUGIN_CATALOG)).not.toThrow();
  });

  it('declares valid semver versions', () => {
    expect(LOCAL_STORAGE_ARCHIVER.version).toBe('1.0.0');
    expect(LOCAL_LIBRARY_RECORDER.version).toBe('1.0.0');
  });

  it('grants the archiver storage:library (export) and the recorder write:action (record)', () => {
    expect(LOCAL_STORAGE_ARCHIVER.permissions).toContain('storage:library');
    expect(LOCAL_LIBRARY_RECORDER.permissions).toContain('write:action');
  });

  it('declares each bundled capability with exactly the permission it requires (no permission gaps)', () => {
    for (const p of PLUGIN_CATALOG) {
      for (const c of p.connectors) {
        expect(p.permissions).toContain(requiredPermissionFor(c.capability));
      }
    }
  });
});

// --- PLUGIN_RUNTIME ------------------------------------------------------

describe('PLUGIN_RUNTIME', () => {
  it('indexes every plugin by id and preserves input order', () => {
    expect(pluginIds(PLUGIN_RUNTIME)).toEqual(['local-storage-archiver', 'local-library-recorder']);
    for (const p of PLUGIN_CATALOG) {
      expect(PLUGIN_RUNTIME.byId.get(p.id)).toBe(p);
    }
  });

  it('dispatches all 7 export connectors permitted on onSnapshotLoad', () => {
    const steps = resolveHookPlan(PLUGIN_RUNTIME, 'onSnapshotLoad');
    expect(steps.map((s) => s.connectorId)).toEqual(
      FREE_EXPORT_CONNECTORS.map((c) => c.id),
    );
    expect(steps.every((s) => s.permitted)).toBe(true);
    // 全手順が permitted なので permitted 抽出後も件数は変わらない。
    expect(planPermittedSteps(steps)).toHaveLength(FREE_EXPORT_CONNECTORS.length);
  });

  it('dispatches all 3 record connectors permitted on onActionInvoke', () => {
    const steps = resolveHookPlan(PLUGIN_RUNTIME, 'onActionInvoke');
    expect(steps.map((s) => s.connectorId)).toEqual(
      FREE_RECORD_CONNECTORS.map((c) => c.id),
    );
    expect(steps.every((s) => s.permitted)).toBe(true);
    expect(steps.every((s) => s.requiresAuth === false)).toBe(true);
  });

  it('returns no steps for an event no plugin subscribes to', () => {
    expect(resolveHookPlan(PLUGIN_RUNTIME, 'onRender')).toEqual([]);
  });

  it('produces only fully-permitted steps across the whole catalog (free = ready to use)', () => {
    const all = [
      ...resolveHookPlan(PLUGIN_RUNTIME, 'onSnapshotLoad'),
      ...resolveHookPlan(PLUGIN_RUNTIME, 'onActionInvoke'),
    ];
    expect(all).toHaveLength(10);
    expect(planPermittedSteps(all)).toHaveLength(all.length);
  });
});
