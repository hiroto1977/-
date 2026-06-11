import { describe, expect, it } from 'vitest';
import {
  isFieldSatisfied,
  planOrderFanout,
  runnableActions,
  skippedDecisions,
  uniqueRequiredFields,
  validateFanoutConnectors,
  type ConnectorMeta,
  type FanoutError,
} from '../orderFanout';
import { SHOPIFY_CONNECTOR_META } from '../shopifyConnectorMeta';

/** shopify.ts の listConnectors() 返却形と互換のフィクスチャ (main は import しない)。 */
const SEVEN: readonly ConnectorMeta[] = [
  { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token', 'channel'] },
  { id: 'discord', action: 'sync-to-discord', label: 'Discord', requiredFields: ['webhookUrl'] },
  { id: 'line', action: 'sync-to-line', label: 'LINE', requiredFields: ['token', 'to'] },
  { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] },
  { id: 'notion', action: 'sync-to-notion', label: 'Notion', requiredFields: ['token', 'databaseId'] },
  { id: 'salesforce', action: 'sync-to-salesforce', label: 'Salesforce', requiredFields: ['token', 'instanceUrl'] },
  { id: 'stripe', action: 'sync-to-stripe', label: 'Stripe', requiredFields: ['token'] },
];

describe('isFieldSatisfied', () => {
  it('treats undefined as missing', () => {
    expect(isFieldSatisfied(undefined)).toBe(false);
  });

  it('treats null as missing', () => {
    expect(isFieldSatisfied(null)).toBe(false);
  });

  it('treats the empty string as missing', () => {
    expect(isFieldSatisfied('')).toBe(false);
  });

  it('treats 0 as satisfied (falsy-but-defined)', () => {
    expect(isFieldSatisfied(0)).toBe(true);
  });

  it('treats false as satisfied', () => {
    expect(isFieldSatisfied(false)).toBe(true);
  });

  it('treats a whitespace-only string as satisfied', () => {
    expect(isFieldSatisfied(' ')).toBe(true);
  });

  it('treats a non-empty string as satisfied', () => {
    expect(isFieldSatisfied('tok')).toBe(true);
  });
});

describe('validateFanoutConnectors', () => {
  it('returns no errors for the seven-connector fixture', () => {
    expect(validateFanoutConnectors(SEVEN)).toEqual([]);
  });

  it('does not double-report an empty id as a duplicate', () => {
    const twoEmpty: ConnectorMeta[] = [
      { id: '', action: 'a1', label: 'A', requiredFields: [] },
      { id: '', action: 'a2', label: 'B', requiredFields: [] },
    ];
    const errors = validateFanoutConnectors(twoEmpty);
    expect(errors).toEqual<FanoutError[]>([
      { code: 'empty-id', connectorId: '#0', message: 'connector #0 has an empty id' },
      { code: 'empty-id', connectorId: '#1', message: 'connector #1 has an empty id' },
    ]);
  });

  it('reports an empty action with the connector id as label', () => {
    const errors = validateFanoutConnectors([{ id: 'x', action: '', label: 'X', requiredFields: [] }]);
    expect(errors).toEqual<FanoutError[]>([
      { code: 'empty-action', connectorId: 'x', message: 'connector "x" has an empty action' },
    ]);
  });

  it('does not double-report an empty action as a duplicate', () => {
    const errors = validateFanoutConnectors([
      { id: 'a', action: '', label: 'A', requiredFields: [] },
      { id: 'b', action: '', label: 'B', requiredFields: [] },
    ]);
    expect(errors.map((e) => e.code)).toEqual(['empty-action', 'empty-action']);
  });
});

describe('planOrderFanout', () => {
  it('plans an empty connector list as an empty plan with zero counts', () => {
    expect(planOrderFanout([], {})).toEqual({ decisions: [], runnableCount: 0, skippedCount: 0 });
  });

  it('marks every connector runnable when all required fields are present', () => {
    const payload = {
      token: 't',
      channel: 'C1',
      webhookUrl: 'https://example.com/wh',
      to: 'U1',
      databaseId: 'db1',
      instanceUrl: 'https://example.my.salesforce.com',
    };
    const plan = planOrderFanout(SEVEN, payload);
    expect(plan.runnableCount).toBe(7);
    expect(plan.skippedCount).toBe(0);
    expect(plan.decisions.every((d) => d.runnable && d.missingFields.length === 0)).toBe(true);
  });

  it('marks every connector skipped when the payload is empty', () => {
    const plan = planOrderFanout(SEVEN, {});
    expect(plan.runnableCount).toBe(0);
    expect(plan.skippedCount).toBe(7);
    expect(plan.decisions.every((d) => !d.runnable)).toBe(true);
  });

  it('splits a mixed payload into runnable and skipped with exact decisions', () => {
    // 非対称構成 (runnable 2 / skipped 1) で全文照合し、count 入れ替え変異を撃墜する。
    const three: ConnectorMeta[] = [
      { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token', 'channel'] },
      { id: 'discord', action: 'sync-to-discord', label: 'Discord', requiredFields: ['webhookUrl'] },
      { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] },
    ];
    const plan = planOrderFanout(three, { token: 't', channel: 'C1' });
    expect(plan).toEqual({
      decisions: [
        { id: 'slack', action: 'sync-to-slack', label: 'Slack', runnable: true, missingFields: [] },
        {
          id: 'discord',
          action: 'sync-to-discord',
          label: 'Discord',
          runnable: false,
          missingFields: ['webhookUrl'],
        },
        { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', runnable: true, missingFields: [] },
      ],
      runnableCount: 2,
      skippedCount: 1,
    });
  });

  it('marks a connector with empty requiredFields runnable even against an empty payload', () => {
    const plan = planOrderFanout([{ id: 'log', action: 'log', label: 'Log', requiredFields: [] }], {});
    expect(plan.decisions[0]).toEqual({
      id: 'log',
      action: 'log',
      label: 'Log',
      runnable: true,
      missingFields: [],
    });
  });

  it('ignores extra payload keys that no connector requires', () => {
    const plan = planOrderFanout(
      [{ id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] }],
      { token: 't', order: { id: '1', name: '#1001' }, unrelated: 'x' },
    );
    expect(plan.runnableCount).toBe(1);
  });

  it('lists missingFields in requiredFields declaration order when both are missing', () => {
    const plan = planOrderFanout(SEVEN, {});
    expect(plan.decisions[0]!.missingFields).toEqual(['token', 'channel']);
  });

  it('reports only the second required field when the first is present', () => {
    const plan = planOrderFanout(SEVEN, { token: 't' });
    expect(plan.decisions[0]!.missingFields).toEqual(['channel']);
  });

  it('skips a connector whose required field is an empty string (matches executor guards)', () => {
    const plan = planOrderFanout(
      [{ id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] }],
      { token: '' },
    );
    expect(plan.decisions[0]!.runnable).toBe(false);
    expect(plan.decisions[0]!.missingFields).toEqual(['token']);
  });

  it('keeps a 0-valued required field runnable (falsy-but-defined)', () => {
    const plan = planOrderFanout([{ id: 'n', action: 'a', label: 'N', requiredFields: ['retries'] }], {
      retries: 0,
    });
    expect(plan.decisions[0]!.runnable).toBe(true);
  });

  it('preserves the input connector order in decisions', () => {
    const plan = planOrderFanout(SEVEN, {});
    expect(plan.decisions.map((d) => d.id)).toEqual([
      'slack',
      'discord',
      'line',
      'gmail',
      'notion',
      'salesforce',
      'stripe',
    ]);
  });

  it('throws an aggregated error for a duplicate connector id', () => {
    const dup: ConnectorMeta[] = [
      { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: [] },
      { id: 'slack', action: 'sync-to-slack-2', label: 'Slack2', requiredFields: [] },
    ];
    expect(() => planOrderFanout(dup, {})).toThrow(
      '[order-fanout] 1 validation error(s): duplicate connector id "slack"',
    );
  });

  it('throws for a duplicate action across distinct ids', () => {
    const dup: ConnectorMeta[] = [
      { id: 'a', action: 'same', label: 'A', requiredFields: [] },
      { id: 'b', action: 'same', label: 'B', requiredFields: [] },
    ];
    expect(() => planOrderFanout(dup, {})).toThrow(
      '[order-fanout] 1 validation error(s): duplicate connector action "same"',
    );
    // 構造化エラーの code も照合する (code 文字列の StringLiteral 変異を撃墜)。
    expect(validateFanoutConnectors(dup)).toEqual<FanoutError[]>([
      { code: 'duplicate-action', connectorId: 'b', message: 'duplicate connector action "same"' },
    ]);
  });

  it('aggregates multiple validation errors into one throw with the exact count', () => {
    const dup: ConnectorMeta[] = [
      { id: 'a', action: 'same', label: 'A', requiredFields: [] },
      { id: 'a', action: 'same', label: 'B', requiredFields: [] },
    ];
    expect(() => planOrderFanout(dup, {})).toThrow(
      '[order-fanout] 2 validation error(s): duplicate connector id "a"; duplicate connector action "same"',
    );
  });

  it('exposes structured errors on the thrown error object', () => {
    const dup: ConnectorMeta[] = [
      { id: 'a', action: 'x', label: 'A', requiredFields: [] },
      { id: 'a', action: 'y', label: 'B', requiredFields: [] },
    ];
    let thrown: (Error & { errors?: FanoutError[] }) | undefined;
    try {
      planOrderFanout(dup, {});
    } catch (e) {
      thrown = e as Error & { errors?: FanoutError[] };
    }
    expect(thrown?.errors).toEqual<FanoutError[]>([
      { code: 'duplicate-id', connectorId: 'a', message: 'duplicate connector id "a"' },
    ]);
  });

  it('returns the same plan for the same input (determinism)', () => {
    const payload = { token: 't' };
    expect(planOrderFanout(SEVEN, payload)).toEqual(planOrderFanout(SEVEN, payload));
  });

  it('does not mutate the connectors array or the payload', () => {
    const connectors = Object.freeze(
      SEVEN.map((c) => Object.freeze({ ...c, requiredFields: Object.freeze([...c.requiredFields]) })),
    ) as readonly ConnectorMeta[];
    const payload = Object.freeze({ token: 't' });
    const plan = planOrderFanout(connectors, payload);
    expect(plan.decisions).toHaveLength(7);
    expect(payload).toEqual({ token: 't' });
  });

  it('always satisfies runnableCount + skippedCount === decisions.length', () => {
    for (const payload of [{}, { token: 't' }, { token: 't', channel: 'C' }]) {
      const plan = planOrderFanout(SEVEN, payload);
      expect(plan.runnableCount + plan.skippedCount).toBe(plan.decisions.length);
    }
  });
});

describe('runnableActions / skippedDecisions', () => {
  it('returns runnable actions in input order', () => {
    const plan = planOrderFanout(SEVEN, { token: 't' });
    // token のみ充足 → 単一 required ['token'] の gmail / stripe だけが runnable。
    expect(runnableActions(plan)).toEqual(['sync-to-gmail', 'sync-to-stripe']);
  });

  it('returns an empty array for an all-skipped plan', () => {
    expect(runnableActions(planOrderFanout(SEVEN, {}))).toEqual([]);
  });

  it('extracts only non-runnable decisions preserving order', () => {
    const plan = planOrderFanout(SEVEN, { token: 't' });
    expect(skippedDecisions(plan).map((d) => d.id)).toEqual(['slack', 'discord', 'line', 'notion', 'salesforce']);
  });
});

describe('uniqueRequiredFields', () => {
  it('returns deduplicated fields in first-appearance order for the seven connectors', () => {
    expect(uniqueRequiredFields(SEVEN)).toEqual([
      'token',
      'channel',
      'webhookUrl',
      'to',
      'databaseId',
      'instanceUrl',
    ]);
  });

  it('returns an empty array for an empty connector list', () => {
    expect(uniqueRequiredFields([])).toEqual([]);
  });

  it('excludes empty field names', () => {
    expect(uniqueRequiredFields([{ id: 'a', action: 'x', label: 'A', requiredFields: ['', 'token'] }])).toEqual([
      'token',
    ]);
  });
});

describe('SHOPIFY_CONNECTOR_META (shared 単一の真実源)', () => {
  it('matches the local seven-connector fixture exactly', () => {
    // フィクスチャと shared メタの両方が main 側 listConnectors() と契約テストで
    // 結ばれる (shopify.test.ts)。ここでは shared 内の整合を固定する。
    expect(SHOPIFY_CONNECTOR_META).toEqual(SEVEN);
  });

  it('passes validation and plans without throwing', () => {
    expect(validateFanoutConnectors(SHOPIFY_CONNECTOR_META)).toEqual([]);
    expect(planOrderFanout(SHOPIFY_CONNECTOR_META, {}).decisions).toHaveLength(7);
  });
});
