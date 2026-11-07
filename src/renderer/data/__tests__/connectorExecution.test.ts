import { describe, expect, it, vi } from 'vitest';
import {
  targetKind,
  describeExecution,
  executeFreeConnector,
  CONNECTOR_OUTPUT_COLLECTION,
  type ConnectorSinks,
} from '../connectorExecution';
import { FREE_CONNECTOR_REGISTRY } from '../../../shared/connectors/freeConnectors';
import { CATALOG_REGISTRY, planConnectorRun } from '../../../shared/connectors/connectorCatalog';
import { buildConnectorRegistry, type Connector } from '../../../shared/connectors/connectorRegistry';

function mockSinks(): ConnectorSinks & {
  lib: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof vi.fn>;
} {
  const lib = vi.fn<ConnectorSinks['putLibrary']>().mockResolvedValue(undefined);
  const store = vi.fn<ConnectorSinks['insertStorage']>().mockResolvedValue(undefined);
  return { putLibrary: lib, insertStorage: store, lib, store };
}

describe('CONNECTOR_OUTPUT_COLLECTION', () => {
  it('is the documented storage collection name', () => {
    expect(CONNECTOR_OUTPUT_COLLECTION).toBe('connector-output');
  });
});

describe('targetKind', () => {
  it('maps library / storage / everything-else', () => {
    expect(targetKind('library')).toBe('library');
    expect(targetKind('storage')).toBe('storage');
    expect(targetKind('notion')).toBe('unsupported');
    expect(targetKind('')).toBe('unsupported');
  });
});

describe('describeExecution', () => {
  it('derives key from the first non-empty payload value, filename from id, body from payload', () => {
    const plan = planConnectorRun(FREE_CONNECTOR_REGISTRY, 'stocks-to-storage-export', {
      symbol: '7203',
      price: 2800,
      name: 'トヨタ',
    });
    expect(describeExecution(plan)).toEqual({
      kind: 'storage',
      key: '7203',
      filename: 'stocks-to-storage-export.json',
      body: JSON.stringify({ key: '7203', value: 2800, label: 'トヨタ' }),
    });
  });

  it('skips a leading undefined value and uses the next defined one as the key', () => {
    // overview-to-storage-export: metric 欠損 → key:undefined (書込), value あり, unit skip。
    // payload = { key: undefined, value: 8200000 } → find は undefined を飛ばし value を採る。
    const plan = planConnectorRun(FREE_CONNECTOR_REGISTRY, 'overview-to-storage-export', {
      value: 8_200_000,
    });
    expect(plan.payload).toEqual({ key: undefined, value: 8_200_000 });
    expect(describeExecution(plan).key).toBe('8200000');
  });

  it('falls back to connectorId when every payload value is undefined', () => {
    const plan = planConnectorRun(FREE_CONNECTOR_REGISTRY, 'overview-to-storage-export', {});
    // payload: { key: undefined, value: undefined } (unit は skip) → 非空値なし → id。
    expect(describeExecution(plan).key).toBe('overview-to-storage-export');
  });

  it('classifies a library-targeted connector', () => {
    const plan = planConnectorRun(FREE_CONNECTOR_REGISTRY, 'kpi-to-library-record', {
      metric: 'MRR',
      value: 120000,
    });
    const d = describeExecution(plan);
    expect(d.kind).toBe('library');
    expect(d.filename).toBe('kpi-to-library-record.json');
    expect(d.key).toBe('MRR');
  });
});

describe('executeFreeConnector', () => {
  it('writes a storage-target connector to the record store (not the library)', async () => {
    const sinks = mockSinks();
    const result = await executeFreeConnector(
      FREE_CONNECTOR_REGISTRY,
      'stocks-to-storage-export',
      { symbol: '7203', price: 2800, name: 'トヨタ' },
      sinks,
    );
    expect(result).toEqual({
      ok: true,
      connectorId: 'stocks-to-storage-export',
      target: 'storage',
      message: 'ストレージに「7203」を記録しました。',
    });
    expect(sinks.store).toHaveBeenCalledWith(CONNECTOR_OUTPUT_COLLECTION, {
      connectorId: 'stocks-to-storage-export',
      key: '7203',
      payload: { key: '7203', value: 2800, label: 'トヨタ' },
    });
    expect(sinks.lib).not.toHaveBeenCalled();
  });

  it('writes a library-target connector to the library (not the store)', async () => {
    const sinks = mockSinks();
    const result = await executeFreeConnector(
      FREE_CONNECTOR_REGISTRY,
      'kpi-to-library-record',
      { metric: 'MRR', value: 120000 },
      sinks,
    );
    expect(result.ok).toBe(true);
    expect(result.target).toBe('library');
    expect(result.message).toContain('kpi-to-library-record.json');
    expect(sinks.lib).toHaveBeenCalledWith(
      'connectors',
      'kpi-to-library-record.json',
      'application/json',
      JSON.stringify({ Title: 'MRR', Amount: 120000, Label: 'monthly' }),
    );
    expect(sinks.store).not.toHaveBeenCalled();
  });

  it('refuses an auth-required connector without writing anything', async () => {
    const sinks = mockSinks();
    const result = await executeFreeConnector(
      CATALOG_REGISTRY,
      'microsoft-365-to-storage-export',
      { subject: '請求書' },
      sinks,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('認証が必要');
    expect(sinks.lib).not.toHaveBeenCalled();
    expect(sinks.store).not.toHaveBeenCalled();
  });

  it('refuses an auth-required connector targeting a non-local service (auth guard first)', async () => {
    const sinks = mockSinks();
    const result = await executeFreeConnector(
      CATALOG_REGISTRY,
      'sentry-to-linear-record',
      { culprit: 'x', permalink: 'y' },
      sinks,
    );
    expect(result.ok).toBe(false);
    expect(sinks.lib).not.toHaveBeenCalled();
    expect(sinks.store).not.toHaveBeenCalled();
  });

  it('returns ok=false for a no-auth connector whose target is not a local sink', async () => {
    // 実カタログには「no-auth かつ非ローカル target」は無いため、未対応分岐の検証用に
    // 仮レジストリを組む (requiresAuth=false / target=notion)。
    const odd: Connector = {
      id: 'odd-to-notion',
      sourceService: 'kpi',
      targetService: 'notion',
      capability: 'record',
      fieldMap: [{ from: 'metric', to: 'Title' }],
      requiresAuth: false,
      description: 'テスト用: ローカルでない target',
    };
    const reg = buildConnectorRegistry([odd]);
    const sinks = mockSinks();
    const result = await executeFreeConnector(reg, 'odd-to-notion', { metric: 'X' }, sinks);
    expect(result).toEqual({
      ok: false,
      connectorId: 'odd-to-notion',
      target: 'notion',
      message: 'ターゲット "notion" への実実行は未対応です。',
    });
    expect(sinks.lib).not.toHaveBeenCalled();
    expect(sinks.store).not.toHaveBeenCalled();
  });

  it('throws for an unknown connector id', async () => {
    const sinks = mockSinks();
    await expect(
      executeFreeConnector(FREE_CONNECTOR_REGISTRY, 'does-not-exist', {}, sinks),
    ).rejects.toThrow('unknown connector: does-not-exist');
  });
});
