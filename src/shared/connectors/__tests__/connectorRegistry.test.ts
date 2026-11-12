import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_CAPABILITIES,
  PLUGIN_PERMISSIONS,
  PLUGIN_HOOKS,
  isConnectorCapability,
  validateConnectors,
  buildConnectorRegistry,
  resolveConnectors,
  applyFieldMap,
  isValidSemver,
  validatePlugin,
  isPluginValid,
  isPermitted,
  type Connector,
  type FieldMap,
  type PluginManifest,
} from '../connectorRegistry';

// --- fixtures ------------------------------------------------------------

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: 'shopify-to-slack',
    sourceService: 'shopify',
    targetService: 'slack',
    capability: 'notify',
    fieldMap: [],
    requiresAuth: true,
    description: 'Shopify order → Slack notification',
    ...overrides,
  };
}

function makePlugin(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'order-sync',
    version: '1.2.3',
    permissions: ['read:snapshot', 'write:action'],
    hooks: ['onActionInvoke'],
    connectors: [makeConnector()],
    ...overrides,
  };
}

// --- capability whitelist ------------------------------------------------

describe('CONNECTOR_CAPABILITIES', () => {
  it('contains exactly the four documented capabilities', () => {
    expect([...CONNECTOR_CAPABILITIES]).toEqual(['export', 'sync', 'notify', 'record']);
  });
});

describe('isConnectorCapability', () => {
  it('returns true for every whitelisted capability', () => {
    for (const cap of CONNECTOR_CAPABILITIES) {
      expect(isConnectorCapability(cap)).toBe(true);
    }
  });

  it('rejects unknown / mis-cased capability strings', () => {
    expect(isConnectorCapability('transform')).toBe(false);
    expect(isConnectorCapability('EXPORT')).toBe(false);
    expect(isConnectorCapability('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isConnectorCapability(undefined)).toBe(false);
    expect(isConnectorCapability(null)).toBe(false);
    expect(isConnectorCapability(0)).toBe(false);
    expect(isConnectorCapability({})).toBe(false);
    expect(isConnectorCapability(['sync'])).toBe(false);
  });

  it('rejects prototype-chain lookups', () => {
    expect(isConnectorCapability('__proto__')).toBe(false);
    expect(isConnectorCapability('constructor')).toBe(false);
    expect(isConnectorCapability('hasOwnProperty')).toBe(false);
  });
});

// --- validateConnectors --------------------------------------------------

describe('validateConnectors', () => {
  it('returns no errors for a valid, unique connector set', () => {
    const errors = validateConnectors([
      makeConnector(),
      makeConnector({ id: 'shopify-to-notion', targetService: 'notion', capability: 'record' }),
    ]);
    expect(errors).toEqual([]);
  });

  it('flags an empty id with code empty-id and a #index label', () => {
    const errors = validateConnectors([makeConnector({ id: '' })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('empty-id');
    expect(errors[0]!.connectorId).toBe('#0');
    expect(errors[0]!.message).toBe('connector #0 has an empty id');
  });

  it('uses the real id (not #index) in labels when id is present', () => {
    const errors = validateConnectors([
      makeConnector({ id: 'bad', sourceService: 'nope' as Connector['sourceService'] }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('unknown-source');
    expect(errors[0]!.connectorId).toBe('bad');
    expect(errors[0]!.message).toBe('connector "bad" has unknown sourceService "nope"');
  });

  it('uses the #index label in non-empty-id error messages when id is empty', () => {
    // An empty-id connector that ALSO has an unknown source: the source error's
    // label must fall back to "#<index>", proving the `label` ternary picks the
    // index branch (and that index is the real array position, here #1).
    const errors = validateConnectors([
      makeConnector(),
      makeConnector({ id: '', sourceService: 'nope' as Connector['sourceService'] }),
    ]);
    const sourceErr = errors.find((e) => e.code === 'unknown-source');
    expect(sourceErr?.connectorId).toBe('#1');
    expect(sourceErr?.message).toBe('connector "#1" has unknown sourceService "nope"');
  });

  it('flags an unknown sourceService', () => {
    const errors = validateConnectors([
      makeConnector({ sourceService: 'not-real' as Connector['sourceService'] }),
    ]);
    expect(errors.map((e) => e.code)).toEqual(['unknown-source']);
    expect(errors[0]!.message).toBe(
      'connector "shopify-to-slack" has unknown sourceService "not-real"',
    );
  });

  it('flags an unknown targetService', () => {
    const errors = validateConnectors([
      makeConnector({ targetService: 'not-real' as Connector['targetService'] }),
    ]);
    expect(errors.map((e) => e.code)).toEqual(['unknown-target']);
    expect(errors[0]!.message).toBe(
      'connector "shopify-to-slack" has unknown targetService "not-real"',
    );
  });

  it('flags an unknown capability', () => {
    const errors = validateConnectors([
      makeConnector({ capability: 'beam' as Connector['capability'] }),
    ]);
    expect(errors.map((e) => e.code)).toEqual(['unknown-capability']);
    expect(errors[0]!.message).toBe(
      'connector "shopify-to-slack" has unknown capability "beam"',
    );
  });

  it('flags a duplicate id only on the second occurrence', () => {
    const errors = validateConnectors([
      makeConnector({ id: 'dup' }),
      makeConnector({ id: 'dup', targetService: 'notion' }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('duplicate-id');
    expect(errors[0]!.connectorId).toBe('dup');
    expect(errors[0]!.message).toBe('duplicate connector id "dup"');
  });

  it('does not report duplicate-id for distinct ids', () => {
    const errors = validateConnectors([
      makeConnector({ id: 'a' }),
      makeConnector({ id: 'b' }),
      makeConnector({ id: 'c' }),
    ]);
    expect(errors).toEqual([]);
  });

  it('does not double-count an empty id as a duplicate', () => {
    // Two empty ids: each reported as empty-id, but NOT as duplicate-id
    // (the duplicate check is skipped for falsy ids).
    const errors = validateConnectors([makeConnector({ id: '' }), makeConnector({ id: '' })]);
    expect(errors.map((e) => e.code)).toEqual(['empty-id', 'empty-id']);
    expect(errors.some((e) => e.code === 'duplicate-id')).toBe(false);
  });

  it('allows a self-connector where source === target', () => {
    const errors = validateConnectors([
      makeConnector({ id: 'self', sourceService: 'shopify', targetService: 'shopify', capability: 'export' }),
    ]);
    expect(errors).toEqual([]);
  });

  it('accumulates multiple errors from a single connector', () => {
    const errors = validateConnectors([
      makeConnector({
        id: '',
        sourceService: 'x' as Connector['sourceService'],
        targetService: 'y' as Connector['targetService'],
        capability: 'z' as Connector['capability'],
      }),
    ]);
    expect(errors.map((e) => e.code).sort()).toEqual(
      ['empty-id', 'unknown-capability', 'unknown-source', 'unknown-target'].sort(),
    );
  });

  it('returns an empty array for an empty connector list', () => {
    expect(validateConnectors([])).toEqual([]);
  });
});

// --- buildConnectorRegistry ----------------------------------------------

describe('buildConnectorRegistry', () => {
  it('indexes valid connectors by id and preserves input order in .all', () => {
    const a = makeConnector({ id: 'a' });
    const b = makeConnector({ id: 'b', targetService: 'notion' });
    const registry = buildConnectorRegistry([a, b]);
    expect(registry.all).toEqual([a, b]);
    expect(registry.byId.get('a')).toBe(a);
    expect(registry.byId.get('b')).toBe(b);
    expect(registry.byId.size).toBe(2);
  });

  it('throws with an aggregated message when validation fails', () => {
    expect(() => buildConnectorRegistry([makeConnector({ id: 'dup' }), makeConnector({ id: 'dup' })])).toThrow(
      /1 validation error/,
    );
  });

  it('attaches the structured errors array to the thrown error', () => {
    let thrown: unknown;
    try {
      buildConnectorRegistry([makeConnector({ id: '' })]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const err = thrown as Error & { errors: { code: string }[] };
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]!.code).toBe('empty-id');
    expect(err.message).toContain('empty id');
  });

  it('joins multiple error messages with "; "', () => {
    expect(() =>
      buildConnectorRegistry([
        makeConnector({ id: 'dup' }),
        makeConnector({ id: 'dup' }),
        makeConnector({ id: 'bad', sourceService: 'nope' as Connector['sourceService'] }),
      ]),
    ).toThrow(/2 validation error\(s\):.*;/);
  });

  it('builds an empty registry from an empty list', () => {
    const registry = buildConnectorRegistry([]);
    expect(registry.all).toEqual([]);
    expect(registry.byId.size).toBe(0);
  });
});

// --- resolveConnectors ---------------------------------------------------

describe('resolveConnectors', () => {
  // NOTE: factories (not describe-scope consts) so that buildConnectorRegistry
  // is invoked *inside* each test — a describe-scope call runs during test-file
  // collection, which makes Stryker classify the function-under-test's mutants
  // as `static` (testsCompleted=0) and they can never be killed per-test.
  const fixtures = () => {
    const slackNotify = makeConnector({ id: 'shop-slack', sourceService: 'shopify', targetService: 'slack', capability: 'notify' });
    const notionRecord = makeConnector({ id: 'shop-notion', sourceService: 'shopify', targetService: 'notion', capability: 'record' });
    const githubSync = makeConnector({ id: 'gh-linear', sourceService: 'github', targetService: 'linear', capability: 'sync' });
    const registry = buildConnectorRegistry([slackNotify, notionRecord, githubSync]);
    return { slackNotify, notionRecord, githubSync, registry };
  };

  it('returns all connectors for an empty query', () => {
    const { slackNotify, notionRecord, githubSync, registry } = fixtures();
    expect(resolveConnectors(registry, {})).toEqual([slackNotify, notionRecord, githubSync]);
  });

  it('filters by sourceService', () => {
    const { slackNotify, notionRecord, githubSync, registry } = fixtures();
    expect(resolveConnectors(registry, { sourceService: 'shopify' })).toEqual([slackNotify, notionRecord]);
    expect(resolveConnectors(registry, { sourceService: 'github' })).toEqual([githubSync]);
  });

  it('filters by capability', () => {
    const { slackNotify, notionRecord, registry } = fixtures();
    expect(resolveConnectors(registry, { capability: 'notify' })).toEqual([slackNotify]);
    expect(resolveConnectors(registry, { capability: 'record' })).toEqual([notionRecord]);
  });

  it('filters by targetService', () => {
    const { slackNotify, githubSync, registry } = fixtures();
    expect(resolveConnectors(registry, { targetService: 'slack' })).toEqual([slackNotify]);
    expect(resolveConnectors(registry, { targetService: 'linear' })).toEqual([githubSync]);
  });

  it('ANDs all three conditions together', () => {
    const { slackNotify, registry } = fixtures();
    expect(
      resolveConnectors(registry, { sourceService: 'shopify', capability: 'notify', targetService: 'slack' }),
    ).toEqual([slackNotify]);
    // source matches but capability does not → no result
    expect(
      resolveConnectors(registry, { sourceService: 'shopify', capability: 'sync' }),
    ).toEqual([]);
    // capability matches but target does not → no result
    expect(
      resolveConnectors(registry, { capability: 'notify', targetService: 'notion' }),
    ).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    const { registry } = fixtures();
    expect(resolveConnectors(registry, { sourceService: 'stripe' })).toEqual([]);
  });

  it('preserves registry order in the result', () => {
    const { registry } = fixtures();
    const result = resolveConnectors(registry, {});
    expect(result.map((c) => c.id)).toEqual(['shop-slack', 'shop-notion', 'gh-linear']);
  });
});

// --- applyFieldMap -------------------------------------------------------

describe('applyFieldMap', () => {
  it('copies values from source keys to target keys', () => {
    const map: FieldMap = [
      { from: 'orderId', to: 'id' },
      { from: 'orderName', to: 'name' },
    ];
    expect(applyFieldMap({ orderId: '123', orderName: '#1001' }, map)).toEqual({ id: '123', name: '#1001' });
  });

  it('applies a transform to present values', () => {
    const map: FieldMap = [{ from: 'total', to: 'amount', transform: (v) => Number(v) * 2 }];
    expect(applyFieldMap({ total: 50 }, map)).toEqual({ amount: 100 });
  });

  it('does not apply the transform to a missing value (uses fallback instead)', () => {
    const transform = (v: unknown) => `transformed:${String(v)}`;
    const map: FieldMap = [{ from: 'missing', to: 'x', transform, fallback: 'default' }];
    // fallback must NOT be passed through transform
    expect(applyFieldMap({}, map)).toEqual({ x: 'default' });
  });

  it('uses fallback when the source key is undefined', () => {
    const map: FieldMap = [{ from: 'currency', to: 'cur', fallback: 'JPY' }];
    expect(applyFieldMap({}, map)).toEqual({ cur: 'JPY' });
  });

  it('prefers the actual value over fallback when present', () => {
    const map: FieldMap = [{ from: 'currency', to: 'cur', fallback: 'JPY' }];
    expect(applyFieldMap({ currency: 'USD' }, map)).toEqual({ cur: 'USD' });
  });

  it('writes undefined when missing, no fallback, and skipIfMissing is false (default)', () => {
    const map: FieldMap = [{ from: 'missing', to: 'x' }];
    const out = applyFieldMap({}, map);
    expect('x' in out).toBe(true);
    expect(out.x).toBeUndefined();
  });

  it('skips the key entirely when missing, no fallback, and skipIfMissing is true', () => {
    const map: FieldMap = [{ from: 'missing', to: 'x', skipIfMissing: true }];
    const out = applyFieldMap({}, map);
    expect('x' in out).toBe(false);
    expect(out).toEqual({});
  });

  it('fallback wins over skipIfMissing when both are set and value missing', () => {
    const map: FieldMap = [{ from: 'missing', to: 'x', skipIfMissing: true, fallback: 'fb' }];
    expect(applyFieldMap({}, map)).toEqual({ x: 'fb' });
  });

  it('treats an explicit undefined value the same as a missing key', () => {
    const map: FieldMap = [{ from: 'k', to: 'x', skipIfMissing: true }];
    expect(applyFieldMap({ k: undefined }, map)).toEqual({});
  });

  it('preserves falsy-but-defined values (0, "", false, null) without using fallback', () => {
    const map: FieldMap = [
      { from: 'zero', to: 'z', fallback: 99 },
      { from: 'empty', to: 'e', fallback: 'x' },
      { from: 'bool', to: 'b', fallback: true },
      { from: 'nul', to: 'n', fallback: 'y' },
    ];
    expect(applyFieldMap({ zero: 0, empty: '', bool: false, nul: null }, map)).toEqual({
      z: 0,
      e: '',
      b: false,
      n: null,
    });
  });

  it('applies transform to a falsy-but-defined value', () => {
    const map: FieldMap = [{ from: 'zero', to: 'z', transform: (v) => `${String(v)}!` }];
    expect(applyFieldMap({ zero: 0 }, map)).toEqual({ z: '0!' });
  });

  it('lets a later rule overwrite an earlier rule targeting the same key (last wins)', () => {
    const map: FieldMap = [
      { from: 'a', to: 'out' },
      { from: 'b', to: 'out' },
    ];
    expect(applyFieldMap({ a: 1, b: 2 }, map)).toEqual({ out: 2 });
  });

  it('returns an empty object for an empty field map', () => {
    expect(applyFieldMap({ a: 1 }, [])).toEqual({});
  });

  it('is decided per-rule: mixes skipped and written keys', () => {
    const map: FieldMap = [
      { from: 'present', to: 'p' },
      { from: 'gone', to: 'g', skipIfMissing: true },
    ];
    expect(applyFieldMap({ present: 'v' }, map)).toEqual({ p: 'v' });
  });
});

// --- isValidSemver -------------------------------------------------------

describe('isValidSemver', () => {
  it('accepts plain MAJOR.MINOR.PATCH', () => {
    expect(isValidSemver('1.2.3')).toBe(true);
    expect(isValidSemver('0.0.0')).toBe(true);
    expect(isValidSemver('10.20.30')).toBe(true);
  });

  it('accepts a prerelease tag', () => {
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-alpha.1')).toBe(true);
    expect(isValidSemver('1.0.0-0.3.7')).toBe(true);
    expect(isValidSemver('1.0.0-rc.1')).toBe(true);
  });

  it('accepts numeric / mixed prerelease identifiers (regex-mutation tripwires)', () => {
    // Each input distinguishes one specific Regex mutant of the prerelease
    // grammar `(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.<same>)*` — they
    // are all valid semver, so any `\d*→\d` / `\d→\D` / dropped-`*` mutation
    // narrows the language and rejects one of them.
    expect(isValidSemver('1.0.0-1')).toBe(true); // single-digit first segment
    expect(isValidSemver('1.0.0-12')).toBe(true); // multi-digit first segment
    expect(isValidSemver('1.0.0-1a')).toBe(true); // digits-then-letter identifier
    expect(isValidSemver('1.0.0-a.12')).toBe(true); // multi-digit continuation segment
    expect(isValidSemver('1.0.0-1a.2b')).toBe(true); // mixed segments in a chain
    expect(isValidSemver('1.0.0-alpha.beta')).toBe(true); // multi-char alnum continuation
  });

  it('accepts build metadata', () => {
    expect(isValidSemver('1.0.0+build.1')).toBe(true);
    expect(isValidSemver('1.0.0-beta+exp.sha.5114f85')).toBe(true);
  });

  it('rejects missing components', () => {
    expect(isValidSemver('1')).toBe(false);
    expect(isValidSemver('1.2')).toBe(false);
    expect(isValidSemver('1.2.3.4')).toBe(false);
  });

  it('rejects leading zeros in numeric identifiers', () => {
    expect(isValidSemver('01.2.3')).toBe(false);
    expect(isValidSemver('1.02.3')).toBe(false);
    expect(isValidSemver('1.2.03')).toBe(false);
    expect(isValidSemver('1.0.0-01')).toBe(false);
  });

  it('rejects a leading "v" or whitespace', () => {
    expect(isValidSemver('v1.2.3')).toBe(false);
    expect(isValidSemver(' 1.2.3')).toBe(false);
    expect(isValidSemver('1.2.3 ')).toBe(false);
  });

  it('rejects non-numeric components and empty strings', () => {
    expect(isValidSemver('a.b.c')).toBe(false);
    expect(isValidSemver('1.x.0')).toBe(false);
    expect(isValidSemver('')).toBe(false);
  });

  it('rejects an empty prerelease segment', () => {
    expect(isValidSemver('1.0.0-')).toBe(false);
    expect(isValidSemver('1.0.0-alpha..1')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidSemver(123)).toBe(false);
    expect(isValidSemver(null)).toBe(false);
    expect(isValidSemver(undefined)).toBe(false);
    expect(isValidSemver({})).toBe(false);
    expect(isValidSemver(['1.2.3'])).toBe(false);
  });

  it('accepts alphanumeric prerelease identifiers with hyphens', () => {
    expect(isValidSemver('1.0.0-x-y-z.--')).toBe(true);
    expect(isValidSemver('1.0.0-alpha-beta')).toBe(true);
  });
});

// --- plugin whitelists ---------------------------------------------------

describe('PLUGIN_PERMISSIONS / PLUGIN_HOOKS', () => {
  it('expose the documented permission whitelist', () => {
    expect([...PLUGIN_PERMISSIONS]).toEqual([
      'read:snapshot',
      'write:action',
      'network:proxy',
      'storage:library',
      'ui:panel',
    ]);
  });

  it('expose the documented hook whitelist', () => {
    expect([...PLUGIN_HOOKS]).toEqual([
      'onSnapshotLoad',
      'onActionInvoke',
      'onConnectorResolve',
      'onRender',
    ]);
  });
});

// --- validatePlugin ------------------------------------------------------

describe('validatePlugin', () => {
  it('returns no errors for a fully valid manifest', () => {
    expect(validatePlugin(makePlugin())).toEqual([]);
  });

  it('flags an empty plugin id', () => {
    const errors = validatePlugin(makePlugin({ id: '' }));
    expect(errors.map((e) => e.code)).toContain('empty-id');
    expect(errors.find((e) => e.code === 'empty-id')?.message).toBe('plugin has an empty id');
  });

  it('flags an invalid semver version', () => {
    const errors = validatePlugin(makePlugin({ version: '1.0' }));
    expect(errors.map((e) => e.code)).toContain('invalid-version');
    expect(errors.find((e) => e.code === 'invalid-version')?.message).toContain('"1.0"');
  });

  it('flags an unknown permission', () => {
    const errors = validatePlugin(makePlugin({ permissions: ['read:snapshot', 'delete:everything'] }));
    const perm = errors.find((e) => e.code === 'unknown-permission');
    expect(perm?.message).toBe('unknown permission "delete:everything"');
  });

  it('flags a duplicate permission only once (second occurrence)', () => {
    const errors = validatePlugin(makePlugin({ permissions: ['ui:panel', 'ui:panel'] }));
    const dups = errors.filter((e) => e.code === 'duplicate-permission');
    expect(dups).toHaveLength(1);
    expect(dups[0]!.message).toBe('duplicate permission "ui:panel"');
  });

  it('flags an unknown hook', () => {
    const errors = validatePlugin(makePlugin({ hooks: ['onBoom'] }));
    const hook = errors.find((e) => e.code === 'unknown-hook');
    expect(hook?.message).toBe('unknown hook "onBoom"');
  });

  it('flags a duplicate hook only once', () => {
    const errors = validatePlugin(makePlugin({ hooks: ['onRender', 'onRender'] }));
    const dups = errors.filter((e) => e.code === 'duplicate-hook');
    expect(dups).toHaveLength(1);
    expect(dups[0]!.message).toBe('duplicate hook "onRender"');
  });

  it('wraps bundled connector errors under code connector-error with the connector id', () => {
    const errors = validatePlugin(
      makePlugin({ connectors: [makeConnector({ id: 'broken', capability: 'nope' as Connector['capability'] })] }),
    );
    const ce = errors.find((e) => e.code === 'connector-error');
    expect(ce).toBeDefined();
    expect(ce?.message).toContain('connector "broken"');
    expect(ce?.message).toContain('unknown capability');
  });

  it('accumulates errors across all dimensions', () => {
    const errors = validatePlugin(
      makePlugin({
        id: '',
        version: 'bad',
        permissions: ['nope'],
        hooks: ['boom'],
        connectors: [makeConnector({ id: '' })],
      }),
    );
    const codes = errors.map((e) => e.code);
    expect(codes).toContain('empty-id');
    expect(codes).toContain('invalid-version');
    expect(codes).toContain('unknown-permission');
    expect(codes).toContain('unknown-hook');
    expect(codes).toContain('connector-error');
  });

  it('accepts empty permission/hook/connector arrays', () => {
    expect(validatePlugin(makePlugin({ permissions: [], hooks: [], connectors: [] }))).toEqual([]);
  });

  it('does not report duplicate for distinct permissions and hooks', () => {
    const errors = validatePlugin(
      makePlugin({
        permissions: ['read:snapshot', 'write:action', 'ui:panel'],
        hooks: ['onRender', 'onActionInvoke'],
      }),
    );
    expect(errors).toEqual([]);
  });
});

describe('isPluginValid', () => {
  it('is true when validatePlugin returns no errors', () => {
    expect(isPluginValid(makePlugin())).toBe(true);
  });

  it('is false when validatePlugin returns at least one error', () => {
    expect(isPluginValid(makePlugin({ version: 'nope' }))).toBe(false);
  });
});

// --- isPermitted ---------------------------------------------------------

describe('isPermitted', () => {
  it('returns true for a whitelisted permission the plugin declares', () => {
    const plugin = makePlugin({ permissions: ['read:snapshot', 'network:proxy'] });
    expect(isPermitted(plugin, 'read:snapshot')).toBe(true);
    expect(isPermitted(plugin, 'network:proxy')).toBe(true);
  });

  it('returns false for a whitelisted permission the plugin does not declare', () => {
    const plugin = makePlugin({ permissions: ['read:snapshot'] });
    expect(isPermitted(plugin, 'write:action')).toBe(false);
  });

  it('returns false for a non-whitelisted permission even if the plugin declares it', () => {
    // A plugin could carry a bogus permission string; isPermitted must still
    // reject anything outside the whitelist (defense in depth).
    const plugin = makePlugin({ permissions: ['superuser'] });
    expect(isPermitted(plugin, 'superuser')).toBe(false);
  });

  it('returns false for prototype-chain strings', () => {
    const plugin = makePlugin();
    expect(isPermitted(plugin, '__proto__')).toBe(false);
    expect(isPermitted(plugin, 'constructor')).toBe(false);
  });

  it('returns false for an empty permission string', () => {
    expect(isPermitted(makePlugin(), '')).toBe(false);
  });
});
