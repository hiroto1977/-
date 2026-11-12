/**
 * **表に無い capability は、権限が全部揃っていても「欠落」として載る** (2026-09-30 · パス 502)。
 *
 * `pluginPermissionGaps` の `requiredPermission === null` の枝は、全掃引 #179 で
 * **どの検査もそこへ来ない**ままだった (未到達 2 + 生存 1)。`requiredPermissionFor` は表に無い
 * capability を `null` と答える (パス 235 の床 —— 素の添字は `'constructor'` に `Object` を返していた)
 * が、`buildPluginRuntime` が境界で capability を弾くので、**組み立てた runtime ではこの枝に来ない**。
 * 来るのは境界を緩めた日で、そのとき「権限の表示が壊れた」にならないよう床が在る —— なら
 * 床そのものを留める。runtime は `buildPluginRuntime` を通さず**直に組む** (通すと弾かれる)。
 *
 * `requiredPermission` は `UNKNOWN_CAPABILITY_PERMISSION` (どの実在の権限でもない語) で、
 * 関数や `undefined` ではない。
 */
import { describe, expect, it } from 'vitest';
import { pluginPermissionGaps } from '../connectorHealth';
import {
  PLUGIN_PERMISSIONS,
  type Connector,
  type ConnectorCapability,
  type PluginManifest,
} from '../connectorRegistry';
import { UNKNOWN_CAPABILITY_PERMISSION, type PluginRuntime } from '../pluginRuntime';

const connector = (id: string, capability: string): Connector => ({
  id,
  sourceService: 'github',
  targetService: 'slack',
  capability: capability as ConnectorCapability,
  fieldMap: [{ from: 'a', to: 'b' }],
  requiresAuth: false,
  description: 'test',
});

/** `buildPluginRuntime` を通さずに runtime を直に組む (通すと表に無い capability は弾かれる)。 */
const runtimeOf = (plugin: PluginManifest): PluginRuntime => ({ byId: new Map([[plugin.id, plugin]]), all: [plugin] });

describe('pluginPermissionGaps — 表に無い capability', () => {
  const holdsEverything: PluginManifest = {
    id: 'all-permissions',
    version: '1.0.0',
    permissions: [...PLUGIN_PERMISSIONS],
    hooks: ['onActionInvoke'],
    connectors: [connector('known', 'notify'), connector('teleport-c', 'teleport'), connector('proto-c', 'constructor')],
  };

  it('★ 権限を全部持っていても、表に無い capability のコネクタだけが欠落として載る (入力順)', () => {
    expect(pluginPermissionGaps(runtimeOf(holdsEverything))).toEqual([
      { pluginId: 'all-permissions', connectorId: 'teleport-c', requiredPermission: UNKNOWN_CAPABILITY_PERMISSION },
      { pluginId: 'all-permissions', connectorId: 'proto-c', requiredPermission: UNKNOWN_CAPABILITY_PERMISSION },
    ]);
  });

  it('★ 欠落の権限名は文字列で、実在するどの権限でもない (関数や undefined を画面へ流さない)', () => {
    const gaps = pluginPermissionGaps(runtimeOf(holdsEverything));
    for (const g of gaps) {
      expect(typeof g.requiredPermission).toBe('string');
      expect(PLUGIN_PERMISSIONS as readonly string[]).not.toContain(g.requiredPermission);
    }
  });

  it('対照: 表に在る capability は、権限があれば欠落に載らない (針が的に当たる標本)', () => {
    const onlyKnown: PluginManifest = { ...holdsEverything, id: 'only-known', connectors: [connector('known', 'notify')] };
    expect(pluginPermissionGaps(runtimeOf(onlyKnown))).toEqual([]);
    const lacking: PluginManifest = { ...onlyKnown, id: 'lacking', permissions: [] };
    expect(pluginPermissionGaps(runtimeOf(lacking))).toEqual([
      { pluginId: 'lacking', connectorId: 'known', requiredPermission: 'network:proxy' },
    ]);
  });
});
