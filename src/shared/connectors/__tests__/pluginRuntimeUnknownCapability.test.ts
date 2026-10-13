/**
 * **表に無い capability の手順は、権限が全部揃っていても計画に残り `permitted:false`** (2026-10-01 · パス 502)。
 *
 * `resolveHookPlan` は権限の無い手順を計画から**除外せず**、`permitted:false` として明示する
 * (モジュール JSDoc「除外せず明示」)。表に無い capability は `requiredPermissionFor` が `null` を返す
 * (パス 235 の床) が、`buildPluginRuntime` が境界で capability を弾くので、組み立てた runtime ではこの
 * 枝に来ない —— 来るのは境界を緩めた日で、そのとき**許可されてしまう**ことだけは起きてはいけない。
 *
 * 全掃引 #180 の生存 1 件 (`permitted: permission !== null && isPermitted(…)` の `permission !== null`) は
 * 観測できる差が無い等価変異だった: `null` を `isPermitted` へ渡しても許可リストに無いので必ず false になる。
 * そこで判定を外すのではなく形を消し、`null` は番兵の語 `UNKNOWN_CAPABILITY_PERMISSION` で引く形にした。
 * この検査は、その形でも**「除外せず・許可せず」が値ごと守られている**ことと、番兵の語を権限として
 * 宣言したプラグインでも許可されないこと (形を消す前提) を留める。runtime は `buildPluginRuntime` を通さず**直に組む**。
 */
import { describe, expect, it } from 'vitest';
import {
  PLUGIN_PERMISSIONS,
  type Connector,
  type ConnectorCapability,
  type PluginManifest,
  type PluginPermission,
} from '../connectorRegistry';
import { UNKNOWN_CAPABILITY_PERMISSION, planPermittedSteps, resolveHookPlan, type PluginRuntime } from '../pluginRuntime';

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

const holdsEverything: PluginManifest = {
  id: 'all-permissions',
  version: '1.0.0',
  permissions: [...PLUGIN_PERMISSIONS],
  hooks: ['onActionInvoke'],
  connectors: [
    connector('known', 'notify'),
    connector('teleport-c', 'teleport'),
    connector('proto-c', 'constructor'),
    connector('to-string-c', 'toString'),
    connector('dunder-c', '__proto__'),
  ],
};

describe('resolveHookPlan — 表に無い capability の手順', () => {
  it('★ 権限を全部持っていても、手順は計画に残り (除外せず) permitted:false。入力順・欄は値ごと', () => {
    const steps = resolveHookPlan(runtimeOf(holdsEverything), 'onActionInvoke');
    expect(steps).toEqual(
      [
        ['known', 'notify', true],
        ['teleport-c', 'teleport', false],
        ['proto-c', 'constructor', false],
        ['to-string-c', 'toString', false],
        ['dunder-c', '__proto__', false],
      ].map(([connectorId, capability, permitted]) => ({
        pluginId: 'all-permissions',
        hook: 'onActionInvoke',
        connectorId,
        sourceService: 'github',
        targetService: 'slack',
        capability,
        requiresAuth: false,
        permitted,
      })),
    );
  });

  it('★ planPermittedSteps (実行直前の関門) は、表に無い capability の手順を落として表に在る手順だけを残す', () => {
    const steps = resolveHookPlan(runtimeOf(holdsEverything), 'onActionInvoke');
    expect(planPermittedSteps(steps).map((s) => s.connectorId)).toEqual(['known']);
  });

  it('★ 番兵の語を権限として宣言したプラグインでも、表に無い capability は許可されない (形を消す前提)', () => {
    // `null` を番兵の語で引くので、許可リストに無い語は宣言されていても false であることが安全の根拠になる。
    expect(PLUGIN_PERMISSIONS as readonly string[]).not.toContain(UNKNOWN_CAPABILITY_PERMISSION);
    const declaresSentinel: PluginManifest = {
      ...holdsEverything,
      id: 'declares-sentinel',
      permissions: [...PLUGIN_PERMISSIONS, UNKNOWN_CAPABILITY_PERMISSION as PluginPermission],
    };
    const steps = resolveHookPlan(runtimeOf(declaresSentinel), 'onActionInvoke');
    expect(steps.map((s) => [s.connectorId, s.permitted])).toEqual([
      ['known', true],
      ['teleport-c', false],
      ['proto-c', false],
      ['to-string-c', false],
      ['dunder-c', false],
    ]);
  });

  it('対照: 表に在る capability は、権限があれば許可・無ければ不許可 (針が的に当たる標本)', () => {
    const onlyKnown: PluginManifest = { ...holdsEverything, id: 'only-known', connectors: [connector('known', 'notify')] };
    expect(resolveHookPlan(runtimeOf(onlyKnown), 'onActionInvoke').map((s) => s.permitted)).toEqual([true]);
    const lacking: PluginManifest = { ...onlyKnown, id: 'lacking', permissions: [] };
    expect(resolveHookPlan(runtimeOf(lacking), 'onActionInvoke').map((s) => s.permitted)).toEqual([false]);
  });
});
